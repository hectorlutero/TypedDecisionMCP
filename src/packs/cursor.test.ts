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
      expect(questions.ficheiro.criteria["src/a.ts"]).toBe("a.ts");
    }
  });

  it("labels ficheiro criteria by basename role", () => {
    const questions = resolveQuestions(
      {
        candidates: ["src/index.ts", "src/policy.ts", "LICENSE"],
        request: "x"
      },
      "ficheiro",
      undefined
    );
    expect(questions.ficheiro?.type).toBe("choice");
    if (questions.ficheiro?.type === "choice") {
      expect(Object.keys(questions.ficheiro.criteria)).toEqual([
        "src/index.ts",
        "src/policy.ts",
        "LICENSE"
      ]);
      expect(questions.ficheiro.criteria["src/index.ts"]).toContain("stdio");
      expect(questions.ficheiro.criteria["src/policy.ts"]).toContain("thresholds");
      expect(questions.ficheiro.criteria.LICENSE).toContain("copyright");
    }
  });

  it("keeps explore vs cursor-guide contrast", () => {
    const questions = resolveQuestions({ task: "x" }, "subagente", undefined);
    expect(questions.subagente?.type).toBe("choice");
    if (questions.subagente?.type === "choice") {
      expect(questions.subagente.criteria.explore).toContain("repository");
      expect(questions.subagente.criteria.explore).toContain("Not Cursor Settings");
      expect(questions.subagente.criteria["cursor-guide"]).toContain("Cursor product");
      expect(questions.subagente.criteria["cursor-guide"]).toContain("this repo's source");
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
