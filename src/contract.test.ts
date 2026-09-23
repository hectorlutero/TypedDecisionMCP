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
});
