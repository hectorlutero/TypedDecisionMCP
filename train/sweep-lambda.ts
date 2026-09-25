import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLlama } from "node-llama-cpp";
import { isDestructiveFalseAuto } from "../bench/cost-math.js";
import { loadFixtures, type Fixture } from "../bench/load-fixtures.js";
import { median } from "../bench/spawn.js";
import { isRecord, type Question, type State } from "../src/contract.js";
import { embeddingInput, linearScores, softmax, type ProbeHead } from "../src/engine/head-mlp.js";
import { resolveGpuOption, toAnswer } from "../src/engine/logits.js";
import { optionSpecs, type OptionSpec } from "../src/engine/prompt.js";
import { resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import { decideAction } from "../src/policy.js";
import { fitSoftmax } from "./fit.js";
import { expandAuthored } from "./paraphrase.js";

const FILE_CLASS_COUNT = 20;
const LAMBDAS = [0.1, 0.01, 0.001, 0];
const TEMPS = [1, 0.5, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05];
const MARGIN_GATE_NATS = 0.1;
const HELD_GATE = 15;

type Example = {
  id: string;
  split: "authored" | "heldout";
  preset: string;
  questionId: string;
  gold: string;
  text: string;
  label: number;
  classes: string[];
  activeK: number;
  options: OptionSpec[];
  question: Question;
};

function examplesFor(fixture: Fixture): Example[] {
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  return Object.entries(fixture.gold).flatMap(([questionId, gold]) => {
    const question = pack.questions[questionId];
    if (!question) return [];
    const options = optionSpecs(question);
    const fileMode = questionId === "file";
    const classes = fileMode ? Array.from({ length: FILE_CLASS_COUNT }, (_, i) => String(i)) : options.map((opt) => opt.key);
    const label = fileMode ? options.findIndex((opt) => opt.key === gold) : classes.indexOf(gold);
    if (label < 0) throw new Error(`${fixture.id} gold ${gold} is not an option of ${questionId}`);
    return [
      {
        id: fixture.id,
        split: fixture.split,
        preset: String(fixture.preset),
        questionId,
        gold,
        text: embeddingInput(pack.view, question),
        label,
        classes,
        activeK: fileMode ? options.length : classes.length,
        options,
        question
      }
    ];
  });
}

function reverseFile(fixture: Fixture): Fixture | undefined {
  if (fixture.preset !== "file") return undefined;
  if (!isRecord(fixture.state) || !Array.isArray(fixture.state.candidates)) return undefined;
  return {
    ...fixture,
    id: `${fixture.id}#rev`,
    state: { ...fixture.state, candidates: [...(fixture.state.candidates as string[])].reverse() }
  };
}

type Scored = Example & {
  gap: number;
  action: "auto" | "review" | "stop";
  predicted: string;
  hit: boolean;
  scores: number[];
};

function scoreExample(vector: readonly number[], head: ProbeHead, row: Example): Scored {
  const scores = linearScores(vector, head).slice(0, row.options.length);
  return { ...row, ...decision(row, scores) };
}

function decision(row: Example, scores: number[]): Pick<Scored, "gap" | "action" | "predicted" | "hit" | "scores"> {
  const probs = softmax(scores);
  const probabilities = Object.fromEntries(row.options.map((opt, i) => [opt.key, probs[i] ?? 0]));
  const answer = toAnswer(row.question.type, row.options, probabilities);
  const { action } = decideAction({ [row.questionId]: answer });
  const sorted = [...scores].sort((a, b) => b - a);
  const winner = row.options.reduce((best, opt) =>
    (probabilities[opt.key] ?? 0) > (probabilities[best.key] ?? 0) ? opt : best
  );
  return {
    gap: (sorted[0] ?? 0) - (sorted[1] ?? 0),
    action,
    predicted: winner.key,
    hit: winner.key === row.gold,
    scores
  };
}

function tally(rows: Scored[]) {
  const count = (split: Scored["split"]) => {
    const subset = rows.filter((row) => row.split === split);
    return { ok: subset.filter((row) => row.hit).length, n: subset.length };
  };
  const actions = { auto: 0, review: 0, stop: 0 };
  for (const row of rows) actions[row.action] += 1;
  const commandHeld = rows.filter((row) => row.split === "heldout" && row.preset === "command").map((row) => row.gap);
  return {
    authored: count("authored"),
    heldout: count("heldout"),
    actions,
    command_heldout_median_gap: Number(median(commandHeld).toFixed(4)),
    destructive_false_auto: rows
      .filter((row) => isDestructiveFalseAuto(row.preset, row.gold, row.action))
      .map((row) => row.id),
    misses: rows.filter((row) => !row.hit).map((row) => `${row.id}:${row.gold}->${row.predicted}`)
  };
}

function fitQuestionTemperatures(rows: Scored[]): Record<string, number> {
  const byQuestion = new Map<string, Scored[]>();
  for (const row of rows) {
    if (row.split !== "authored") continue;
    const bucket = byQuestion.get(row.questionId) ?? [];
    bucket.push(row);
    byQuestion.set(row.questionId, bucket);
  }
  const chosen: Record<string, number> = {};
  for (const [questionId, bucket] of byQuestion) {
    let bestT = 1;
    let bestNll = Number.POSITIVE_INFINITY;
    for (const temperature of TEMPS) {
      let nll = 0;
      for (const row of bucket) {
        const probs = softmax(row.scores.map((score) => score / temperature));
        nll += -Math.log((probs[row.label] ?? 0) + 1e-12);
      }
      const mean = nll / bucket.length;
      if (mean < bestNll) {
        bestNll = mean;
        bestT = temperature;
      }
    }
    chosen[questionId] = bestT;
  }
  return chosen;
}

function applyTemperatures(rows: Scored[], temperatures: Record<string, number>): Scored[] {
  return rows.map((row) => {
    const temperature = temperatures[row.questionId] ?? 1;
    return { ...row, ...decision(row, row.scores.map((score) => score / temperature)) };
  });
}

async function main(): Promise<void> {
  const authored = expandAuthored(loadFixtures("authored"));
  const trainRows = authored.flatMap((fixture) => examplesFor(fixture));
  const evalRows = loadFixtures().flatMap((fixture) => examplesFor(fixture));
  const permRows = loadFixtures()
    .map(reverseFile)
    .filter((row): row is Fixture => row !== undefined)
    .flatMap((fixture) => examplesFor(fixture));

  const texts = [...new Set([...trainRows, ...evalRows, ...permRows].map((row) => row.text))];
  const llama = await getLlama({ gpu: resolveGpuOption() });
  const model = await llama.loadModel({ modelPath: resolveModelPath() });
  const embedding = await model.createEmbeddingContext({ contextSize: 256 });
  const vectors = new Map<string, number[]>();
  for (const [i, text] of texts.entries()) {
    vectors.set(text, [...(await embedding.getEmbeddingFor(text)).vector]);
    if ((i + 1) % 20 === 0) console.error(`embed ${i + 1}/${texts.length}`);
  }
  console.error(`embed ${texts.length}/${texts.length}`);

  const trainByQuestion = new Map<string, { classes: string[]; xs: number[][]; ys: number[]; ks: number[] }>();
  for (const row of trainRows) {
    const bucket = trainByQuestion.get(row.questionId) ?? { classes: row.classes, xs: [], ys: [], ks: [] };
    bucket.xs.push(vectors.get(row.text) ?? []);
    bucket.ys.push(row.label);
    bucket.ks.push(row.activeK);
    trainByQuestion.set(row.questionId, bucket);
  }

  const results = [];
  for (const lambda of LAMBDAS) {
    const heads: Record<string, ProbeHead> = {};
    for (const [questionId, bucket] of trainByQuestion) {
      heads[questionId] = fitSoftmax(bucket.xs, bucket.ys, bucket.classes, lambda, 400, 0.8, bucket.ks);
    }
    const scoreWith = (rows: Example[]) =>
      rows.map((row) => {
        const head = heads[row.questionId];
        if (!head) throw new Error(`missing head ${row.questionId}`);
        return scoreExample(vectors.get(row.text) ?? [], head, row);
      });
    const scored = scoreWith(evalRows);
    const summary = tally(scored);
    const gate = summary.command_heldout_median_gap >= MARGIN_GATE_NATS && summary.heldout.ok >= HELD_GATE;
    const commandRows = (rows: Scored[]) =>
      rows
        .filter((row) => row.preset === "command")
        .map((row) => ({
          id: row.id,
          split: row.split,
          gold: row.gold,
          predicted: row.predicted,
          action: row.action,
          gap: Number(row.gap.toFixed(4))
        }));
    let temperature: unknown = { skipped: true, reason: "margin gate not met" };
    if (gate) {
      const temperatures = fitQuestionTemperatures(scored);
      const tempered = applyTemperatures(scored, temperatures);
      temperature = { temperatures, ...tally(tempered), command_rows: commandRows(tempered) };
    }
    const perm = scoreWith(permRows);
    results.push({
      lambda,
      ...summary,
      command_rows: commandRows(scored),
      gate,
      temperature,
      file_reversed: perm.map((row) => ({
        id: row.id,
        split: row.split,
        gold: row.gold,
        predicted: row.predicted,
        hit: row.hit
      }))
    });
    console.error(
      `lambda ${lambda} held ${summary.heldout.ok}/${summary.heldout.n} cmd-gap ${summary.command_heldout_median_gap} gate ${gate}`
    );
  }

  const outPath = join(process.cwd(), "bench", "out", "lambda-sweep.json");
  mkdirSync(join(process.cwd(), "bench", "out"), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ embed_context: 256, unique_texts: texts.length, results }, null, 2));
  console.log(outPath);

  await embedding.dispose();
  await model.dispose();
  await llama.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
