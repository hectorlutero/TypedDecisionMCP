import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getLlama } from "node-llama-cpp";
import { isDestructiveFalseAuto } from "../bench/cost-math.js";
import { loadFixtures, type Fixture } from "../bench/load-fixtures.js";
import { isRecord, type Question, type State } from "../src/contract.js";
import {
  defaultHeadMlpPath,
  embeddingInput,
  filePairInput,
  linearScores,
  softmax,
  type HeadMlpArtifact,
  type ProbeHead
} from "../src/engine/head-mlp.js";
import { resolveGpuOption, toAnswer } from "../src/engine/logits.js";
import { optionSpecs, type OptionSpec } from "../src/engine/prompt.js";
import { modelId, resolveModelPath } from "../src/model-path.js";
import { resolvePack } from "../src/packs/cursor.js";
import { decideAction } from "../src/policy.js";
import { fitSoftmax } from "./fit.js";
import { expandAuthored } from "./paraphrase.js";

const TEMPS = [1, 0.5, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05];
const HELD_GATE = 15;

type SlotExample = {
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

type PairExample = {
  id: string;
  split: "authored" | "heldout";
  path: string;
  gold: string;
  text: string;
  label: number;
};

function requestOf(state: unknown): string {
  if (!isRecord(state)) return "";
  return typeof state.request === "string" ? state.request : "";
}

function candidatesOf(state: unknown): string[] {
  if (!isRecord(state) || !Array.isArray(state.candidates)) return [];
  return state.candidates.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function slotExamples(fixture: Fixture): SlotExample[] {
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  return Object.entries(fixture.gold).flatMap(([questionId, gold]) => {
    if (questionId === "file") return [];
    const question = pack.questions[questionId];
    if (!question) return [];
    const options = optionSpecs(question);
    const classes = options.map((opt) => opt.key);
    const label = classes.indexOf(gold);
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
        activeK: classes.length,
        options,
        question
      }
    ];
  });
}

function pairExamples(fixture: Fixture): PairExample[] {
  const gold = fixture.gold.file;
  if (!gold) return [];
  const request = requestOf(fixture.state);
  return candidatesOf(fixture.state).map((path) => ({
    id: fixture.id,
    split: fixture.split,
    path,
    gold,
    text: filePairInput(request, path),
    label: path === gold ? 1 : 0
  }));
}

/** Same yes-mass the engine uses: sigmoid of the scaled gap, then renormalize across paths. */
function fileDistribution(gaps: number[], temperature: number): number[] {
  const yes = gaps.map((gap) => 1 / (1 + Math.exp(-gap / temperature)));
  const mass = yes.reduce((sum, value) => sum + value, 0);
  return yes.map((value) => (mass > 0 ? value / mass : 1 / Math.max(1, yes.length)));
}

function fitTemperatures(
  slotRows: Array<SlotExample & { scores: number[] }>,
  fileGroups: Array<{ split: SlotExample["split"]; label: number; gaps: number[] }>
): Record<string, number> {
  const chosen: Record<string, number> = {};
  const byQuestion = new Map<string, Array<SlotExample & { scores: number[] }>>();
  for (const row of slotRows) {
    if (row.split !== "authored") continue;
    const bucket = byQuestion.get(row.questionId) ?? [];
    bucket.push(row);
    byQuestion.set(row.questionId, bucket);
  }
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
  const authoredFiles = fileGroups.filter((row) => row.split === "authored");
  let bestFileT = 1;
  let bestFileNll = Number.POSITIVE_INFINITY;
  for (const temperature of TEMPS) {
    let nll = 0;
    for (const group of authoredFiles) {
      const yes = fileDistribution(group.gaps, temperature);
      nll += -Math.log((yes[group.label] ?? 0) + 1e-12);
    }
    const mean = nll / Math.max(1, authoredFiles.length);
    if (mean < bestFileNll) {
      bestFileNll = mean;
      bestFileT = temperature;
    }
  }
  chosen.file = bestFileT;
  return chosen;
}

async function main(): Promise<void> {
  const trainSlots = expandAuthored(loadFixtures("authored")).flatMap(slotExamples);
  const trainPairs = expandAuthored(loadFixtures("authored").filter((row) => row.preset === "file")).flatMap(pairExamples);
  const evalSlots = loadFixtures().flatMap(slotExamples);
  const evalPairs = loadFixtures().filter((row) => row.preset === "file").flatMap(pairExamples);
  const texts = [...new Set([...trainSlots, ...evalSlots, ...trainPairs, ...evalPairs].map((row) => row.text))];

  const llama = await getLlama({ gpu: resolveGpuOption() });
  const model = await llama.loadModel({ modelPath: resolveModelPath() });
  const embedding = await model.createEmbeddingContext({ contextSize: 256 });
  const vectors = new Map<string, number[]>();
  for (const [i, text] of texts.entries()) {
    vectors.set(text, [...(await embedding.getEmbeddingFor(text)).vector]);
    if ((i + 1) % 20 === 0) console.error(`embed ${i + 1}/${texts.length}`);
  }
  const dim = vectors.values().next().value?.length ?? 0;

  const byQuestion = new Map<string, { classes: string[]; xs: number[][]; ys: number[]; ks: number[] }>();
  for (const row of trainSlots) {
    const bucket = byQuestion.get(row.questionId) ?? { classes: row.classes, xs: [], ys: [], ks: [] };
    bucket.xs.push(vectors.get(row.text) ?? []);
    bucket.ys.push(row.label);
    bucket.ks.push(row.activeK);
    byQuestion.set(row.questionId, bucket);
  }
  const heads: Record<string, ProbeHead> = {};
  for (const [questionId, bucket] of byQuestion) {
    heads[questionId] = fitSoftmax(bucket.xs, bucket.ys, bucket.classes, 0, 400, 0.8, bucket.ks);
  }
  heads.file = fitSoftmax(
    trainPairs.map((row) => vectors.get(row.text) ?? []),
    trainPairs.map((row) => row.label),
    ["no", "yes"],
    0
  );

  const slotScored = evalSlots.map((row) => {
    const head = heads[row.questionId];
    if (!head) throw new Error(`missing head ${row.questionId}`);
    return { ...row, scores: linearScores(vectors.get(row.text) ?? [], head).slice(0, row.options.length) };
  });
  const fileGroups = [...new Map(evalPairs.map((row) => [row.id, row.id])).keys()].map((id) => {
    const rows = evalPairs.filter((row) => row.id === id);
    const gaps = rows.map((row) => {
      const scores = linearScores(vectors.get(row.text) ?? [], heads.file!);
      return (scores[1] ?? 0) - (scores[0] ?? 0);
    });
    return {
      id,
      split: rows[0]!.split,
      gold: rows[0]!.gold,
      paths: rows.map((row) => row.path),
      label: rows.findIndex((row) => row.path === row.gold),
      gaps
    };
  });
  const temperatures = fitTemperatures(slotScored, fileGroups);

  const decisions = [
    ...slotScored.map((row) => {
      const temperature = temperatures[row.questionId] ?? 1;
      const probs = softmax(row.scores.map((score) => score / temperature));
      const probabilities = Object.fromEntries(row.options.map((opt, i) => [opt.key, probs[i] ?? 0]));
      const answer = toAnswer(row.question.type, row.options, probabilities);
      const { action } = decideAction({ [row.questionId]: answer });
      const predicted = row.options.reduce((best, opt) =>
        (probabilities[opt.key] ?? 0) > (probabilities[best.key] ?? 0) ? opt : best
      ).key;
      const sorted = [...row.scores.map((score) => score / temperature)].sort((a, b) => b - a);
      return {
        id: row.id,
        split: row.split,
        preset: row.preset,
        gold: row.gold,
        predicted,
        action,
        hit: predicted === row.gold,
        gap: (sorted[0] ?? 0) - (sorted[1] ?? 0)
      };
    }),
    ...fileGroups.map((group) => {
      const temperature = temperatures.file ?? 1;
      const yes = fileDistribution(group.gaps, temperature);
      const winner = group.paths.reduce((best, path, index) => ((yes[index] ?? 0) > (yes[best] ?? 0) ? index : best), 0);
      const forward = group.paths[winner] ?? "";
      const reversedYes = [...yes].reverse();
      const reversedWinner = reversedYes.reduce((best, value, index) => (value > (reversedYes[best] ?? 0) ? index : best), 0);
      const reversed = [...group.paths].reverse()[reversedWinner] ?? "";
      const pack = resolvePack(
        loadFixtures().find((row) => row.id === group.id)?.state as State,
        "file",
        undefined
      );
      const question = pack.questions.file;
      if (!question) throw new Error(`missing file question for ${group.id}`);
      const probabilities = Object.fromEntries(group.paths.map((path, i) => [path, yes[i] ?? 0]));
      const answer = toAnswer(question.type, optionSpecs(question), probabilities);
      const { action } = decideAction({ file: answer });
      const sorted = [...yes].sort((a, b) => b - a);
      return {
        id: group.id,
        split: group.split,
        preset: "file",
        gold: group.gold,
        predicted: forward,
        action,
        hit: forward === group.gold,
        gap: Math.log(((sorted[0] ?? 0) + 1e-12) / ((sorted[1] ?? 0) + 1e-12)),
        reverse_same: forward === reversed
      };
    })
  ];

  const count = (split: "authored" | "heldout") => {
    const subset = decisions.filter((row) => row.split === split);
    return { ok: subset.filter((row) => row.hit).length, n: subset.length };
  };
  const heldout = count("heldout");
  const falseAutos = decisions.filter((row) => isDestructiveFalseAuto(row.preset, row.gold, row.action)).map((row) => row.id);
  const reverseMismatches = decisions.filter((row) => row.preset === "file" && row.reverse_same === false).map((row) => row.id);
  const gate = heldout.ok >= HELD_GATE && falseAutos.length === 0 && reverseMismatches.length === 0;
  const report = {
    temperatures,
    authored: count("authored"),
    heldout,
    actions: decisions.reduce(
      (acc, row) => {
        acc[row.action] += 1;
        return acc;
      },
      { auto: 0, review: 0, stop: 0 }
    ),
    destructive_false_auto: falseAutos,
    reverse_mismatches: reverseMismatches,
    gate,
    misses: decisions.filter((row) => !row.hit).map((row) => `${row.id}:${row.gold}->${row.predicted}`),
    command: decisions
      .filter((row) => row.preset === "command")
      .map((row) => ({ id: row.id, gold: row.gold, predicted: row.predicted, action: row.action, gap: Number(row.gap.toFixed(4)) }))
  };

  const outDir = join(process.cwd(), "bench", "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "head-joint-report.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ gate, authored: report.authored, heldout, falseAutos, reverseMismatches, temperatures }, null, 2));

  if (gate) {
    const artifact: HeadMlpArtifact = { modelId: modelId(), dim, fileScoring: "pair", temperature: temperatures, heads };
    const dest = defaultHeadMlpPath();
    if (existsSync(dest)) copyFileSync(dest, join(outDir, "head-mlp-before-joint.json"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(artifact));
    console.error(`wrote ${dest}`);
  } else {
    console.error("gate failed; production weights left untouched");
  }

  await embedding.dispose();
  await model.dispose();
  await llama.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
