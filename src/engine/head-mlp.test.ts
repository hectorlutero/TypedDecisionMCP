import { describe, expect, it } from "vitest";
import { DecideError } from "../contract.js";
import { loadHeadWeights, predictClass, HeadMlpEngine } from "./head-mlp.js";

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

describe("HeadMlpEngine", () => {
  it("fails closed when the weight file is missing", async () => {
    const engine = new HeadMlpEngine("/no/such/head-mlp.json");
    await expect(engine.init()).rejects.toThrow(DecideError);
  });
});
