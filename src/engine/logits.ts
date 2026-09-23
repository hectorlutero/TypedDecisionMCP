import { existsSync } from "node:fs";
import { getLlama, type Llama, type LlamaContext, type LlamaContextSequence, type LlamaModel } from "node-llama-cpp";
import {
  confidenceFromDistribution,
  DecideError,
  renderState,
  type Answer,
  type Answers,
  type Question,
  type Questions,
  type State
} from "../contract.js";
import { modelId, resolveModelPath } from "../model-path.js";
import { divideByPrior, optionMass, priorCacheKey } from "./calibrate.js";
import { buildPrompt, optionSpecs, wrapForModel, type OptionSpec } from "./prompt.js";
import { optionTokenIds } from "./tokenize.js";

export type ScoreResult = {
  answers: Answers;
  model: string;
  usage: { prompt_tokens: number; generated_tokens: 0 };
  latency_ms: number;
};

export type DecisionEngine = {
  score(state: State, questions: Questions): Promise<ScoreResult>;
  dispose(): Promise<void>;
};

type ProbMap = Map<number, { token: number; probability: number }>;

function asProbList(raw: unknown): Array<{ token: number; probability: number }> {
  if (raw instanceof Map) {
    return [...raw.entries()].map(([token, value]) => {
      if (typeof value === "number") return { token: Number(token), probability: value };
      if (value && typeof value === "object" && "probability" in value) {
        return { token: Number(token), probability: Number((value as { probability: number }).probability) };
      }
      return { token: Number(token), probability: 0 };
    });
  }
  if (Array.isArray(raw)) {
    return raw.map((row) => {
      if (row && typeof row === "object" && "token" in row && "probability" in row) {
        return { token: Number(row.token), probability: Number(row.probability) };
      }
      return { token: 0, probability: 0 };
    });
  }
  return [];
}

function calibrateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DECIDIR_CALIBRATE !== "0";
}

export class LogitEngine implements DecisionEngine {
  private llama: Llama | undefined;
  private model: LlamaModel | undefined;
  private context: LlamaContext | undefined;
  private sequence: LlamaContextSequence | undefined;
  private readonly modelPath: string;
  private readonly priors = new Map<string, Record<string, number>>();

  constructor(modelPath = resolveModelPath()) {
    this.modelPath = modelPath;
  }

  async init(): Promise<void> {
    if (this.sequence) return;
    if (!existsSync(this.modelPath)) {
      throw new DecideError(
        "model_missing",
        `GGUF not found at ${this.modelPath}. Run npm run fetch-model.`,
        503
      );
    }
    this.llama = await getLlama();
    this.model = await this.llama.loadModel({ modelPath: this.modelPath });
    this.context = await this.model.createContext({ contextSize: 2048 });
    this.sequence = this.context.getSequence();
    await this.warmup();
  }

  private async warmup(): Promise<void> {
    const seq = this.requireSequence();
    const tokens = this.tokenizePrompt("warmup\n");
    await seq.evaluateWithoutGeneratingNewTokens(tokens);
    seq.clearHistory();
  }

  async score(state: State, questions: Questions): Promise<ScoreResult> {
    await this.init();
    const started = performance.now();
    const model = this.requireModel();
    const seq = this.requireSequence();
    const stateText = renderState(state);
    const answers: Answers = {};
    let promptTokens = 0;

    for (const [id, question] of Object.entries(questions)) {
      const options = optionSpecs(question);
      const tokensByKey = Object.fromEntries(
        options.map((opt) => [
          opt.key,
          optionTokenIds({ tokenize: (text) => model.tokenize(text) as number[] }, opt.label)
        ])
      );
      const prompt = wrapForModel(buildPrompt(stateText, question, options));
      const tokens = this.tokenizePrompt(prompt);
      promptTokens += tokens.length;

      seq.clearHistory();
      const probs = await this.nextTokenProbs(tokens);
      const actual = optionMass(options.map((opt) => opt.key), tokensByKey, (token) => probs.get(token)?.probability ?? 0);
      const shouldCalibrate = calibrateEnabled() && question.type !== "choice";
      const prior = shouldCalibrate
        ? await this.priorFor(question, options, tokensByKey)
        : Object.fromEntries(options.map((opt) => [opt.key, 1]));
      answers[id] = toAnswer(question.type, options, divideByPrior(actual, prior));
    }

    return {
      answers,
      model: modelId(),
      usage: { prompt_tokens: promptTokens, generated_tokens: 0 },
      latency_ms: performance.now() - started
    };
  }

  private tokenizePrompt(prompt: string) {
    return this.requireModel().tokenize(prompt, true);
  }

  private async priorFor(
    question: Question,
    options: OptionSpec[],
    tokensByKey: Record<string, number[]>
  ): Promise<Record<string, number>> {
    const key = priorCacheKey(
      question.instructions,
      options.map((opt) => ({ key: opt.key, label: opt.label }))
    );
    const cached = this.priors.get(key);
    if (cached) return cached;

    const prompt = wrapForModel(buildPrompt("(empty)", question, options));
    const tokens = this.tokenizePrompt(prompt);
    this.requireSequence().clearHistory();
    const probs = await this.nextTokenProbs(tokens);
    const prior = optionMass(options.map((opt) => opt.key), tokensByKey, (token) => probs.get(token)?.probability ?? 0);
    this.priors.set(key, prior);
    return prior;
  }

  private async nextTokenProbs(tokens: number[]): Promise<ProbMap> {
    const seq = this.requireSequence();
    if (tokens.length === 0) {
      throw new DecideError("invalid_request", "empty prompt");
    }
    const input = tokens.map((token, i) =>
      i === tokens.length - 1 ? ([token, { generateNext: { probabilities: true } }] as const) : token
    );
    let found: ProbMap | undefined;
    await seq.controlledEvaluate(input as never, {
      onTokenResult: (_index: number, result: { next?: { probabilities?: unknown } }) => {
        const list = asProbList(result.next?.probabilities);
        found = new Map(list.map((row) => [row.token, row]));
      }
    });
    if (!found) {
      throw new DecideError("engine_error", "controlledEvaluate returned no probabilities", 500);
    }
    return found;
  }

  async dispose(): Promise<void> {
    this.priors.clear();
    this.sequence = undefined;
    await this.context?.dispose();
    this.context = undefined;
    await this.model?.dispose();
    this.model = undefined;
    await this.llama?.dispose();
    this.llama = undefined;
  }

  private requireModel(): LlamaModel {
    if (!this.model) throw new DecideError("engine_error", "model not loaded", 500);
    return this.model;
  }

  private requireSequence(): LlamaContextSequence {
    if (!this.sequence) throw new DecideError("engine_error", "sequence not loaded", 500);
    return this.sequence;
  }
}

function toAnswer(
  type: "yesno" | "choice" | "score",
  options: OptionSpec[],
  normalized: Record<string, number>
): Answer {
  if (type === "yesno") {
    return { type: "yesno", yes: normalized.yes ?? 0 };
  }
  const winner = options.reduce((best, opt) =>
    (normalized[opt.key] ?? 0) > (normalized[best.key] ?? 0) ? opt : best
  );
  const confidence = confidenceFromDistribution(normalized);
  if (type === "choice") {
    return {
      type: "choice",
      choice: winner.key,
      probabilities: normalized,
      confidence
    };
  }
  const legend = Object.fromEntries(options.map((opt) => [opt.key, opt.description]));
  const score = options.reduce((sum, opt) => sum + Number(opt.key) * (normalized[opt.key] ?? 0), 0);
  return {
    type: "score",
    score,
    legend,
    probabilities: normalized,
    confidence
  };
}

let singleton: LogitEngine | undefined;

export async function getLogitEngine(): Promise<LogitEngine> {
  if (!singleton) {
    singleton = new LogitEngine();
    await singleton.init();
  }
  return singleton;
}
