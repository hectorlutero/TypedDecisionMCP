import { describe, expect, it } from "vitest";
import { TOKENIZER_ID, countTokens, hopTokens, transcriptTokens } from "./token-count.js";

describe("token-count", () => {
  it("pins chars/4 on both sides", () => {
    expect(TOKENIZER_ID).toBe("chars/4");
    expect(countTokens("abcd")).toBe(1);
    expect(countTokens("abcde")).toBe(2);
    expect(hopTokens("abcd", 99).ruler).toBe("chars/4");
    expect(hopTokens("", 42).ruler).toBe("ui");
    expect(transcriptTokens({ a: 1 })).toBe(countTokens(JSON.stringify({ a: 1 })));
  });
});
