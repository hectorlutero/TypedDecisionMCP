import { describe, expect, it } from "vitest";
import { actionForSignal, decideAction, loadThresholds, signalFor } from "./policy.js";

const thresholds = { auto: 0.8, review: 0.5 };

describe("policy", () => {
  it("treats command yes as risk", () => {
    expect(signalFor("command", { type: "yesno", yes: 0.9 })).toBeCloseTo(0.1);
    expect(decideAction({ command: { type: "yesno", yes: 0.9 } }, thresholds).action).toBe("stop");
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
        command: { type: "yesno", yes: 0.9 }
      },
      thresholds
    );
    expect(action).toBe("stop");
  });

  it("prefers DECIDE_ thresholds then DECIDIR_ fallback", () => {
    expect(loadThresholds({ DECIDE_AUTO: "0.9", DECIDE_REVIEW: "0.3" })).toEqual({ auto: 0.9, review: 0.3 });
    expect(loadThresholds({ DECIDIR_AUTO: "0.85", DECIDIR_REVIEW: "0.4" })).toEqual({ auto: 0.85, review: 0.4 });
    expect(
      loadThresholds({
        DECIDE_AUTO: "0.9",
        DECIDIR_AUTO: "0.7",
        DECIDE_REVIEW: "0.3",
        DECIDIR_REVIEW: "0.2"
      })
    ).toEqual({ auto: 0.9, review: 0.3 });
  });
});
