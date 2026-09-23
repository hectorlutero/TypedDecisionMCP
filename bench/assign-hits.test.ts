import { describe, expect, it } from "vitest";
import { assignHits } from "./assign-hits.js";
import { emptyManual } from "./ui-log-state.js";
import type { CursorHopHit } from "./cursor-store.js";

function hit(id: CursorHopHit["id"], composerId: string, latency_ms: number): CursorHopHit {
  return { id, composerId, latency_ms, text: `answer ${id}`, clock: "cursor-db" };
}

describe("assignHits", () => {
  it("fills the next empty sample and skips seen composer ids", () => {
    const seen = new Set<string>(["old"]);
    const first = assignHits(emptyManual(), [hit("cmd-01", "a", 4100), hit("cmd-01", "old", 1)], seen);
    expect(first.added.map((row) => row.composerId)).toEqual(["a"]);
    expect(first.manual.rows[0]?.samples[0]?.latency_ms).toBe(4100);
    const second = assignHits(first.manual, [hit("cmd-01", "a", 4100), hit("cmd-01", "b", 3900)], seen);
    expect(second.added.map((row) => row.composerId)).toEqual(["b"]);
    expect(second.manual.rows[0]?.samples[1]?.latency_ms).toBe(3900);
  });
});
