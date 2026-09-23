import { describe, expect, it } from "vitest";
import { DecideError } from "../src/contract.js";
import { parseManualBaseline, toMeasuredBaseline } from "./manual-baseline.js";

const complete = {
  model: "cursor-composer",
  rows: [
    { id: "cmd-01", output_tokens: 800, latency_ms: 4000 },
    { id: "sub-01", output_tokens: 700, latency_ms: 3500 },
    { id: "diff-01", output_tokens: 600, latency_ms: 3000 },
    { id: "file-01", output_tokens: 500, latency_ms: 2800 },
    { id: "commit-01", output_tokens: 550, latency_ms: 3200 }
  ]
};

describe("manual baseline", () => {
  it("accepts the five hops and marks source measured", () => {
    const measured = toMeasuredBaseline(parseManualBaseline(complete), "2026-09-23T00:00:00.000Z");
    expect(measured.source).toBe("measured");
    expect(measured.method).toBe("cursor-hop");
    expect(measured.rows.map((row) => row.id)).toEqual([
      "cmd-01",
      "sub-01",
      "diff-01",
      "file-01",
      "commit-01"
    ]);
    expect(measured.rows[0]?.preset).toBe("comando");
  });

  it("rejects zeros and missing hops", () => {
    expect(() => parseManualBaseline({ model: "x", rows: complete.rows.slice(0, 4) })).toThrow(DecideError);
    expect(() =>
      parseManualBaseline({
        model: "x",
        rows: complete.rows.map((row, i) => (i === 0 ? { ...row, output_tokens: 0 } : row))
      })
    ).toThrow(DecideError);
  });
});
