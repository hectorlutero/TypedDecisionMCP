/**
 * Engine-level file hop latency after prefix-KV wiring (scoreFilePair).
 * Compares cold file-01 once the head-mlp engine is warm.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { loadFixtures } from "./load-fixtures.js";
import { HeadMlpEngine } from "../src/engine/head-mlp.js";
import type { State } from "../src/contract.js";
import { resolvePack } from "../src/packs/cursor.js";

const engine = new HeadMlpEngine();
await engine.init();

const ids = ["file-01", "file-02", "cmd-01"];
const rows: Array<{ id: string; ms: number; pick?: string }> = [];

for (const id of ids) {
  const fixture = loadFixtures().find((row) => row.id === id);
  if (!fixture) throw new Error(id);
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  const t0 = performance.now();
  const scored = await engine.score(fixture.state as State, pack.questions);
  const ms = performance.now() - t0;
  const qid = Object.keys(pack.questions)[0] ?? "";
  const answer = scored.answers[qid];
  const pick =
    answer && typeof answer === "object" && "key" in answer
      ? String((answer as { key: string }).key)
      : answer && typeof answer === "object" && "label" in answer
        ? String((answer as { label: string }).label)
        : undefined;
  rows.push({ id, ms, pick });
  console.error(`${id} ${ms.toFixed(0)}ms pick=${pick ?? "?"}`);
}

// Repeat file-01 (cache warm for same texts)
{
  const fixture = loadFixtures().find((row) => row.id === "file-01");
  if (!fixture) throw new Error("file-01");
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  const t0 = performance.now();
  await engine.score(fixture.state as State, pack.questions);
  rows.push({ id: "file-01-repeat", ms: performance.now() - t0 });
  console.error(`file-01-repeat ${(performance.now() - t0).toFixed(0)}ms`);
}

const report = { rows, note: "prefix-KV wired in scoreFilePair; repeat should hit EmbeddingCache" };
mkdirSync("bench/out", { recursive: true });
writeFileSync("bench/out/day4-file-kv-engine.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await engine.dispose();
