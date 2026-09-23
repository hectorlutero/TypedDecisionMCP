import { describe, expect, it } from "vitest";
import { applySample, emptyManual, isSampleFilled, nextEmptySlot } from "./ui-log-state.js";

describe("ui-log-state", () => {
  it("starts at cmd-01 sample 0", () => {
    expect(nextEmptySlot(emptyManual())).toEqual({ id: "cmd-01", sample: 0 });
  });

  it("walks to the next empty sample", () => {
    let manual = emptyManual();
    manual = applySample(manual, { id: "cmd-01", sample: 0 }, { latency_ms: 4100, text: "one" });
    expect(nextEmptySlot(manual)).toEqual({ id: "cmd-01", sample: 1 });
    manual = applySample(manual, { id: "cmd-01", sample: 1 }, { latency_ms: 3900, text: "two" });
    manual = applySample(manual, { id: "cmd-01", sample: 2 }, { latency_ms: 4000, text: "three" });
    expect(nextEmptySlot(manual)).toEqual({ id: "sub-01", sample: 0 });
  });

  it("treats empty text as not filled", () => {
    expect(isSampleFilled({ latency_ms: 100, text: "  " })).toBe(false);
    expect(isSampleFilled({ latency_ms: 100, text: "ok" })).toBe(true);
  });
});
