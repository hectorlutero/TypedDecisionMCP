import { readFileSync } from "node:fs";
import { median } from "./spawn.js";
import { loadFixtures } from "./load-fixtures.js";
import { binaryLogitGap, isDestructiveFalseAuto, probLogitGap } from "./cost-math.js";

type BenchRow = {
  id: string;
  split: string;
  preset: string;
  action: string;
  hits: { ok: number; n: number };
  answers: Record<string, { type?: string; yes?: number; probabilities?: Record<string, number> }>;
};

function gapOf(answer: BenchRow["answers"][string] | undefined): number {
  if (!answer) return Number.NaN;
  if (answer.type === "yesno" && typeof answer.yes === "number") return binaryLogitGap(answer.yes);
  if (answer.probabilities) return probLogitGap(answer.probabilities);
  return Number.NaN;
}

function summarize(path: string) {
  const gold = new Map(loadFixtures().map((row) => [row.id, row]));
  const rows = (JSON.parse(readFileSync(path, "utf8")) as { rows: BenchRow[] }).rows;
  const actions = { auto: 0, review: 0, stop: 0 };
  const gaps = new Map<string, number[]>();
  const falseAutos: string[] = [];
  const misses: string[] = [];
  let authoredOk = 0;
  let authoredN = 0;
  let heldOk = 0;
  let heldN = 0;

  for (const row of rows) {
    if (row.action === "auto" || row.action === "review" || row.action === "stop") actions[row.action] += 1;
    if (row.split === "authored") {
      authoredOk += row.hits.ok;
      authoredN += row.hits.n;
    } else {
      heldOk += row.hits.ok;
      heldN += row.hits.n;
    }
    if (row.hits.ok < row.hits.n) misses.push(row.id);
    const fixture = gold.get(row.id);
    const answer = row.answers[Object.keys(row.answers)[0] ?? ""];
    const bucket = gaps.get(`${row.split}:${row.preset}`) ?? [];
    bucket.push(gapOf(answer));
    gaps.set(`${row.split}:${row.preset}`, bucket);
    const commandGold = fixture?.gold.command;
    if (commandGold && isDestructiveFalseAuto(row.preset, commandGold, row.action)) falseAutos.push(row.id);
  }

  const gapSummary = Object.fromEntries(
    [...gaps.entries()].map(([key, values]) => [key, Number(median(values).toFixed(4))])
  );
  return {
    path,
    authored: `${authoredOk}/${authoredN}`,
    heldout: `${heldOk}/${heldN}`,
    actions,
    destructive_false_auto: falseAutos,
    median_gap_nats: gapSummary,
    misses
  };
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("usage: tsx bench/cost-report.ts <bench.json> [other.json]");
  process.exit(1);
}
const reports = paths.map(summarize);
const paired =
  reports.length === 2
    ? reports[0]!.misses
        .filter((id) => !reports[1]!.misses.includes(id))
        .concat(reports[1]!.misses.filter((id) => !reports[0]!.misses.includes(id)))
        .sort()
    : [];
console.log(JSON.stringify({ reports, disagree_on: paired }, null, 2));
