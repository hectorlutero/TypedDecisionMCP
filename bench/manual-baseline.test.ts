import { describe, expect, it } from "vitest";
import { DecideError } from "../src/contract.js";
import { parseManualBaseline, toMeasuredBaseline } from "./manual-baseline.js";
import { countTokens } from "./token-count.js";

const ui = {
  method: "cursor-ui" as const,
  model: "cursor-composer",
  rows: [
    { id: "cmd-01", output_tokens: 800, latency_ms: 4000, text: "reason cmd" },
    { id: "sub-01", output_tokens: 700, latency_ms: 3500 },
    { id: "diff-02", output_tokens: 600, latency_ms: 3000, text: "reason diff" },
    { id: "file-01", output_tokens: 500, latency_ms: 2800 },
    { id: "commit-01", output_tokens: 550, latency_ms: 3200 }
  ]
};

const proxy = {
  method: "cursor-subagent" as const,
  model: "cursor-subagent",
  spawn_ms: [1000, 1100, 1200] as [number, number, number],
  rows: [
    { id: "cmd-01", text: "a".repeat(400), latency_raw_ms: 5000 },
    { id: "sub-01", text: "b".repeat(400), latency_raw_ms: 4800 },
    { id: "diff-02", text: "c".repeat(400), latency_raw_ms: 4600 },
    { id: "file-01", text: "d".repeat(400), latency_raw_ms: 4400 },
    { id: "commit-01", text: "e".repeat(400), latency_raw_ms: 4200 }
  ]
};

describe("manual baseline", () => {
  it("accepts cursor-ui hops including diff-02", () => {
    const measured = toMeasuredBaseline(parseManualBaseline(ui), "2026-09-23T00:00:00.000Z");
    expect(measured.source).toBe("measured");
    expect(measured.method).toBe("cursor-ui");
    expect(measured.rows.map((row) => row.id)).toEqual([
      "cmd-01",
      "sub-01",
      "diff-02",
      "file-01",
      "commit-01"
    ]);
  });

  it("counts proxy tokens from text and subtracts spawn median", () => {
    const measured = toMeasuredBaseline(parseManualBaseline(proxy));
    expect(measured.method).toBe("cursor-subagent");
    expect(measured.rows[0]?.output_tokens).toBe(countTokens(proxy.rows[0]?.text ?? ""));
    expect(measured.rows[0]?.latency_ms).toBe(5000 - 1100);
    expect(measured.rows[0]?.text.length).toBeGreaterThan(0);
  });

  it("rejects zeros, missing hops, and spawn-eaten clocks", () => {
    expect(() => parseManualBaseline({ method: "cursor-ui", model: "x", rows: ui.rows.slice(0, 4) })).toThrow(
      DecideError
    );
    expect(() =>
      toMeasuredBaseline(
        parseManualBaseline({
          ...proxy,
          rows: proxy.rows.map((row, i) => (i === 0 ? { ...row, latency_raw_ms: 1500 } : row))
        })
      )
    ).toThrow(DecideError);
  });
});
