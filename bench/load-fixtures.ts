import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Preset } from "../src/contract.js";

export type Fixture = {
  id: string;
  split: "authored" | "heldout";
  preset: Preset;
  state: unknown;
  gold: Record<string, string>;
};

export function loadFixtures(split?: Fixture["split"]): Fixture[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = ["authored.jsonl", "heldout.jsonl"].map((name) => join(dir, "fixtures", name));
  const rows = files.flatMap((file) =>
    readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Fixture)
  );
  return split ? rows.filter((row) => row.split === split) : rows;
}
