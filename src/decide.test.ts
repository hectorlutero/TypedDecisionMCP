import { describe, expect, it } from "vitest";
import { decide } from "./decide.js";
import type { DecisionEngine } from "./engine/logits.js";

const stub: DecisionEngine = {
  async score(_state, questions) {
    const answers = Object.fromEntries(
      Object.keys(questions).map((id) => [id, { type: "yesno" as const, yes: 0.1 }])
    );
    return {
      engine: "logits",
      answers,
      model: "stub",
      usage: { prompt_tokens: 1, generated_tokens: 0 },
      latency_ms: 1
    };
  },
  async dispose() {}
};

describe("decide", () => {
  it("returns engine head-mlp when the scorer labels itself that way", async () => {
    const head: DecisionEngine = {
      async score(state, questions) {
        const inner = await stub.score(state, questions);
        return { ...inner, engine: "head-mlp" };
      },
      async dispose() {}
    };
    const result = await decide({ state: "git status", preset: "command" }, head);
    expect(result.engine).toBe("head-mlp");
  });

  it("returns English answer keys for Portuguese preset aliases", async () => {
    const result = await decide({ state: "git status", preset: "comando" }, stub);
    expect(result.engine).toBe("logits");
    expect(result.answers.command).toEqual({ type: "yesno", yes: 0.1 });
    expect(result.answers.comando).toBeUndefined();
  });

  it("scores the pack view instead of raw state noise", async () => {
    let seen: unknown;
    const capturing: DecisionEngine = {
      async score(state, questions) {
        seen = state;
        return stub.score(state, questions);
      },
      async dispose() {}
    };
    await decide(
      {
        preset: "command",
        state: { command: "ls", chatter: "ignore me" }
      },
      capturing
    );
    expect(String(seen)).toContain("ls");
    expect(String(seen)).not.toContain("ignore me");
  });
});
