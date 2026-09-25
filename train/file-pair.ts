import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLlama } from "node-llama-cpp";
import { loadFixtures, type Fixture } from "../bench/load-fixtures.js";
import { isRecord, type State } from "../src/contract.js";
import { filePairInput, linearScores, softmax } from "../src/engine/head-mlp.js";
import { resolveGpuOption } from "../src/engine/logits.js";
import { resolveModelPath } from "../src/model-path.js";
import { fitSoftmax } from "./fit.js";
import { expandAuthored } from "./paraphrase.js";

const LAMBDAS = [0.1, 0.01, 0.001, 0];

type Pair = {
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

/** One candidate at a time, so the slot index is not in the text. */
export function pairText(request: string, path: string): string {
  return filePairInput(request, path);
}

function pairsFor(fixture: Fixture): Pair[] {
  const gold = fixture.gold.file;
  if (!gold) return [];
  const request = requestOf(fixture.state as State);
  return candidatesOf(fixture.state).map((path) => ({
    id: fixture.id,
    split: fixture.split,
    path,
    gold,
    text: pairText(request, path),
    label: path === gold ? 1 : 0
  }));
}

export function pickCandidate(rows: Array<{ path: string; yes: number }>): string {
  return rows.reduce((best, row) => (row.yes > best.yes ? row : best)).path;
}

async function main(): Promise<void> {
  const train = expandAuthored(loadFixtures("authored").filter((row) => row.preset === "file")).flatMap(pairsFor);
  const evalRows = loadFixtures()
    .filter((row) => row.preset === "file")
    .flatMap(pairsFor);
  const texts = [...new Set([...train, ...evalRows].map((row) => row.text))];
  const llama = await getLlama({ gpu: resolveGpuOption() });
  const model = await llama.loadModel({ modelPath: resolveModelPath() });
  const embedding = await model.createEmbeddingContext({ contextSize: 256 });
  const vectors = new Map<string, number[]>();
  for (const text of texts) {
    vectors.set(text, [...(await embedding.getEmbeddingFor(text)).vector]);
  }
  console.error(`embed ${texts.length} pair texts`);

  const results = LAMBDAS.map((lambda) => {
    const head = fitSoftmax(
      train.map((row) => vectors.get(row.text) ?? []),
      train.map((row) => row.label),
      ["no", "yes"],
      lambda
    );
    const byId = new Map<string, { split: Pair["split"]; gold: string; scored: Array<{ path: string; yes: number }> }>();
    for (const row of evalRows) {
      const scores = linearScores(vectors.get(row.text) ?? [], head);
      const yes = softmax(scores)[1] ?? 0;
      const bucket = byId.get(row.id) ?? { split: row.split, gold: row.gold, scored: [] };
      bucket.scored.push({ path: row.path, yes });
      byId.set(row.id, bucket);
    }
    const decisions = [...byId.entries()].map(([id, bucket]) => {
      const forward = pickCandidate(bucket.scored);
      const reversed = pickCandidate([...bucket.scored].reverse());
      return {
        id,
        split: bucket.split,
        gold: bucket.gold,
        predicted: forward,
        hit: forward === bucket.gold,
        reverse_same: forward === reversed
      };
    });
    const acc = (split: Pair["split"]) => {
      const subset = decisions.filter((row) => row.split === split);
      return { ok: subset.filter((row) => row.hit).length, n: subset.length };
    };
    return {
      lambda,
      authored: acc("authored"),
      heldout: acc("heldout"),
      reverse_mismatches: decisions.filter((row) => !row.reverse_same).map((row) => row.id),
      decisions
    };
  });

  const outPath = join(process.cwd(), "bench", "out", "file-pair.json");
  mkdirSync(join(process.cwd(), "bench", "out"), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ results }, null, 2));
  console.log(outPath);
  for (const row of results) {
    console.error(
      `lambda ${row.lambda} authored ${row.authored.ok}/${row.authored.n} held ${row.heldout.ok}/${row.heldout.n} reverse_mismatches ${row.reverse_mismatches.length}`
    );
  }

  await embedding.dispose();
  await model.dispose();
  await llama.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
