import { describe, expect, it } from "vitest";
import { engineKind, fewShotEnabled } from "./env.js";

describe("fewShotEnabled", () => {
  it("is off unless DECIDE_FEWSHOT is 1", () => {
    expect(fewShotEnabled({})).toBe(false);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "0" })).toBe(false);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "1" })).toBe(true);
    expect(fewShotEnabled({ DECIDIR_FEWSHOT: "1" })).toBe(true);
    expect(fewShotEnabled({ DECIDE_FEWSHOT: "0", DECIDIR_FEWSHOT: "1" })).toBe(false);
  });
});

describe("engineKind", () => {
  it("defaults to head-mlp; DECIDE_ENGINE=logits opts into logits", () => {
    expect(engineKind({})).toBe("head-mlp");
    expect(engineKind({ DECIDE_ENGINE: "head-mlp" })).toBe("head-mlp");
    expect(engineKind({ DECIDE_ENGINE: "logits" })).toBe("logits");
    expect(engineKind({ DECIDIR_ENGINE: "logits" })).toBe("logits");
    expect(engineKind({ DECIDE_ENGINE: "logits", DECIDIR_ENGINE: "head-mlp" })).toBe("logits");
  });
});
