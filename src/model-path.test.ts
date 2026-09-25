import { join } from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { activeSpec, DEFAULT_MODEL_SPEC, modelId, resolveModelPath, resolveTier } from "./model-path.js";

describe("model-path env", () => {
  it("prefers DECIDE_TIER then DECIDIR_TIER for Qwen catalog", () => {
    expect(resolveTier({ DECIDE_TIER: "1.7B", DECIDIR_TIER: "4B" })).toBe("1.7B");
    expect(resolveTier({ DECIDIR_TIER: "4B" })).toBe("4B");
    expect(resolveTier({})).toBe("0.6B");
  });

  it("defaults activeSpec to MiniLM unless DECIDE_TIER is set", () => {
    expect(activeSpec({})).toEqual(DEFAULT_MODEL_SPEC);
    expect(activeSpec({ DECIDE_TIER: "0.6B" }).file).toBe("Qwen3-0.6B-Q8_0.gguf");
  });

  it("prefers DECIDE_MODEL then DECIDIR_MODEL", () => {
    expect(resolveModelPath({ DECIDE_MODEL: "/a.gguf", DECIDIR_MODEL: "/b.gguf" })).toBe("/a.gguf");
    expect(resolveModelPath({ DECIDIR_MODEL: "/b.gguf" })).toBe("/b.gguf");
  });

  it("resolves default path to MiniLM cache file", () => {
    expect(resolveModelPath({})).toBe(join(homedir(), ".cache", "TypedDecisionMCP", DEFAULT_MODEL_SPEC.file));
  });

  it("derives MiniLM modelId from DECIDE_MODEL path", () => {
    expect(
      modelId({ DECIDE_MODEL: "/cache/all-MiniLM-L6-v2-Q8_0.gguf" })
    ).toBe("second-state/All-MiniLM-L6-v2-Embedding-GGUF/all-MiniLM-L6-v2-Q8_0.gguf");
    expect(modelId({ DECIDE_MODEL_ID: "custom/id" })).toBe("custom/id");
    expect(modelId({})).toBe(`${DEFAULT_MODEL_SPEC.repo}/${DEFAULT_MODEL_SPEC.file}`);
  });
});
