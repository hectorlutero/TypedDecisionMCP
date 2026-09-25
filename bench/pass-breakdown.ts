import { performance } from "node:perf_hooks";
import { getLlama } from "node-llama-cpp";
import { loadFixtures } from "./load-fixtures.js";
import { embeddingInput, filePairInput } from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import type { State } from "../src/contract.js";

const llama = await getLlama({ gpu: resolveGpuOption() });
const model = await llama.loadModel({ modelPath: resolveModelPath() });
const insights = model.fileInsights;
const arch = insights.ggufFileInfo.architectureMetadata as Record<string, unknown>;
const attention = (arch.attention ?? {}) as Record<string, unknown>;
console.log(
  JSON.stringify(
    {
      parameters: insights.totalParameters,
      layers: insights.totalLayers,
      trainContext: insights.trainContextSize,
      embedding: insights.embeddingVectorSize,
      blockCount: arch.block_count,
      heads: attention.head_count,
      kvHeads: attention.head_count_kv,
      keyLength: attention.key_length,
      feedForward: arch.feed_forward_length,
      context: arch.context_length,
      quant: insights.ggufFileInfo.metadata?.general?.file_type ?? null
    },
    null,
    2
  )
);

const embedding = await model.createEmbeddingContext({ contextSize: 256 });
const fixture = loadFixtures().find((row) => row.id === "cmd-01");
if (!fixture) throw new Error("cmd-01");
const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
const question = pack.questions.command;
if (!question) throw new Error("command");
const text = embeddingInput(pack.view, question);

const tTok = performance.now();
const tokens = model.tokenize(text, true);
console.error(`tokenize ${tokens.length} tokens ${(performance.now() - tTok).toFixed(2)}ms`);

async function embed(label: string, value: string) {
  const n = model.tokenize(value, true).length;
  const t0 = performance.now();
  await embedding.getEmbeddingFor(value);
  console.error(`${label} tokens≈${n} pass=${(performance.now() - t0).toFixed(0)}ms`);
}

await embed("warmup", "hi");
await embed("one-word", "hi");
await embed("cmd-01", text);
const pair = filePairInput("Change the default auto threshold", "src/policy.ts");
await embed("one-path", pair);

await embedding.dispose();
await model.dispose();
await llama.dispose();
