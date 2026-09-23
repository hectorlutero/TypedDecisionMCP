import { describe, expect, it } from "vitest";
import { buildPrompt, optionSpecs, wrapForModel } from "./prompt.js";

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
    const wrapped = wrapForModel(body);
    expect(wrapped).toContain("<|im_start|>assistant");
    expect(wrapped).toContain("</think>");
    expect(wrapped.endsWith("</think>\n")).toBe(true);
  });
});
