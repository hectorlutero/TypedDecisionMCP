import { describe, expect, it } from "vitest";
import { divideByPrior, optionMass, priorCacheKey } from "./calibrate.js";

describe("calibrate", () => {
  it("divides by prior and can flip a yes-biased argmax", () => {
    const calibrated = divideByPrior({ yes: 0.6, no: 0.4 }, { yes: 0.9, no: 0.1 });
    expect(calibrated.no ?? 0).toBeGreaterThan(calibrated.yes ?? 0);
    expect((calibrated.yes ?? 0) + (calibrated.no ?? 0)).toBeCloseTo(1);
  });

  it("sums token probabilities per option", () => {
    const probs = new Map<number, number>([
      [1, 0.2],
      [2, 0.1],
      [3, 0.4]
    ]);
    const mass = optionMass(["yes", "no"], { yes: [1, 2], no: [3] }, (token) => probs.get(token) ?? 0);
    expect(mass.yes).toBeCloseTo(0.3);
    expect(mass.no).toBeCloseTo(0.4);
  });

  it("keys priors by instructions and labels", () => {
    expect(
      priorCacheKey("q", [
        { key: "yes", label: "A" },
        { key: "no", label: "B" }
      ])
    ).toBe(priorCacheKey("q", [
      { key: "yes", label: "A" },
      { key: "no", label: "B" }
    ]));
    expect(priorCacheKey("q1", [{ key: "a", label: "A" }])).not.toBe(
      priorCacheKey("q2", [{ key: "a", label: "A" }])
    );
  });
});
