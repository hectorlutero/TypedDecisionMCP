/**
 * Aggregate bench/campo/log.jsonl for the field economy week.
 * Usage: npx tsx bench/campo/summarize.ts [path]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Row = {
  date?: string;
  roteiro?: string;
  modelo_ui?: string;
  mcp?: string;
  task_id?: string;
  decide_calls?: number;
  wall_turn_s?: number | null;
  tokens_ui?: { total?: number | null; input?: number | null; output?: number | null } | null;
  erro_caro?: string;
  action_seen?: string;
};

const path = resolve(process.argv[2] ?? "bench/campo/log.jsonl");
if (!existsSync(path)) {
  console.error(`missing ${path}`);
  process.exit(1);
}

const rows: Row[] = readFileSync(path, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Row);

if (rows.length === 0) {
  console.error("log.jsonl vazio — corre os roteiros e acrescenta linhas");
  process.exit(1);
}

const key = (r: Row) => `${r.modelo_ui ?? "?"}::${r.roteiro ?? "?"}::${r.mcp ?? "?"}`;
const groups = new Map<string, Row[]>();
for (const row of rows) {
  const k = key(row);
  const bucket = groups.get(k) ?? [];
  bucket.push(row);
  groups.set(k, bucket);
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

console.log(`rows=${rows.length} file=${path}\n`);
console.log("grupo\tn\twall_s_mean\ttokens_total_mean\tdecide_calls_mean\terros_caros");

for (const [k, bucket] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const walls = bucket.map((r) => r.wall_turn_s).filter((x): x is number => typeof x === "number");
  const toks = bucket
    .map((r) => r.tokens_ui?.total)
    .filter((x): x is number => typeof x === "number");
  const calls = bucket.map((r) => r.decide_calls ?? 0);
  const erros = bucket.filter((r) => r.erro_caro && r.erro_caro !== "none").length;
  const w = mean(walls);
  const t = mean(toks);
  const c = mean(calls);
  console.log(
    [
      k,
      bucket.length,
      w == null ? "—" : w.toFixed(1),
      t == null ? "—" : t.toFixed(0),
      c == null ? "—" : c.toFixed(1),
      erros
    ].join("\t")
  );
}

const caros = rows.filter((r) => r.erro_caro && r.erro_caro !== "none");
if (caros.length > 0) {
  console.log("\nerros_caros:");
  for (const r of caros) {
    console.log(`- ${r.date} ${r.roteiro} ${r.modelo_ui} ${r.mcp} ${r.task_id}: ${r.erro_caro}`);
  }
}
