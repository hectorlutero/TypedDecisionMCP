import { describe, expect, it } from "vitest";
import { DecideError, normalizePreset, parseDecideInput } from "./contract.js";
import { envFirst } from "./env.js";

describe("parseDecideInput", () => {
  it("accepts a yesno preset", () => {
    const input = parseDecideInput({ state: "git status", preset: "command" });
    expect(input.preset).toBe("command");
  });

  it("accepts Portuguese preset aliases without normalizing the parsed value", () => {
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

describe("normalizePreset", () => {
  it("maps Portuguese aliases to English keys", () => {
    expect(normalizePreset("comando")).toBe("command");
    expect(normalizePreset("subagente")).toBe("subagent");
    expect(normalizePreset("ficheiro")).toBe("file");
    expect(normalizePreset("pacote")).toBe("bundle");
    expect(normalizePreset("command")).toBe("command");
    expect(normalizePreset("diff")).toBe("diff");
    expect(normalizePreset(undefined)).toBeUndefined();
  });
});

describe("envFirst", () => {
  it("prefers DECIDE_ then DECIDIR_ and skips empty", () => {
    expect(envFirst({ DECIDE_MODEL: "/a", DECIDIR_MODEL: "/b" }, "DECIDE_MODEL", "DECIDIR_MODEL")).toBe("/a");
    expect(envFirst({ DECIDIR_MODEL: "/b" }, "DECIDE_MODEL", "DECIDIR_MODEL")).toBe("/b");
    expect(envFirst({ DECIDE_MODEL: "", DECIDIR_MODEL: "/b" }, "DECIDE_MODEL", "DECIDIR_MODEL")).toBe("/b");
    expect(envFirst({}, "DECIDE_MODEL", "DECIDIR_MODEL")).toBeUndefined();
  });
});
