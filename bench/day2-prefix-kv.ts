/**
 * Day 2–3 microbench: prefix-KV reuse on file-01 pair embeds vs erase-total getEmbeddingFor.
 * Kill: cos < 0.9999 vs stock, or argmax flip on authored file-*; latency gate: sum ≤ 0.65× baseline.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getLlama, type Token } from "node-llama-cpp";
import { loadFixtures } from "./load-fixtures.js";
import {
  defaultHeadMlpPath,
  filePairInput,
  linearScores,
  loadHeadWeights,
  requestFromFileView,
  softmax
} from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { optionSpecs } from "../src/engine/prompt.js";
import { modelId, resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import type { State } from "../src/contract.js";

type EmbBag = {
  _sequence: {
    nextTokenIndex: number;
    adaptStateToTokens: (tokens: Token[], allowShift?: boolean) => Promise<void>;
    evaluateWithoutGeneratingNewTokens: (tokens: Token[]) => Promise<void>;
    clearHistory: () => Promise<void>;
  };
  _llamaContext: {
    model: {
      tokenizer: (text: string, special: boolean, options?: unknown) => Token[];
      vocabularyType: unknown;
      tokens: { bos: Token | null; eos: Token | null; sep: Token | null; shouldPrependBosToken: boolean; shouldAppendEosToken: boolean };
    };
    _ctx: { getEmbedding: (n: number) => Float64Array | Float32Array };
  };
  _prepareInput: (tokens: Token[]) => void;
};

function prepareTokens(emb: EmbBag, text: string): Token[] {
  const tokens = emb._llamaContext.model.tokenizer(text, false) as Token[];
  const clone = tokens.slice();
  emb._prepareInput(clone);
  return clone;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function lInf(a: readonly number[], b: readonly number[]): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) m = Math.max(m, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return m;
}

async function stockEmbed(getEmbeddingFor: (t: string) => Promise<{ vector: number[] }>, text: string) {
  const t0 = performance.now();
  const vector = (await getEmbeddingFor(text)).vector;
  return { ms: performance.now() - t0, vector, reuse: 0, evaluated: -1, total: -1 };
}

async function reuseEmbed(emb: EmbBag, text: string) {
  const tokens = prepareTokens(emb, text);
  const seq = emb._sequence;
  const t0 = performance.now();
  await seq.adaptStateToTokens(tokens, false);
  const reuse = seq.nextTokenIndex;
  const suffix = tokens.slice(reuse);
  if (suffix.length > 0) await seq.evaluateWithoutGeneratingNewTokens(suffix);
  const raw = emb._llamaContext._ctx.getEmbedding(tokens.length);
  const vector = Array.from(raw);
  return {
    ms: performance.now() - t0,
    vector,
    reuse,
    evaluated: suffix.length,
    total: tokens.length
  };
}

const fixture = loadFixtures().find((row) => row.id === "file-01");
if (!fixture) throw new Error("file-01");
const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
const question = pack.questions.file;
if (!question) throw new Error("file");
const request = requestFromFileView(pack.view);
const paths = optionSpecs(question).map((opt) => opt.key);
const texts = paths.map((path) => filePairInput(request, path));

const llama = await getLlama({ gpu: resolveGpuOption() });
const model = await llama.loadModel({ modelPath: resolveModelPath() });
const embedding = await model.createEmbeddingContext({ contextSize: 256 });
const emb = embedding as unknown as EmbBag;

// Warm
await embedding.getEmbeddingFor("hi");

// Baseline: erase-total (3× getEmbeddingFor)
const stock: Awaited<ReturnType<typeof stockEmbed>>[] = [];
for (const text of texts) {
  stock.push(await stockEmbed((t) => embedding.getEmbeddingFor(t), text));
}

// Treatment: prefix reuse (clear once, then adapt)
await emb._sequence.clearHistory();
const reused: Awaited<ReturnType<typeof reuseEmbed>>[] = [];
for (const text of texts) {
  reused.push(await reuseEmbed(emb, text));
}

const stockSum = stock.reduce((s, r) => s + r.ms, 0);
const reuseSum = reused.reduce((s, r) => s + r.ms, 0);
const stockTokEval = texts.reduce((s, t) => s + prepareTokens(emb, t).length, 0);
const reuseTokEval = reused.reduce((s, r) => s + Math.max(0, r.evaluated), 0);

const vectorChecks = texts.map((text, i) => ({
  path: paths[i],
  tokens: prepareTokens(emb, text).length,
  stock_ms: stock[i]?.ms,
  reuse_ms: reused[i]?.ms,
  reuse_prefix: reused[i]?.reuse,
  reuse_evaluated: reused[i]?.evaluated,
  cosine: cosine(stock[i]?.vector ?? [], reused[i]?.vector ?? []),
  linf: lInf(stock[i]?.vector ?? [], reused[i]?.vector ?? [])
}));

const cosOk = vectorChecks.every((row) => (row.cosine ?? 0) >= 0.9999);

// Argmax check on all authored file-* with both vector sources (pair head)
const artifact = loadHeadWeights(JSON.parse(readFileSync(defaultHeadMlpPath(), "utf8")), modelId());
const fileHead = artifact.heads.file;
const yesIndex = fileHead?.classes.indexOf("yes") ?? -1;
const argmaxRows: Array<{
  id: string;
  gold: string;
  stock_pick: string;
  reuse_pick: string;
  match: boolean;
}> = [];

if (fileHead && artifact.fileScoring === "pair" && yesIndex >= 0) {
  const authoredFile = loadFixtures().filter((row) => row.preset === "file" && row.split === "authored");
  for (const row of authoredFile) {
    const p = resolvePack(row.state as State, row.preset, undefined);
    const q = p.questions.file;
    if (!q) continue;
    const req = requestFromFileView(p.view);
    const opts = optionSpecs(q);
    const stockYes: number[] = [];
    const reuseYes: number[] = [];
    await emb._sequence.clearHistory();
    for (const opt of opts) {
      const text = filePairInput(req, opt.key);
      const s = await stockEmbed((t) => embedding.getEmbeddingFor(t), text);
      stockYes.push(softmax(linearScores(s.vector, fileHead))[yesIndex] ?? 0);
    }
    await emb._sequence.clearHistory();
    for (const opt of opts) {
      const text = filePairInput(req, opt.key);
      const r = await reuseEmbed(emb, text);
      reuseYes.push(softmax(linearScores(r.vector, fileHead))[yesIndex] ?? 0);
    }
    const massS = stockYes.reduce((a, b) => a + b, 0);
    const massR = reuseYes.reduce((a, b) => a + b, 0);
    const pick = (yes: number[], mass: number) => {
      let best = 0;
      let bestP = -1;
      for (let i = 0; i < opts.length; i += 1) {
        const pYes = mass > 0 ? (yes[i] ?? 0) / mass : 1 / opts.length;
        if (pYes > bestP) {
          bestP = pYes;
          best = i;
        }
      }
      return opts[best]?.key ?? "";
    };
    const stock_pick = pick(stockYes, massS);
    const reuse_pick = pick(reuseYes, massR);
    const gold = typeof row.gold === "object" && row.gold && "file" in row.gold ? String(row.gold.file) : "";
    argmaxRows.push({
      id: row.id,
      gold,
      stock_pick,
      reuse_pick,
      match: stock_pick === reuse_pick
    });
  }
}

const argmaxOk = argmaxRows.length === 0 || argmaxRows.every((r) => r.match);
const latencyOk = reuseSum <= 0.65 * stockSum;
const tokensOk = reuseTokEval <= 0.7 * stockTokEval;

const report = {
  paths,
  shared_prefix_tokens: reused[1]?.reuse ?? reused[0]?.reuse ?? null,
  stock_sum_ms: stockSum,
  reuse_sum_ms: reuseSum,
  latency_ratio: stockSum > 0 ? reuseSum / stockSum : null,
  stock_token_evals: stockTokEval,
  reuse_token_evals: reuseTokEval,
  token_eval_ratio: stockTokEval > 0 ? reuseTokEval / stockTokEval : null,
  vectorChecks,
  argmaxRows,
  gates: {
    cos_pass: cosOk,
    cos_kill: "every path cos ≥ 0.9999 vs stock",
    argmax_pass: argmaxOk,
    argmax_kill: "stock and reuse argmax must match on authored file-*",
    latency_pass: latencyOk,
    latency_kill: "reuse sum ≤ 0.65 × stock sum",
    tokens_pass: tokensOk,
    tokens_kill: "reuse token-evals ≤ 0.70 × stock",
    overall_pass: cosOk && argmaxOk && (latencyOk || tokensOk)
  },
  note: "Pair scoring mirrored manually. Private embedding APIs used for adaptStateToTokens path."
};

mkdirSync("bench/out", { recursive: true });
writeFileSync("bench/out/day2-prefix-kv.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error(`wrote bench/out/day2-prefix-kv.json overall_pass=${report.gates.overall_pass}`);

await embedding.dispose();
await model.dispose();
await llama.dispose();
