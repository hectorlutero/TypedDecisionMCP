import { describe, expect, it } from "vitest";
import { modelId, resolveModelPath, resolveTier } from "./model-path.js";

describe("model-path env", () => {
  it("prefers DECIDE_TIER then DECIDIR_TIER", () => {
    expect(resolveTier({ DECIDE_TIER: "1.7B", DECIDIR_TIER: "4B" })).toBe("1.7B");
    expect(resolveTier({ DECIDIR_TIER: "4B" })).toBe("4B");
    expect(resolveTier({})).toBe("0.6B");
  });

  it("prefers DECIDE_MODEL then DECIDIR_MODEL", () => {
    expect(resolveModelPath({ DECIDE_MODEL: "/a.gguf", DECIDIR_MODEL: "/b.gguf" })).toBe("/a.gguf");
    expect(resolveModelPath({ DECIDIR_MODEL: "/b.gguf" })).toBe("/b.gguf");
  });

  it("derives MiniLM modelId from DECIDE_MODEL path", () => {
    expect(
      modelId({ DECIDE_MODEL: "/cache/all-MiniLM-L6-v2-Q8_0.gguf" })
    ).toBe("second-state/All-MiniLM-L6-v2-Embedding-GGUF/all-MiniLM-L6-v2-Q8_0.gguf");
    expect(modelId({ DECIDE_MODEL_ID: "custom/id" })).toBe("custom/id");
  });
});
