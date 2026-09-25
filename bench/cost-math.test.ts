import { describe, expect, it } from "vitest";
import { binaryLogitGap, isDestructiveFalseAuto, probLogitGap } from "./cost-math.js";

describe("cost math", () => {
  it("turns a near-coin yesno into a tiny nat gap", () => {
    expect(binaryLogitGap(0.503)).toBeCloseTo(Math.log(0.503 / 0.497), 5);
    expect(binaryLogitGap(0.503)).toBeLessThan(0.02);
  });

  it("grows when the top class pulls away", () => {
    expect(probLogitGap({ a: 0.8, b: 0.2 })).toBeCloseTo(Math.log(4), 5);
    expect(probLogitGap({ a: 0.8, b: 0.2 })).toBeGreaterThan(probLogitGap({ a: 0.51, b: 0.49 }));
  });

  it("flags only a destructive command released as auto", () => {
    expect(isDestructiveFalseAuto("command", "yes", "auto")).toBe(true);
    expect(isDestructiveFalseAuto("command", "no", "auto")).toBe(false);
    expect(isDestructiveFalseAuto("command", "yes", "stop")).toBe(false);
    expect(isDestructiveFalseAuto("diff", "yes", "auto")).toBe(false);
  });
});
