import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sincePath = join(root, "ui-since.json");

export function writeSince(at = Date.now()): number {
  writeFileSync(sincePath, JSON.stringify({ since_ms: at }, null, 2));
  return at;
}

export function readSince(): number {
  if (!existsSync(sincePath)) return 0;
  try {
    const raw = JSON.parse(readFileSync(sincePath, "utf8")) as { since_ms?: number };
    return typeof raw.since_ms === "number" ? raw.since_ms : 0;
  } catch {
    return 0;
  }
}
