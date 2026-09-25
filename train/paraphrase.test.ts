import { describe, expect, it } from "vitest";
import { loadFixtures } from "../bench/load-fixtures.js";
import { expandAuthored, TRAIN_VARIANTS } from "./paraphrase.js";

describe("expandAuthored", () => {
  it("makes at least 150 train rows from authored gold and keeps held-out out", () => {
    const authored = loadFixtures("authored");
    const held = new Set(loadFixtures("heldout").map((row) => row.id));
    const expanded = expandAuthored(authored);
    expect(TRAIN_VARIANTS).toBeGreaterThanOrEqual(4);
    expect(expanded.length).toBeGreaterThanOrEqual(150);
    expect(expanded.every((row) => !held.has(row.id) || authored.some((a) => a.id === row.id))).toBe(true);
    expect(expanded.every((row) => !held.has(row.id))).toBe(true);
    expect(new Set(expanded.map((row) => row.variant)).size).toBe(TRAIN_VARIANTS);
  });
});
