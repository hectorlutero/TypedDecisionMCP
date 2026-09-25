import { DecideError } from "../src/contract.js";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

export function spawnMedian(samples: number[]): number {
  if (samples.length !== 3 || samples.some((value) => !(value > 0))) {
    throw new DecideError("invalid_request", "cursor-subagent requires spawn_ms: three positive timings");
  }
  return median(samples);
}

export function applySpawn(latencyRawMs: number, spawnMs: number): number {
  return Math.max(1, latencyRawMs - spawnMs);
}

/** Hop is void if spawn ate the clock. */
export function isLatencyValid(latencyMs: number, latencyRawMs: number | undefined): boolean {
  if (latencyRawMs == null) return true;
  return latencyMs >= 0.5 * latencyRawMs;
}
