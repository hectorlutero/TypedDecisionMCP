import { describe, expect, it } from "vitest";
import { DecideError, parseDecideInput } from "./contract.js";

describe("parseDecideInput", () => {
  it("accepts a yesno preset", () => {
    const input = parseDecideInput({ state: "git status", preset: "comando" });
    expect(input.preset).toBe("comando");
  });

  it("rejects empty requests", () => {
    expect(() => parseDecideInput({ state: "x" })).toThrow(DecideError);
  });

  it("accepts yesno options on a custom question", () => {
    const input = parseDecideInput({
      state: { request: "x", diff: "y" },
      questions: {
        diff: {
          type: "yesno",
          instructions: "compare",
          options: { yes: "covers", no: "missing" }
        }
      }
    });
    expect(input.questions?.diff).toMatchObject({
      type: "yesno",
      options: { yes: "covers", no: "missing" }
    });
  });
});
