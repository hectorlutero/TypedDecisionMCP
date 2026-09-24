import { describe, expect, it } from "vitest";
import { predictClass } from "../src/engine/head-mlp.js";
import { fitSoftmax } from "./fit.js";

describe("fitSoftmax", () => {
  it("recovers a linearly separable 2-class probe", () => {
    const head = fitSoftmax(
      [
        [1, 0],
        [0.95, 0.05],
        [0, 1],
        [0.05, 0.95]
      ],
      [0, 0, 1, 1],
      ["yes", "no"]
    );
    expect(predictClass([1, 0], head).key).toBe("yes");
    expect(predictClass([0, 1], head).key).toBe("no");
  });
});
