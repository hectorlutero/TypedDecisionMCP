import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignHits } from "./assign-hits.js";
import { readCursorHopHits } from "./read-cursor-db.js";
import { emptyManual, type UiManual } from "./ui-log-state.js";

const root = dirname(fileURLToPath(import.meta.url));
const manualPath = join(root, "manual.json");
const seenPath = join(root, "ui-seen.json");
const logPath = join(root, "ui-run.jsonl");

function loadManual(): UiManual {
  if (!existsSync(manualPath)) return emptyManual();
  return JSON.parse(readFileSync(manualPath, "utf8")) as UiManual;
}

function loadSeen(): Set<string> {
  if (!existsSync(seenPath)) return new Set();
  return new Set(JSON.parse(readFileSync(seenPath, "utf8")) as string[]);
}

function main(): void {
  const seen = loadSeen();
  const hits = readCursorHopHits();
  const manual = loadManual();
  const result = assignHits(manual, hits, seen);
  writeFileSync(manualPath, JSON.stringify(result.manual, null, 2));
  writeFileSync(seenPath, JSON.stringify([...seen], null, 2));
  for (const hit of result.added) {
    writeFileSync(
      logPath,
      `${JSON.stringify({ at: new Date().toISOString(), ...hit })}\n`,
      { flag: "a" }
    );
    console.log(`${hit.id}  ${hit.latency_ms} ms  ${hit.composerId.slice(0, 8)}  ${hit.text.length} chars`);
  }
  if (result.added.length === 0) {
    console.log("Nenhum hop novo no state.vscdb. Faz o chat no Composer e corre outra vez.");
  }
  console.log(`manual.json ← ${result.added.length} samples. Log: ${logPath}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("import-cursor-ui.ts")) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
