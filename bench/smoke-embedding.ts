import { existsSync } from "node:fs";
import { getLlama } from "node-llama-cpp";
import { modelId, resolveModelPath } from "../src/model-path.js";

function l2(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosine(a: readonly number[], b: readonly number[]): number {
  const denom = l2(a) * l2(b);
  if (denom === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot / denom;
}

async function main(): Promise<void> {
  const modelPath = resolveModelPath();
  if (!existsSync(modelPath)) {
    console.log(JSON.stringify({ ok: false, reason: "model_missing", modelPath }));
    process.exit(1);
  }
  const llama = await getLlama({ gpu: "auto" });
  const model = await llama.loadModel({ modelPath });
  const reported = model.embeddingVectorSize;
  let embeddingContext;
  try {
    embeddingContext = await model.createEmbeddingContext({ contextSize: 512 });
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        reason: "createEmbeddingContext_failed",
        model: modelId(),
        embeddingVectorSize: reported,
        error: err instanceof Error ? err.message : String(err)
      })
    );
    await model.dispose();
    await llama.dispose();
    process.exit(1);
  }

  const a = "Classify the state. Reply with exactly one option label.\n\nState:\n{\"command\":\"rm -rf /\"}\n";
  const b = "Classify the state. Reply with exactly one option label.\n\nState:\n{\"command\":\"git status\"}\n";
  const embedA = await embeddingContext.getEmbeddingFor(a);
  const embedB = await embeddingContext.getEmbeddingFor(b);
  const vector = embedA.vector;
  const zeros = vector.filter((value) => value === 0).length;
  const nans = vector.filter((value) => Number.isNaN(value)).length;
  const norm = l2(vector);
  const usable =
    vector.length > 0 &&
    nans === 0 &&
    norm > 0 &&
    cosine(embedA.vector, embedB.vector) < 0.999;

  console.log(
    JSON.stringify(
      {
        ok: usable,
        model: modelId(),
        embeddingVectorSize: reported,
        dim: vector.length,
        l2: norm,
        zeros,
        nans,
        cosine_distinct_prompts: cosine(embedA.vector, embedB.vector),
        sample: vector.slice(0, 8)
      },
      null,
      2
    )
  );

  await embeddingContext.dispose();
  await model.dispose();
  await llama.dispose();
  process.exit(usable ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
