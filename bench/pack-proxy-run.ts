import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures } from "./load-fixtures.js";
import { parseManualBaseline, toMeasuredBaseline } from "./manual-baseline.js";
import { TOKENIZER_ID, countTokens } from "./token-count.js";

const root = dirname(fileURLToPath(import.meta.url));

type Run = {
  agent?: string;
  spawn: Array<{ ms: number }>;
  hops: Array<{ id: string; text: string; latency_raw_ms: number }>;
};

const runPath = process.argv[2] ?? join(root, "out/proxy-run-v2.json");
const run = JSON.parse(readFileSync(runPath, "utf8")) as Run;
const spawn = run.spawn.map((row) => row.ms);
if (spawn.length !== 3) throw new Error("expected three spawn timings");

const manual = {
  method: "cursor-subagent" as const,
  model: "cursor-subagent-inherit",
  spawn_ms: spawn as [number, number, number],
  rows: run.hops.map((hop) => ({
    id: hop.id,
    text: hop.text,
    latency_raw_ms: hop.latency_raw_ms
  }))
};

const dest = join(root, "baseline.json");
try {
  writeFileSync(dest, JSON.stringify(toMeasuredBaseline(parseManualBaseline(manual)), null, 2));
  console.log(dest);
} catch (err) {
  const fixtures = new Map(loadFixtures("authored").map((row) => [row.id, row]));
  const measured = {
    source: "measured" as const,
    method: "cursor-subagent" as const,
    tokenizer: TOKENIZER_ID,
    model: "cursor-subagent-inherit",
    recorded_at: new Date().toISOString(),
    spawn_void: true,
    spawn_ms_observed: spawn,
    agent: run.agent,
    note: err instanceof Error ? err.message : String(err),
    rows: run.hops.map((hop) => {
      const fixture = fixtures.get(hop.id);
      if (!fixture) throw new Error(`unknown hop ${hop.id}`);
      return {
        id: hop.id,
        split: "authored" as const,
        preset: fixture.preset,
        latency_ms: hop.latency_raw_ms,
        latency_raw_ms: hop.latency_raw_ms,
        output_tokens: countTokens(hop.text),
        prompt_tokens: 0 as const,
        text: hop.text
      };
    })
  };
  writeFileSync(dest, JSON.stringify(measured, null, 2));
  console.error("spawn void; wrote raw-latency baseline");
  console.log(dest);
}
