import { performance } from "node:perf_hooks";
import { getLlama } from "node-llama-cpp";
import { loadFixtures } from "./load-fixtures.js";
import { filePairInput, linearScores, softmax } from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { embeddingInput } from "../src/engine/head-mlp.js";
import { optionSpecs } from "../src/engine/prompt.js";
import { resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import type { State } from "../src/contract.js";
import { readFileSync } from "node:fs";
import { defaultHeadMlpPath } from "../src/engine/head-mlp.js";
import type { ProbeHead } from "../src/engine/head-mlp.js";

const IDS = ["cmd-01", "sub-01", "diff-02", "file-01", "commit-01"];

async function timeHead(): Promise<void> {
  const artifact = JSON.parse(readFileSync(defaultHeadMlpPath(), "utf8")) as {
    heads: Record<string, ProbeHead>;
    dim: number;
  };
  const fixtures = new Map(loadFixtures().map((row) => [row.id, row]));
  const tLoad = performance.now();
  const llama = await getLlama({ gpu: resolveGpuOption() });
  const model = await llama.loadModel({ modelPath: resolveModelPath() });
  const embedding = await model.createEmbeddingContext({ contextSize: 256 });
  console.error(`head load+context ${(performance.now() - tLoad).toFixed(0)}ms`);

  const probeVector = Array.from({ length: artifact.dim }, () => 0);
  const probeHead = artifact.heads.command;
  if (!probeHead) throw new Error("missing command head");
  const tProbe = performance.now();
  for (let i = 0; i < 1000; i += 1) softmax(linearScores(probeVector, probeHead));
  console.error(`probe math x1000 ${(performance.now() - tProbe).toFixed(2)}ms`);

  for (const id of IDS) {
    const fixture = fixtures.get(id);
    if (!fixture) throw new Error(id);
    const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
    const questionId = Object.keys(pack.questions)[0] ?? "";
    const question = pack.questions[questionId];
    if (!question) throw new Error(questionId);
    if (questionId === "file") {
      const request = typeof fixture.state === "object" && fixture.state && "request" in fixture.state ? String(fixture.state.request) : "";
      const paths = optionSpecs(question).map((opt) => opt.key);
      const parts: number[] = [];
      for (const path of paths) {
        const text = filePairInput(request, path);
        const tokens = model.tokenize(text).length;
        const t0 = performance.now();
        await embedding.getEmbeddingFor(text);
        parts.push(performance.now() - t0);
        console.error(`  file ${path} tokens=${tokens} embed=${parts.at(-1)?.toFixed(0)}ms`);
      }
      const tCache = performance.now();
      await embedding.getEmbeddingFor(filePairInput(request, paths[0] ?? ""));
      console.error(`${id} file embeds ${parts.map((ms) => ms.toFixed(0)).join("+")}ms repeat=${(performance.now() - tCache).toFixed(0)}ms`);
      continue;
    }
    const text = embeddingInput(pack.view, question);
    const tokens = model.tokenize(text).length;
    const t0 = performance.now();
    await embedding.getEmbeddingFor(text);
    const first = performance.now() - t0;
    const t1 = performance.now();
    await embedding.getEmbeddingFor(text);
    console.error(`${id} tokens=${tokens} chars=${text.length} embed=${first.toFixed(0)}ms repeat=${(performance.now() - t1).toFixed(0)}ms`);
  }

  await embedding.dispose();
  await model.dispose();
  await llama.dispose();
}

async function timeLogits(): Promise<void> {
  const { getLogitEngine } = await import("../src/engine/logits.js");
  const { decide } = await import("../src/decide.js");
  const fixtures = new Map(loadFixtures().map((row) => [row.id, row]));
  const tLoad = performance.now();
  const engine = await getLogitEngine();
  console.error(`logits load+warmup ${(performance.now() - tLoad).toFixed(0)}ms`);
  for (const id of IDS) {
    const fixture = fixtures.get(id);
    if (!fixture) throw new Error(id);
    const result = await decide({ state: fixture.state, preset: fixture.preset }, engine);
    console.error(`${id} total=${result.latency_ms.toFixed(0)}ms tokens=${result.usage.prompt_tokens}`);
  }
  await engine.dispose();
}

const which = process.argv[2] ?? "head";
if (which === "head") await timeHead();
else await timeLogits();
