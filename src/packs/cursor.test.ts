import { describe, expect, it } from "vitest";
import { DecideError } from "../contract.js";
import { resolveQuestions } from "./cursor.js";

describe("packs", () => {
  it("builds ficheiro from candidates", () => {
    const questions = resolveQuestions(
      { candidates: ["src/a.ts", "src/b.ts"], request: "x" },
      "ficheiro",
      undefined
    );
    expect(questions.ficheiro?.type).toBe("choice");
    if (questions.ficheiro?.type === "choice") {
      expect(Object.keys(questions.ficheiro.criteria)).toEqual(["src/a.ts", "src/b.ts"]);
    }
  });

  it("rejects ficheiro without candidates", () => {
    expect(() => resolveQuestions("just text", "ficheiro", undefined)).toThrow(DecideError);
  });

  it("merges pacote", () => {
    const questions = resolveQuestions(
      { command: "ls", candidates: ["a.ts", "b.ts"], request: "rename", diff: "x" },
      "pacote",
      undefined
    );
    expect(Object.keys(questions).sort()).toEqual([
      "comando",
      "commit",
      "diff",
      "ficheiro",
      "subagente"
    ]);
  });
});
