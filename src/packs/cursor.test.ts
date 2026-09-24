import { describe, expect, it } from "vitest";
import { DecideError } from "../contract.js";
import { formatFewShot, resolvePack, resolveQuestions } from "./cursor.js";

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

  it("omits noise keys from the command view", () => {
    const pack = resolvePack(
      { command: "rm -rf /tmp", cwd: "/repo", chatter: "ignore me" },
      "command",
      undefined
    );
    expect(pack.questions.command?.type).toBe("yesno");
    expect(pack.view).toContain("rm -rf /tmp");
    expect(pack.view).toContain("/repo");
    expect(pack.view).not.toContain("ignore me");
  });

  it("keeps request and truncated diff in the diff view", () => {
    const longDiff = "x".repeat(4000);
    const pack = resolvePack(
      { request: "rename decide", diff: longDiff, chatter: "ignore me" },
      "diff",
      undefined
    );
    expect(pack.view).toContain("rename decide");
    expect(pack.view).toContain("x".repeat(20));
    expect(pack.view.length).toBeLessThan(3000);
    expect(pack.view).not.toContain("ignore me");
  });

  it("uses the request text as the subagent view", () => {
    const pack = resolvePack(
      { request: "search for hop compile", chatter: "ignore me", extra: 1 },
      "subagent",
      undefined
    );
    expect(pack.view).toContain("search for hop compile");
    expect(pack.view).not.toContain("ignore me");
  });

  it("lists file candidates without noise keys", () => {
    const pack = resolvePack(
      {
        request: "Start the HTTP listener",
        candidates: ["src/policy.ts", "src/http.ts"],
        chatter: "ignore me"
      },
      "file",
      undefined
    );
    expect(pack.questions.file?.type).toBe("choice");
    expect(pack.view).toContain("src/http.ts");
    expect(pack.view).toContain("src/policy.ts");
    expect(pack.view).not.toContain("ignore me");
  });

  it("keeps bundle questions and omits chatter from the view", () => {
    const pack = resolvePack(
      {
        command: "ls",
        candidates: ["a.ts", "b.ts"],
        request: "rename",
        diff: "x",
        chatter: "ignore me"
      },
      "bundle",
      undefined
    );
    expect(Object.keys(pack.questions).sort()).toEqual([
      "command",
      "commit",
      "diff",
      "file",
      "subagent"
    ]);
    expect(pack.view).toContain("ls");
    expect(pack.view).toContain("a.ts");
    expect(pack.view).not.toContain("ignore me");
  });

  it("keeps tests and review in the commit view", () => {
    const pack = resolvePack(
      {
        diff: "export function add",
        tests: "add.test.ts green",
        review: "approved",
        chatter: "ignore me"
      },
      "commit",
      undefined
    );
    expect(pack.view).toContain("add.test.ts green");
    expect(pack.view).toContain("approved");
    expect(pack.view).toContain("export function add");
    expect(pack.view).not.toContain("ignore me");
  });

  it("formats Cursor option few-shot only for matching question ids", () => {
    const commandShot = formatFewShot(["command"]);
    expect(commandShot).toContain("drop table users cascade");
    expect(commandShot).toContain("git status");
    expect(commandShot).toContain("Answer: A");
    expect(commandShot).toContain("Answer: B");
    expect(commandShot).not.toContain("login form");
    expect(commandShot).not.toContain("forgot-password");

    const subShot = formatFewShot(["subagent"]);
    expect(subShot).toContain("decideAction");
    expect(subShot).toContain("forgot-password");
    expect(subShot).toContain("Answer: A");
    expect(subShot).toContain("Answer: B");
    expect(subShot).not.toContain("drop table users cascade");

    expect(formatFewShot(["diff"])).toBe("");
  });
});
