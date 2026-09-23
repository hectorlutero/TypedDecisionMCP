import { describe, expect, it } from "vitest";
import { optionTokenIds } from "./tokenize.js";

describe("optionTokenIds", () => {
  it("keeps both bare and spaced single tokens", () => {
    const tokenizer = {
      tokenize(text: string) {
        if (text === "yes") return [9693];
        if (text === " yes") return [9834];
        return [1, 2];
      }
    };
    expect(optionTokenIds(tokenizer, "yes")).toEqual([9693, 9834]);
  });
});
