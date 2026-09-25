import { describe, expect, it } from "vitest";
import { TOKENIZER_ID, compactDecisionAnswers, countTokens, hopTokens, transcriptTokens } from "./token-count.js";

describe("token-count", () => {
  it("pins chars/4 on both sides", () => {
    expect(TOKENIZER_ID).toBe("chars/4");
    expect(countTokens("abcd")).toBe(1);
    expect(countTokens("abcde")).toBe(2);
    expect(hopTokens("abcd", 99).ruler).toBe("chars/4");
    expect(hopTokens("", 42).ruler).toBe("ui");
    expect(transcriptTokens({ a: 1 })).toBe(countTokens(JSON.stringify({})));
  });

  it("drops probabilities and legend from the 10x transcript", () => {
    const compact = compactDecisionAnswers({
      file: {
        type: "choice",
        choice: "src/policy.ts",
        probabilities: { "src/policy.ts": 0.9, "src/index.ts": 0.1 },
        confidence: 1
      },
      commit: {
        type: "score",
        score: 0.2,
        legend: { "0": "missing tests — not ready" },
        probabilities: { "0": 0.8 },
        confidence: 0.9
      }
    });
    expect(compact).toEqual({
      file: { type: "choice", choice: "src/policy.ts" },
      commit: { type: "score", score: 0.2 }
    });
  });
});
