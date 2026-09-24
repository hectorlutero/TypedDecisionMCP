import { describe, expect, it } from "vitest";
import { resolveModelPath, resolveTier } from "./model-path.js";

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
});
