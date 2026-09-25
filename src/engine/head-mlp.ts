import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLlama, type Llama, type LlamaEmbeddingContext, type LlamaModel } from "node-llama-cpp";
import { DecideError, isRecord, renderState, type Answers, type Question, type Questions, type State } from "../contract.js";
import { envFirst } from "../env.js";
import { modelId, resolveModelPath } from "../model-path.js";
import {
  resolveGpuOption,
  toAnswer,
  type DecisionEngine,
  type ScoreResult
} from "./logits.js";
import { buildPrompt, optionSpecs, type OptionSpec } from "./prompt.js";

export type ProbeHead = {
  classes: string[];
  weights: number[][];
  bias: number[];
};

export type HeadMlpArtifact = {
  modelId: string;
  dim: number;
  heads: Record<string, ProbeHead>;
};

const DEFAULT_EMBED_CACHE = 128;
/** Short hop text fits well under 256; smaller context cuts embed cost. */
const EMBED_CONTEXT_SIZE = 256;

/** Same ruler as bench `chars/4` — avoid tokenizing the unused chat wrap on the hot path. */
export function countEmbedTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** LRU cache for embedding vectors keyed by the exact embed string. */
export class EmbeddingCache {
  private readonly max: number;
  private readonly map = new Map<string, readonly number[]>();

  constructor(max = DEFAULT_EMBED_CACHE) {
    this.max = Math.max(1, max);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  async get(key: string, fetch: (key: string) => Promise<readonly number[]>): Promise<readonly number[]> {
    const cached = this.map.get(key);
    if (cached) {
      this.map.delete(key);
      this.map.set(key, cached);
      return cached;
    }
    const vector = await fetch(key);
    this.map.set(key, vector);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return vector;
  }
}

/** Same hop text for train and inference — no Qwen chat envelope. */
export function embeddingInput(stateText: string, question: Question): string {
  return buildPrompt(stateText, question, optionSpecs(question));
}

export function l2Normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

export function softmax(logits: number[]): number[] {
  const max = logits.reduce((best, value) => (value > best ? value : best), Number.NEGATIVE_INFINITY);
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return logits.map(() => 1 / Math.max(1, logits.length));
  return exps.map((value) => value / sum);
}

export function linearScores(vector: readonly number[], head: ProbeHead): number[] {
  const x = l2Normalize(vector);
  return head.classes.map((_, row) => {
    const weights = head.weights[row] ?? [];
    let sum = head.bias[row] ?? 0;
    for (let i = 0; i < x.length; i += 1) sum += (weights[i] ?? 0) * (x[i] ?? 0);
    return sum;
  });
}

export function predictClass(
  vector: readonly number[],
  head: ProbeHead,
  classCount = head.classes.length
): { key: string; probabilities: Record<string, number> } {
  const n = Math.min(classCount, head.classes.length);
  const scores = linearScores(vector, head).slice(0, n);
  const probs = softmax(scores);
  const probabilities = Object.fromEntries(head.classes.slice(0, n).map((key, i) => [key, probs[i] ?? 0]));
  const winner = head.classes.slice(0, n).reduce((best, key) =>
    (probabilities[key] ?? 0) > (probabilities[best] ?? 0) ? key : best
  );
  return { key: winner ?? head.classes[0] ?? "", probabilities };
}

function asNumberMatrix(value: unknown, rows: number, cols: number, label: string): number[][] {
  if (!Array.isArray(value) || value.length !== rows) {
    throw new DecideError("invalid_request", `${label} must be a ${rows}x${cols} matrix`, 500);
  }
  return value.map((row, i) => {
    if (!Array.isArray(row) || row.length !== cols || row.some((cell) => typeof cell !== "number" || !Number.isFinite(cell))) {
      throw new DecideError("invalid_request", `${label} row ${i} is not ${cols} finite numbers`, 500);
    }
    return row.map(Number);
  });
}

export function loadHeadWeights(raw: unknown, expectedModelId: string): HeadMlpArtifact {
  if (!isRecord(raw)) throw new DecideError("invalid_request", "head-mlp weights must be an object", 500);
  const modelId = raw.modelId;
  if (typeof modelId !== "string" || modelId.length === 0) {
    throw new DecideError("invalid_request", "head-mlp weights missing modelId", 500);
  }
  if (modelId !== expectedModelId) {
    throw new DecideError("invalid_request", `head-mlp modelId ${modelId} does not match ${expectedModelId}`, 500);
  }
  const dim = raw.dim;
  if (typeof dim !== "number" || !Number.isInteger(dim) || dim < 1) {
    throw new DecideError("invalid_request", "head-mlp dim must be a positive integer", 500);
  }
  if (!isRecord(raw.heads)) throw new DecideError("invalid_request", "head-mlp weights missing heads", 500);
  const heads: Record<string, ProbeHead> = {};
  for (const [id, value] of Object.entries(raw.heads)) {
    if (!isRecord(value)) throw new DecideError("invalid_request", `head ${id} is not an object`, 500);
    if (!Array.isArray(value.classes) || value.classes.length < 2 || value.classes.some((c) => typeof c !== "string")) {
      throw new DecideError("invalid_request", `head ${id} needs at least 2 class names`, 500);
    }
    const classes = value.classes.map(String);
    const weights = asNumberMatrix(value.weights, classes.length, dim, `head ${id} weights`);
    if (!Array.isArray(value.bias) || value.bias.length !== classes.length || value.bias.some((b) => typeof b !== "number")) {
      throw new DecideError("invalid_request", `head ${id} bias must match classes`, 500);
    }
    heads[id] = { classes, weights, bias: value.bias.map(Number) };
  }
  if (Object.keys(heads).length === 0) {
    throw new DecideError("invalid_request", "head-mlp weights have no heads", 500);
  }
  return { modelId, dim, heads };
}

function remapProbabilities(
  options: OptionSpec[],
  head: ProbeHead,
  probabilities: Record<string, number>
): Record<string, number> {
  if (options.every((opt, i) => opt.key === head.classes[i])) {
    return Object.fromEntries(options.map((opt) => [opt.key, probabilities[opt.key] ?? 0]));
  }
  return Object.fromEntries(
    options.map((opt, i) => [opt.key, probabilities[head.classes[i] ?? ""] ?? 0])
  );
}

export function defaultHeadMlpPath(env: NodeJS.ProcessEnv = process.env): string {
  return envFirst(env, "DECIDE_HEAD_MLP", "DECIDIR_HEAD_MLP") ?? join(homedir(), ".cache", "TypedDecisionMCP", "head-mlp.json");
}

export class HeadMlpEngine implements DecisionEngine {
  private llama: Llama | undefined;
  private model: LlamaModel | undefined;
  private embedding: LlamaEmbeddingContext | undefined;
  private artifact: HeadMlpArtifact | undefined;
  private readonly cache = new EmbeddingCache();
  private readonly weightsPath: string;
  private readonly modelPath: string;

  constructor(weightsPath = defaultHeadMlpPath(), modelPath = resolveModelPath()) {
    this.weightsPath = weightsPath;
    this.modelPath = modelPath;
  }

  async init(): Promise<void> {
    if (this.embedding) return;
    if (!existsSync(this.weightsPath)) {
      throw new DecideError("invalid_request", `head-mlp weights not found at ${this.weightsPath}`, 503);
    }
    const raw = JSON.parse(readFileSync(this.weightsPath, "utf8")) as unknown;
    this.artifact = loadHeadWeights(raw, modelId());
    if (!existsSync(this.modelPath)) {
      throw new DecideError("model_missing", `GGUF not found at ${this.modelPath}. Run npm run fetch-model.`, 503);
    }
    this.llama = await getLlama({ gpu: resolveGpuOption() });
    this.model = await this.llama.loadModel({ modelPath: this.modelPath });
    this.embedding = await this.model.createEmbeddingContext({ contextSize: EMBED_CONTEXT_SIZE });
  }

  async score(state: State, questions: Questions): Promise<ScoreResult> {
    await this.init();
    const started = performance.now();
    const artifact = this.artifact;
    const embedding = this.embedding;
    if (!artifact || !embedding) {
      throw new DecideError("engine_error", "head-mlp engine not loaded", 500);
    }
    const stateText = renderState(state);
    const answers: Answers = {};
    let promptTokens = 0;

    for (const [id, question] of Object.entries(questions)) {
      const head = artifact.heads[id];
      if (!head) {
        throw new DecideError("invalid_request", `head-mlp has no probe for question ${id}`, 500);
      }
      const options = optionSpecs(question);
      const embedText = embeddingInput(stateText, question);
      promptTokens += countEmbedTokens(embedText);
      const vector = await this.cache.get(embedText, async (text) => (await embedding.getEmbeddingFor(text)).vector);
      if (vector.length !== artifact.dim) {
        throw new DecideError("engine_error", `embedding dim ${vector.length} != ${artifact.dim}`, 500);
      }
      const predicted = predictClass(vector, head, options.length);
      const probabilities = remapProbabilities(options, head, predicted.probabilities);
      answers[id] = toAnswer(question.type, options, probabilities);
    }

    return {
      engine: "head-mlp",
      answers,
      model: modelId(),
      usage: { prompt_tokens: promptTokens, generated_tokens: 0 },
      latency_ms: performance.now() - started
    };
  }

  async dispose(): Promise<void> {
    this.cache.clear();
    this.artifact = undefined;
    await this.embedding?.dispose();
    this.embedding = undefined;
    await this.model?.dispose();
    this.model = undefined;
    await this.llama?.dispose();
    this.llama = undefined;
  }
}

let singleton: HeadMlpEngine | undefined;

export async function getHeadMlpEngine(): Promise<HeadMlpEngine> {
  if (!singleton) {
    singleton = new HeadMlpEngine();
    await singleton.init();
  }
  return singleton;
}
