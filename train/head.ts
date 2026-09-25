import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLlama } from "node-llama-cpp";
import { loadFixtures, type Fixture } from "../bench/load-fixtures.js";
import { type State } from "../src/contract.js";
import { defaultHeadMlpPath, embeddingInput, type HeadMlpArtifact, type ProbeHead } from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { optionSpecs } from "../src/engine/prompt.js";
import { modelId, resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import { fitSoftmax } from "./fit.js";
import { expandAuthored } from "./paraphrase.js";

const FILE_CLASS_COUNT = 20;

type Row = {
  id: string;
  variant: number;
  questionId: string;
  gold: string;
  classes: string[];
  activeK: number;
  label: number;
  text: string;
};

function rowsForFixture(fixture: Fixture, variant: number): Row[] {
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  return Object.entries(fixture.gold).flatMap(([questionId, gold]) => {
    const question = pack.questions[questionId];
    if (!question) return [];
    const options = optionSpecs(question);
    const text = embeddingInput(pack.view, question);
    const fileMode = questionId === "file";
    const classes = fileMode
      ? Array.from({ length: FILE_CLASS_COUNT }, (_, i) => String(i))
      : options.map((opt) => opt.key);
    const label = fileMode ? options.findIndex((opt) => opt.key === gold) : classes.indexOf(gold);
    if (label < 0) {
      throw new Error(`${fixture.id} gold ${gold} is not an option of ${questionId}`);
    }
    return [
      {
        id: fixture.id,
        variant,
        questionId,
        gold,
        classes,
        activeK: fileMode ? options.length : classes.length,
        label,
        text
      }
    ];
  });
}

async function main(): Promise<void> {
  const authored = expandAuthored(loadFixtures("authored"));
  const rows = authored.flatMap((fixture) => rowsForFixture(fixture, fixture.variant));
  const outDir = join(process.cwd(), "bench", "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "head-train.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

  const llama = await getLlama({ gpu: resolveGpuOption() });
  const model = await llama.loadModel({ modelPath: resolveModelPath() });
  const embedding = await model.createEmbeddingContext({ contextSize: 512 });
  const dim = model.embeddingVectorSize;
  const vectors: number[][] = [];
  for (const [i, row] of rows.entries()) {
    const vector = [...(await embedding.getEmbeddingFor(row.text)).vector];
    if (vector.length !== dim) throw new Error(`dim ${vector.length} != ${dim}`);
    vectors.push(vector);
    if ((i + 1) % 20 === 0) console.error(`embed ${i + 1}/${rows.length}`);
  }

  const byQuestion = new Map<string, { classes: string[]; xs: number[][]; ys: number[]; ks: number[] }>();
  for (const [i, row] of rows.entries()) {
    const bucket = byQuestion.get(row.questionId) ?? {
      classes: row.classes,
      xs: [],
      ys: [],
      ks: []
    };
    bucket.xs.push(vectors[i] ?? []);
    bucket.ys.push(row.label);
    bucket.ks.push(row.activeK);
    byQuestion.set(row.questionId, bucket);
  }

  const heads: Record<string, ProbeHead> = {};
  for (const [questionId, bucket] of byQuestion) {
    heads[questionId] = fitSoftmax(bucket.xs, bucket.ys, bucket.classes, 0.1, 400, 0.8, bucket.ks);
    console.error(`fit ${questionId} n=${bucket.xs.length} k=${bucket.classes.length}`);
  }

  const artifact: HeadMlpArtifact = { modelId: modelId(), dim, heads };
  const weightsPath = defaultHeadMlpPath();
  mkdirSync(join(homedir(), ".cache", "TypedDecisionMCP"), { recursive: true });
  writeFileSync(weightsPath, JSON.stringify(artifact));
  console.log(weightsPath);

  await embedding.dispose();
  await model.dispose();
  await llama.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
