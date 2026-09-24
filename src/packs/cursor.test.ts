import { describe, expect, it } from "vitest";
import { DecideError } from "../contract.js";
import { resolveQuestions } from "./cursor.js";

describe("packs", () => {
  it("builds file from candidates", () => {
    const questions = resolveQuestions(
      { candidates: ["src/a.ts", "src/b.ts"], request: "x" },
      "file",
      undefined
    );
    expect(questions.file?.type).toBe("choice");
    if (questions.file?.type === "choice") {
      expect(Object.keys(questions.file.criteria)).toEqual(["src/a.ts", "src/b.ts"]);
      expect(questions.file.criteria["src/a.ts"]).toBe("a.ts");
    }
  });

  it("labels file criteria by basename role", () => {
    const questions = resolveQuestions(
      {
        candidates: ["src/index.ts", "src/policy.ts", "LICENSE"],
        request: "x"
      },
      "file",
      undefined
    );
    expect(questions.file?.type).toBe("choice");
    if (questions.file?.type === "choice") {
      expect(Object.keys(questions.file.criteria)).toEqual([
        "src/index.ts",
        "src/policy.ts",
        "LICENSE"
      ]);
      expect(questions.file.criteria["src/index.ts"]).toContain("stdio");
      expect(questions.file.criteria["src/policy.ts"]).toContain("thresholds");
      expect(questions.file.criteria.LICENSE).toContain("copyright");
    }
  });

  it("keeps diff as yesno without custom options after A' revert", () => {
    const questions = resolveQuestions({ request: "x", diff: "y" }, "diff", undefined);
    expect(questions.diff).toEqual({
      type: "yesno",
      instructions: "Does this diff cover the user's request, with no extra unrequested work?"
    });
  });

  it("leaves subagent criteria on the pre-A1 wording", () => {
    const questions = resolveQuestions({ task: "x" }, "subagent", undefined);
    expect(questions.subagent?.type).toBe("choice");
    if (questions.subagent?.type === "choice") {
      expect(questions.subagent.criteria.explore).toBe(
        "Search the codebase or answer a question without editing"
      );
      expect(questions.subagent.criteria["cursor-guide"]).toBe(
        "Question about how Cursor itself works"
      );
    }
  });

  it("rejects file without candidates", () => {
    expect(() => resolveQuestions("just text", "file", undefined)).toThrow(DecideError);
    expect(() => resolveQuestions("just text", "ficheiro", undefined)).toThrow(/preset file requires/);
  });

  it("merges bundle", () => {
    const questions = resolveQuestions(
      { command: "ls", candidates: ["a.ts", "b.ts"], request: "rename", diff: "x" },
      "bundle",
      undefined
    );
    expect(Object.keys(questions).sort()).toEqual([
      "command",
      "commit",
      "diff",
      "file",
      "subagent"
    ]);
  });

  it("normalizes Portuguese preset aliases to English answer keys", () => {
    const fromComando = resolveQuestions({ command: "ls" }, "comando", undefined);
    expect(fromComando.command?.type).toBe("yesno");
    expect(fromComando.comando).toBeUndefined();

    const fromFicheiro = resolveQuestions(
      { candidates: ["a.ts", "b.ts"] },
      "ficheiro",
      undefined
    );
    expect(fromFicheiro.file?.type).toBe("choice");
    expect(fromFicheiro.ficheiro).toBeUndefined();

    const fromPacote = resolveQuestions(
      { command: "ls", candidates: ["a.ts", "b.ts"], request: "rename", diff: "x" },
      "pacote",
      undefined
    );
    expect(Object.keys(fromPacote).sort()).toEqual([
      "command",
      "commit",
      "diff",
      "file",
      "subagent"
    ]);
  });
});
