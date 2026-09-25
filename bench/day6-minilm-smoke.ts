/**
 * Day 6 smoke: all-MiniLM-L6-v2 Q8 embed latency on cmd-01 / file paths.
 * Kill (plan): p50 without clear cut vs ~411 ms joint — practical ≤250 ms on cmd-01 embed.
 * Quality retrain is a follow-up only if latency gate passes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { getLlama } from "node-llama-cpp";
import { loadFixtures } from "./load-fixtures.js";
import { embeddingInput, filePairInput } from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { resolvePack } from "../src/packs/cursor.js";
import type { State } from "../src/contract.js";

const MODEL = join(homedir(), ".cache", "TypedDecisionMCP", "all-MiniLM-L6-v2-Q8_0.gguf");
const JOINT_CMD_P50 = 370; // prior command p50 from joint head bench
const LATENCY_KILL_MS = 250;

const llama = await getLlama({ gpu: resolveGpuOption() });
const model = await llama.loadModel({ modelPath: MODEL });
const insights = model.fileInsights;
const embedding = await model.createEmbeddingContext({ contextSize: 256 });

const fixture = loadFixtures().find((row) => row.id === "cmd-01");
if (!fixture) throw new Error("cmd-01");
const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
const question = pack.questions.command;
if (!question) throw new Error("command");
const cmdText = embeddingInput(pack.view, question);

await embedding.getEmbeddingFor("hi");

const cmdMs: number[] = [];
for (let i = 0; i < 5; i += 1) {
  const t0 = performance.now();
  await embedding.getEmbeddingFor(cmdText);
  cmdMs.push(performance.now() - t0);
}

const fileFix = loadFixtures().find((row) => row.id === "file-01");
if (!fileFix) throw new Error("file-01");
const filePack = resolvePack(fileFix.state as State, fileFix.preset, undefined);
const request =
  typeof fileFix.state === "object" && fileFix.state && "request" in fileFix.state
    ? String(fileFix.state.request)
    : "";
const paths =
  typeof fileFix.state === "object" && fileFix.state && "candidates" in fileFix.state
    ? (fileFix.state.candidates as string[])
    : [];
const fileMs: number[] = [];
for (const path of paths) {
  const text = filePairInput(request, path);
  const t0 = performance.now();
  await embedding.getEmbeddingFor(text);
  fileMs.push(performance.now() - t0);
}

const cmdSorted = [...cmdMs].sort((a, b) => a - b);
const cmdMedian = cmdSorted[Math.floor(cmdSorted.length / 2)] ?? NaN;
const fileSum = fileMs.reduce((a, b) => a + b, 0);

const report = {
  model: MODEL,
  embedding_dim: insights.embeddingVectorSize,
  layers: insights.totalLayers,
  parameters: insights.totalParameters,
  model_bytes: model.size,
  cmd01_tokens: model.tokenize(cmdText, true).length,
  cmd01_ms: cmdMs,
  cmd01_median_ms: cmdMedian,
  file01_path_ms: fileMs,
  file01_sum_ms: fileSum,
  gates: {
    latency_pass: cmdMedian <= LATENCY_KILL_MS,
    latency_kill: `cmd-01 median ≤ ${LATENCY_KILL_MS} ms (joint command ~${JOINT_CMD_P50} ms)`,
    vs_joint_frac: JOINT_CMD_P50 > 0 ? cmdMedian / JOINT_CMD_P50 : null
  }
};

mkdirSync("bench/out", { recursive: true });
writeFileSync("bench/out/day6-minilm-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await embedding.dispose();
await model.dispose();
await llama.dispose();
