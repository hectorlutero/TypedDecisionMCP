import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignHits } from "./assign-hits.js";
import { openCursorDb, readCursorScan } from "./read-cursor-db.js";
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

function interestingSkips(skipped: Array<{ composerId: string; reason: string }>): string[] {
  return skipped
    .filter((row) => row.reason !== "sem texto do hop" && row.reason !== "chat anterior ao reset")
    .slice(0, 5)
    .map((row) => `${row.composerId.slice(0, 8)}: ${row.reason}`);
}

async function main(): Promise<void> {
  const db = openCursorDb();
  console.log(`Banco do Cursor: ${db}`);
  console.log("New chat → copia desde [cmd-01] até ao } final → envia. Não cronometres.");
  console.log("A ler os chats recentes…");

  let manual = loadManual();
  const seen = loadSeen();
  writeFileSync(manualPath, JSON.stringify(manual, null, 2));
  let lastError = "";
  let lastWait = "";

  while (nextEmptySlot(manual)) {
    const slot = nextEmptySlot(manual);
    try {
      const scan = readCursorScan(db);
      const result = assignHits(manual, scan.hits, seen);
      if (result.added.length) {
        lastError = "";
        lastWait = "";
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
        const extra = interestingSkips(scan.skipped);
        const wait = `À espera de ${slot.id} sample ${slot.sample + 1}/3 …  (vi ${scan.hits.length} hop(s))`;
        const line = extra.length ? `${wait}\n  ${extra.join("\n  ")}` : wait;
        if (line !== lastWait) {
          console.log(line);
          lastWait = line;
        }
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
