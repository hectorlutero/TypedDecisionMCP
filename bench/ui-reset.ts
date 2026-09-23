import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyManual } from "./ui-log-state.js";
import { writeSince } from "./ui-since.js";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of ["manual.json", "ui-seen.json", "ui-run.jsonl", "ui-paste.txt"]) {
  const path = join(root, name);
  if (existsSync(path)) unlinkSync(path);
}
writeFileSync(join(root, "manual.json"), JSON.stringify(emptyManual(), null, 2));
const since = writeSince();
console.log(`Limpei bench/manual.json. Só conto chats a partir de ${new Date(since).toISOString()}.`);
