import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  optionSpecs,
  promptPrefix,
  promptSuffix,
  compileHops,
  wrapForModel,
  wrapPrefix,
  wrapSuffix
} from "./prompt.js";

describe("optionSpecs", () => {
  it("maps yesno and score onto letter labels", () => {
    expect(optionSpecs({ type: "yesno", instructions: "ok?" }).map((opt) => [opt.key, opt.label, opt.description])).toEqual([
      ["yes", "A", "yes"],
      ["no", "B", "no"]
    ]);
    expect(
      optionSpecs({
        type: "yesno",
        instructions: "ok?",
        options: { yes: "covers the request", no: "missing or extra" }
      }).map((opt) => [opt.key, opt.label, opt.description])
    ).toEqual([
      ["yes", "A", "covers the request"],
      ["no", "B", "missing or extra"]
    ]);
    expect(
      optionSpecs({ type: "score", instructions: "ready?", criteria: ["missing", "review", "ready"] }).map(
        (opt) => [opt.key, opt.label]
      )
    ).toEqual([
      ["0", "A"],
      ["1", "B"],
      ["2", "C"]
    ]);
  });
});

describe("prompt", () => {
  it("lists letter options and wraps a Qwen chat turn", () => {
    const options = optionSpecs({ type: "yesno", instructions: "Is this destructive?" });
    const body = buildPrompt('{"command":"rm -rf /"}', { type: "yesno", instructions: "Is this destructive?" }, options);
    expect(body).toContain("A - yes");
    expect(body).toContain("B - no");
    expect(body.match(/Reply with exactly one/g)?.length).toBe(1);
    expect(body).not.toContain("Reply with exactly one label.");
    const wrapped = wrapForModel(body);
    expect(wrapped).toContain("<|im_start|>assistant");
    expect(wrapped).toContain("</think>");
    expect(wrapped.endsWith("</think>\n")).toBe(true);
  });

  it("splits a prompt so prefix plus suffix equals the current wrap", () => {
    const question = { type: "yesno" as const, instructions: "Is this destructive?" };
    const options = optionSpecs(question);
    const stateText = '{"command":"rm -rf /"}';
    const prefix = promptPrefix(stateText);
    const suffix = promptSuffix(question, options);
    expect(prefix + suffix).toBe(buildPrompt(stateText, question, options));
    expect(wrapPrefix(prefix) + wrapSuffix(suffix)).toBe(wrapForModel(buildPrompt(stateText, question, options)));
    expect(prefix).toContain(stateText);
    expect(prefix).not.toContain("Is this destructive?");
    expect(suffix).toContain("Is this destructive?");
    expect(suffix).not.toContain(stateText);
  });

  it("shares one wrap prefix across two questions", () => {
    const stateText = '{"command":"ls"}';
    const questions = {
      command: { type: "yesno" as const, instructions: "Is this destructive?" },
      diff: { type: "yesno" as const, instructions: "Does this cover the request?" }
    };
    const compiled = compileHops(stateText, questions);
    expect(compiled.prefix).toBe(wrapPrefix(promptPrefix(stateText)));
    expect(Object.keys(compiled.items).sort()).toEqual(["command", "diff"]);
    for (const [id, question] of Object.entries(questions)) {
      const options = optionSpecs(question);
      expect(compiled.items[id]?.full).toBe(wrapForModel(buildPrompt(stateText, question, options)));
      expect(compiled.items[id]?.full.startsWith(compiled.prefix)).toBe(true);
    }
    expect(compiled.items.command?.suffix).toContain("Is this destructive?");
    expect(compiled.items.command?.suffix).not.toContain("Does this cover the request?");
    expect(compiled.prefix).toContain(stateText);
    expect(compiled.prefix).not.toContain("Is this destructive?");
  });

  it("puts few-shot option examples in the shared prefix only", () => {
    const stateText = '{"command":"ls"}';
    const questions = {
      command: { type: "yesno" as const, instructions: "Is this destructive?" }
    };
    const fewShot = "Example:\nState:\n{\"command\":\"rm -rf /tmp\"}\nAnswer: A\n";
    const compiled = compileHops(stateText, questions, fewShot);
    expect(compiled.prefix).toContain("rm -rf /tmp");
    expect(compiled.prefix).toContain("Answer: A");
    expect(compiled.items.command?.suffix).not.toContain("rm -rf /tmp");
    expect(compiled.items.command?.full.startsWith(compiled.prefix)).toBe(true);
  });
});
