import { describe, expect, it } from "vitest";
import { actionForSignal, decideAction, signalFor } from "./policy.js";

const thresholds = { auto: 0.8, review: 0.5 };

describe("policy", () => {
  it("treats comando yes as risk", () => {
    expect(signalFor("comando", { type: "yesno", yes: 0.9 })).toBeCloseTo(0.1);
    expect(decideAction({ comando: { type: "yesno", yes: 0.9 } }, thresholds).action).toBe("stop");
  });

  it("treats other yesno as ok-if-yes", () => {
    expect(signalFor("diff", { type: "yesno", yes: 0.9 })).toBeCloseTo(0.9);
    expect(decideAction({ diff: { type: "yesno", yes: 0.9 } }, thresholds).action).toBe("auto");
  });

  it("maps signal bands", () => {
    expect(actionForSignal(0.4, thresholds)).toBe("stop");
    expect(actionForSignal(0.6, thresholds)).toBe("review");
    expect(actionForSignal(0.9, thresholds)).toBe("auto");
  });

  it("lets the worst action win", () => {
    const { action } = decideAction(
      {
        diff: { type: "yesno", yes: 0.95 },
        comando: { type: "yesno", yes: 0.9 }
      },
      thresholds
    );
    expect(action).toBe("stop");
  });
});
