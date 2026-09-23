import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignHits } from "./assign-hits.js";
import { openCursorDb, readCursorHopHits } from "./read-cursor-db.js";
import { emptyManual, nextEmptySlot, type UiManual } from "./ui-log-state.js";

const root = dirname(fileURLToPath(import.meta.url));
const manualPath = join(root, "manual.json");
const seenPath = join(root, "ui-seen.json");
const logPath = join(root, "ui-run.jsonl");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadManual(): UiManual {
  if (!existsSync(manualPath)) return emptyManual();
  return JSON.parse(readFileSync(manualPath, "utf8")) as UiManual;
}

function loadSeen(): Set<string> {
  if (!existsSync(seenPath)) return new Set();
  return new Set(JSON.parse(readFileSync(seenPath, "utf8")) as string[]);
}

async function main(): Promise<void> {
  const db = openCursorDb();
  console.log(`Banco do Cursor: ${db}`);
  console.log("New chat → cola cmd-01 / sub-01 / … → envia. Não cronometres.");
  console.log("");

  let manual = loadManual();
  const seen = loadSeen();
  writeFileSync(manualPath, JSON.stringify(manual, null, 2));
  let lastError = "";

  while (nextEmptySlot(manual)) {
    const slot = nextEmptySlot(manual);
    try {
      const hits = readCursorHopHits(db);
      const result = assignHits(manual, hits, seen);
      if (result.added.length) {
        lastError = "";
        manual = result.manual;
        writeFileSync(manualPath, JSON.stringify(manual, null, 2));
        writeFileSync(seenPath, JSON.stringify([...seen], null, 2));
        for (const hit of result.added) {
          writeFileSync(
            logPath,
            `${JSON.stringify({ at: new Date().toISOString(), ...hit })}\n`,
            { flag: "a" }
          );
          console.log(`gravado ${hit.id}  ${hit.latency_ms} ms  ${hit.composerId}`);
        }
      } else if (slot) {
        console.log(`À espera de ${slot.id} sample ${slot.sample + 1}/3 …`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== lastError) {
        console.error(message);
        lastError = message;
      }
    }
    if (!nextEmptySlot(manual)) break;
    await sleep(3000);
  }

  console.log("");
  console.log("15 samples em bench/manual.json. Manda esse ficheiro neste chat.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
