/**
 * Warm re-measure of file-01 / cmd-01 after prefix-KV (engine already init).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { loadFixtures } from "./load-fixtures.js";
import { HeadMlpEngine } from "../src/engine/head-mlp.js";
import type { State } from "../src/contract.js";
import { resolvePack } from "../src/packs/cursor.js";

const engine = new HeadMlpEngine();
await engine.init();

async function time(id: string, n = 3): Promise<number[]> {
  const fixture = loadFixtures().find((row) => row.id === id);
  if (!fixture) throw new Error(id);
  const pack = resolvePack(fixture.state as State, fixture.preset, undefined);
  // discard first to clear cold quirks within this process
  await engine.score(fixture.state as State, pack.questions);
  // force miss on file by disposing? no — for file we need cold KV path.
  // Clear embedding cache between timed runs via dispose/re-init is heavy.
  // Instead: unique suffix — can't. Re-init embedding by clearing cache through private.
  const ms: number[] = [];
  for (let i = 0; i < n; i += 1) {
    // Bust string cache so GGUF runs; mutate request slightly then restore — NO that changes vectors.
    // Access private cache clear:
    (engine as unknown as { cache: { clear: () => void } }).cache.clear();
    const t0 = performance.now();
    await engine.score(fixture.state as State, pack.questions);
    ms.push(performance.now() - t0);
  }
  return ms;
}

const fileMs = await time("file-01", 3);
const cmdMs = await time("cmd-01", 3);
const report = {
  file01_ms: fileMs,
  file01_median: [...fileMs].sort((a, b) => a - b)[1],
  cmd01_ms: cmdMs,
  cmd01_median: [...cmdMs].sort((a, b) => a - b)[1]
};
mkdirSync("bench/out", { recursive: true });
writeFileSync("bench/out/day4-file-kv-warm.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await engine.dispose();
