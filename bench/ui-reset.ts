import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyManual } from "./ui-log-state.js";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of ["manual.json", "ui-seen.json", "ui-run.jsonl", "ui-paste.txt"]) {
  const path = join(root, name);
  if (existsSync(path)) unlinkSync(path);
}
writeFileSync(join(root, "manual.json"), JSON.stringify(emptyManual(), null, 2));
console.log("Limpei bench/manual.json. Os 15 slots estão vazios.");
