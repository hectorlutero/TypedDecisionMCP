/**
 * Day-1 microbench: Q8 vs Q4 prefill + GPU backend ablation on cmd-01 embed.
 * Kill (plan): Q4 must drop ≥25% vs Q8; best GPU must gain ≥15% vs baseline vulkan.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { getLlama, type Llama, type LlamaEmbeddingContext, type LlamaModel } from "node-llama-cpp";
import { loadFixtures } from "./load-fixtures.js";
import { embeddingInput } from "../src/engine/head-mlp.js";
import { resolvePack } from "../src/packs/cursor.js";
import type { State } from "../src/contract.js";

const CACHE = join(homedir(), ".cache", "TypedDecisionMCP");
const Q8 = join(CACHE, "Qwen3-0.6B-Q8_0.gguf");
const Q4 = join(CACHE, "Qwen3-0.6B-Q4_K_M.gguf");
const REPEATS = 3;

type GpuChoice = "vulkan" | "cuda" | false;

type Cell = {
  model: string;
  gpu: string;
  load_ms: number;
  gpuLayers: number | null;
  modelBytes: number | null;
  tokens: number;
  warmup_ms: number;
  cmd01_ms: number[];
  cmd01_median_ms: number;
  error?: string;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
}

function cmd01Text(): string {
  const fixture = loadFixtures().find((row) => row.id === "cmd-01");
  if (!fixture) throw new Error("cmd-01");
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  const question = pack.questions.command;
  if (!question) throw new Error("command");
  return embeddingInput(pack.view, question);
}

async function runCell(modelPath: string, gpu: GpuChoice, text: string): Promise<Cell> {
  const label = modelPath.includes("Q4") ? "Q4_K_M" : "Q8_0";
  const gpuLabel = gpu === false ? "cpu" : gpu;
  let llama: Llama | undefined;
  let model: LlamaModel | undefined;
  let embedding: LlamaEmbeddingContext | undefined;
  try {
    const tLoad = performance.now();
    llama = await getLlama({ gpu });
    model = await llama.loadModel({ modelPath });
    embedding = await model.createEmbeddingContext({ contextSize: 256 });
    const load_ms = performance.now() - tLoad;
    const tokens = model.tokenize(text, true).length;

    const tWarm = performance.now();
    await embedding.getEmbeddingFor("hi");
    const warmup_ms = performance.now() - tWarm;

    const cmd01_ms: number[] = [];
    for (let i = 0; i < REPEATS; i += 1) {
      const t0 = performance.now();
      await embedding.getEmbeddingFor(text);
      cmd01_ms.push(performance.now() - t0);
    }

    return {
      model: label,
      gpu: gpuLabel,
      load_ms,
      gpuLayers: model.gpuLayers,
      modelBytes: model.size,
      tokens,
      warmup_ms,
      cmd01_ms,
      cmd01_median_ms: median(cmd01_ms)
    };
  } catch (err) {
    return {
      model: label,
      gpu: gpuLabel,
      load_ms: 0,
      gpuLayers: null,
      modelBytes: null,
      tokens: 0,
      warmup_ms: 0,
      cmd01_ms: [],
      cmd01_median_ms: NaN,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    await embedding?.dispose().catch(() => undefined);
    await model?.dispose().catch(() => undefined);
    await llama?.dispose().catch(() => undefined);
  }
}

const text = cmd01Text();
const cells: Cell[] = [];

// Baseline: Q8 + vulkan (ship path)
cells.push(await runCell(Q8, "vulkan", text));
console.error(JSON.stringify(cells.at(-1)));

// Day-1 Q4 on same backend
cells.push(await runCell(Q4, "vulkan", text));
console.error(JSON.stringify(cells.at(-1)));

// GPU ablation on Q8
for (const gpu of ["cuda", false] as const) {
  cells.push(await runCell(Q8, gpu, text));
  console.error(JSON.stringify(cells.at(-1)));
}

const baseline = cells.find((c) => c.model === "Q8_0" && c.gpu === "vulkan" && !c.error);
const q4 = cells.find((c) => c.model === "Q4_K_M" && c.gpu === "vulkan" && !c.error);
const q4Drop =
  baseline && q4
    ? (baseline.cmd01_median_ms - q4.cmd01_median_ms) / baseline.cmd01_median_ms
    : null;

const gpuAlive = cells.filter((c) => c.model === "Q8_0" && !c.error);
const bestGpu = [...gpuAlive].sort((a, b) => a.cmd01_median_ms - b.cmd01_median_ms)[0];
const gpuGain =
  baseline && bestGpu
    ? (baseline.cmd01_median_ms - bestGpu.cmd01_median_ms) / baseline.cmd01_median_ms
    : null;

const report = {
  text_chars: text.length,
  repeats: REPEATS,
  cells,
  gates: {
    q4_drop_frac: q4Drop,
    q4_pass: q4Drop != null && q4Drop >= 0.25,
    q4_kill: "embed cmd-01 must drop ≥25% vs Q8",
    gpu_best: bestGpu ? { gpu: bestGpu.gpu, median_ms: bestGpu.cmd01_median_ms } : null,
    gpu_gain_frac: gpuGain,
    gpu_pass: gpuGain != null && gpuGain >= 0.15,
    gpu_kill: "best backend must gain ≥15% vs vulkan Q8"
  }
};

mkdirSync("bench/out", { recursive: true });
const out = "bench/out/day1-prefill.json";
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error(`wrote ${out}`);
