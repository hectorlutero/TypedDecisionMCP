import { describe, expect, it } from "vitest";
import { DecideError } from "../contract.js";
import {
  EmbeddingCache,
  HeadMlpEngine,
  countEmbedTokens,
  embeddingInput,
  filePairInput,
  loadHeadWeights,
  predictClass,
  requestFromFileView
} from "./head-mlp.js";

describe("head-mlp probe", () => {
  it("picks the class whose weight aligns with the vector", () => {
    const predicted = predictClass([1, 0], {
      classes: ["yes", "no"],
      weights: [
        [4, 0],
        [0, 4]
      ],
      bias: [0, 0]
    });
    expect(predicted.key).toBe("yes");
    expect((predicted.probabilities.yes ?? 0) + (predicted.probabilities.no ?? 0)).toBeCloseTo(1);
    expect(predicted.probabilities.yes ?? 0).toBeGreaterThan(predicted.probabilities.no ?? 0);
  });
});

describe("EmbeddingCache", () => {
  it("reuses a vector for the same key and evicts the oldest", async () => {
    let calls = 0;
    const cache = new EmbeddingCache(2);
    const fetch = async (key: string) => {
      calls += 1;
      return [key.length] as const;
    };
    expect(await cache.get("a", fetch)).toEqual([1]);
    expect(await cache.get("a", fetch)).toEqual([1]);
    expect(calls).toBe(1);
    expect(await cache.get("b", fetch)).toEqual([1]);
    expect(await cache.get("c", fetch)).toEqual([1]);
    expect(calls).toBe(3);
    expect(await cache.get("a", fetch)).toEqual([1]);
    expect(calls).toBe(4);
  });

  it("has and put track exact keys without fetch", () => {
    const cache = new EmbeddingCache(2);
    expect(cache.has("a")).toBe(false);
    cache.put("a", [1, 2]);
    expect(cache.has("a")).toBe(true);
  });
});

describe("embeddingInput", () => {
  it("embeds state and question without the chat envelope", () => {
    const text = embeddingInput('{"command":"ls"}', {
      type: "yesno",
      instructions: "Is this destructive?"
    });
    expect(text).toContain("State:");
    expect(text).toContain("Is this destructive?");
    expect(text).toContain("A - yes");
    expect(text).not.toContain("<|im_start|>");
    expect(text).not.toContain("/no_think");
  });

  it("counts embed prompt tokens with the chars/4 ruler", () => {
    expect(countEmbedTokens("abcd")).toBe(1);
    expect(countEmbedTokens("a".repeat(8))).toBe(2);
  });
});

describe("loadHeadWeights", () => {
  it("refuses a modelId mismatch", () => {
    expect(() =>
      loadHeadWeights(
        {
          modelId: "other/model.gguf",
          dim: 2,
          heads: {
            command: {
              classes: ["yes", "no"],
              weights: [
                [1, 0],
                [0, 1]
              ],
              bias: [0, 0]
            }
          }
        },
        "unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf"
      )
    ).toThrow(DecideError);
  });
});

describe("file pair view", () => {
  it("reads the request out of the pack view and ignores sibling paths", () => {
    const view = JSON.stringify({ request: "Open the port", candidates: ["src/http.ts", "LICENSE"] }, null, 2);
    expect(requestFromFileView(view)).toBe("Open the port");
    expect(filePairInput("Open the port", "src/http.ts")).not.toContain("LICENSE");
  });

  it("treats a weight file without fileScoring as the slot head", () => {
    const artifact = loadHeadWeights(
      {
        modelId: "unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf",
        dim: 1,
        heads: {
          command: { classes: ["yes", "no"], weights: [[1], [0]], bias: [0, 0] }
        }
      },
      "unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf"
    );
    expect(artifact.fileScoring).toBe("slot");
    expect(artifact.temperature).toBeUndefined();
  });
});

describe("HeadMlpEngine", () => {
  it("fails closed when the weight file is missing", async () => {
    const engine = new HeadMlpEngine("/no/such/head-mlp.json");
    await expect(engine.init()).rejects.toThrow(DecideError);
  });
});
