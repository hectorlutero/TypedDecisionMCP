import { describe, expect, it } from "vitest";
import { goldHits } from "./score-gold.js";

describe("goldHits", () => {
  it("scores yesno and choice", () => {
    const hits = goldHits(
      {
        id: "t",
        split: "authored",
        preset: "comando",
        state: {},
        gold: { comando: "yes", subagente: "explore" }
      },
      {
        comando: { type: "yesno", yes: 0.8 },
        subagente: {
          type: "choice",
          choice: "explore",
          probabilities: { explore: 0.7, generalPurpose: 0.3 },
          confidence: 0.5
        }
      }
    );
    expect(hits).toEqual({ ok: 2, n: 2 });
  });
});
