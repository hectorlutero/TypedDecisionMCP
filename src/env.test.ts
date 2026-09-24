import { describe, expect, it } from "vitest";
import { fewShotEnabled } from "./env.js";

describe("fewShotEnabled", () => {
  it("is off unless DECIDE_FEWSHOT is 1", () => {
    expect(fewShotEnabled({})).toBe(false);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "0" })).toBe(false);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "1" })).toBe(true);
    expect(fewShotEnabled({ DECIDIR_FEWSHOT: "1" })).toBe(true);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "0", DECIDIR_FEWSHOT: "1" })).toBe(false);
  });
});
