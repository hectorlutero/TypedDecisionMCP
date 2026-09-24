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
import { PACKS } from "../packs/cursor.js";

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

/** `DECIDIR_GPU=0|cpu|false` forces CPU (needed when Vulkan OOMs on small laptop GPUs). */
function resolveGpuOption(env: NodeJS.ProcessEnv = process.env): "auto" | false | "cuda" | "vulkan" | "metal" {
  const raw = (env.DECIDIR_GPU ?? "auto").toLowerCase();
  if (raw === "0" || raw === "false" || raw === "cpu" || raw === "off") return false;
  if (raw === "cuda" || raw === "vulkan" || raw === "metal") return raw;
  return "auto";
}

export class LogitEngine implements DecisionEngine {
  private llama: Llama | undefined;
  private model: LlamaModel | undefined;
  private context: LlamaContext | undefined;
  private sequence: LlamaContextSequence | undefined;
  private readonly modelPath: string;
  private readonly priors = new Map<string, Record<string, number>>();
  private warm = false;

  constructor(modelPath = resolveModelPath()) {
    this.modelPath = modelPath;
  }

  isWarm(): boolean {
    return this.warm;
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
    this.llama = await getLlama({ gpu: resolveGpuOption() });
    this.model = await this.llama.loadModel({ modelPath: this.modelPath });
    this.context = await this.model.createContext({ contextSize: 512 });
    this.sequence = this.context.getSequence();
    await this.warmup();
    await this.warmPriors();
    this.warm = true;
  }

  private async warmup(): Promise<void> {
    const seq = this.requireSequence();
    const tokens = this.tokenizePrompt("warmup\n");
    await seq.evaluateWithoutGeneratingNewTokens(tokens);
    seq.clearHistory();
  }

  private async warmPriors(): Promise<void> {
    const model = this.requireModel();
    const questions: Question[] = [PACKS.comando.comando, PACKS.commit.commit];
    if (PACKS.diff.diff.type === "yesno") questions.push(PACKS.diff.diff);
    for (const question of questions) {
      const options = optionSpecs(question);
      const tokensByKey = Object.fromEntries(
        options.map((opt) => [
          opt.key,
          optionTokenIds({ tokenize: (text) => model.tokenize(text) as number[] }, opt.label)
        ])
      );
      await this.priorFor(question, options, tokensByKey);
    }
  }

  async score(state: State, questions: Questions): Promise<ScoreResult> {
    await this.init();
    const started = performance.now();
    const model = this.requireModel();
    const seq = this.requireSequence();
    const stateText = renderState(state);
    const answers: Answers = {};
    let promptTokens = 0;

    const trace = process.env.DECIDIR_TRACE === "1";
    for (const [id, question] of Object.entries(questions)) {
      const t0 = performance.now();
      const options = optionSpecs(question);
      const tokensByKey = Object.fromEntries(
        options.map((opt) => [
          opt.key,
          optionTokenIds({ tokenize: (text) => model.tokenize(text) as number[] }, opt.label)
        ])
      );
      const prompt = wrapForModel(buildPrompt(stateText, question, options));
      const tokens = this.tokenizePrompt(prompt);
      const tTokenize = performance.now();
      promptTokens += tokens.length;

      const { probs, prefix_reuse } = await this.nextTokenProbs(tokens);
      const tProbs = performance.now();
      const actual = optionMass(options.map((opt) => opt.key), tokensByKey, (token) => probs.get(token)?.probability ?? 0);
      const shouldCalibrate = calibrateEnabled() && question.type !== "choice";
      const priorKey = shouldCalibrate
        ? priorCacheKey(
            question.instructions,
            options.map((opt) => ({ key: opt.key, label: opt.label }))
          )
        : "";
      const priorCached = shouldCalibrate && this.priors.has(priorKey);
      const prior = shouldCalibrate
        ? await this.priorFor(question, options, tokensByKey)
        : Object.fromEntries(options.map((opt) => [opt.key, 1]));
      const tPrior = performance.now();
      if (trace) {
        console.error(
          JSON.stringify({
            id,
            tokenize_ms: tTokenize - t0,
            nextTokenProbs_ms: tProbs - tTokenize,
            prior_ms: tPrior - tProbs,
            prior_cached: priorCached,
            prefix_reuse,
            prompt_tokens: tokens.length
          })
        );
      }
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
    const { probs } = await this.nextTokenProbs(tokens);
    const prior = optionMass(options.map((opt) => opt.key), tokensByKey, (token) => probs.get(token)?.probability ?? 0);
    this.priors.set(key, prior);
    return prior;
  }

  /**
   * Reuse KV for the longest matching prompt prefix (Qwen envelope, and State when unchanged).
   * Falls back to a full eval when nothing overlaps (`adaptStateToTokens` + empty suffix).
   * Set `DECIDIR_KV=0` to force clearHistory every hop (ablation / debug).
   */
  private async nextTokenProbs(tokens: number[]): Promise<{ probs: ProbMap; prefix_reuse: number }> {
    const seq = this.requireSequence();
    if (tokens.length === 0) {
      throw new DecideError("invalid_request", "empty prompt");
    }
    const last = tokens[tokens.length - 1]!;
    const prefix = tokens.slice(0, -1);
    let prefix_reuse = 0;
    let suffix = prefix;
    if (process.env.DECIDIR_KV === "0") {
      await seq.clearHistory();
    } else {
      await seq.adaptStateToTokens(prefix as never, false);
      prefix_reuse = seq.nextTokenIndex;
      suffix = prefix.slice(prefix_reuse);
    }
    const input = [...suffix, [last, { generateNext: { probabilities: true } }] as const];
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
    return { probs: found, prefix_reuse };
  }

  async dispose(): Promise<void> {
    this.warm = false;
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

export function isEngineWarm(): boolean {
  return singleton?.isWarm() ?? false;
}
