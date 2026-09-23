import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOP_SYSTEM_PROMPT, hopUserPrompt } from "./hop-prompt.js";
import { loadFixtures } from "./load-fixtures.js";
import {
  applySample,
  emptyManual,
  nextEmptySlot,
  type UiLogLine,
  type UiManual
} from "./ui-log-state.js";

const root = dirname(fileURLToPath(import.meta.url));
const manualPath = join(root, "manual.json");
const logPath = join(root, "ui-run.jsonl");
const pastePath = join(root, "ui-paste.txt");

function loadManual(): UiManual {
  if (!existsSync(manualPath)) return emptyManual();
  const raw = JSON.parse(readFileSync(manualPath, "utf8")) as UiManual;
  if (raw.method !== "cursor-ui" || !Array.isArray(raw.rows)) return emptyManual();
  if (!raw.rows.every((row) => Array.isArray(row.samples) && row.samples.length === 3)) {
    return emptyManual(raw.model);
  }
  return raw;
}

function appendLog(line: UiLogLine): void {
  writeFileSync(logPath, `${JSON.stringify(line)}\n`, { flag: "a" });
}

async function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<void> {
  await rl.question(q);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  let manual = loadManual();
  const fixtures = new Map(loadFixtures("authored").map((row) => [row.id, row]));

  if (!manual.model || manual.model.startsWith("COLA_")) {
    const model = (await rl.question("Nome do modelo no Composer (o que a UI mostra): ")).trim();
    if (model) manual = { ...manual, model };
  }

  writeFileSync(manualPath, JSON.stringify(manual, null, 2));
  writeFileSync(pastePath, "");

  console.log("");
  console.log("Dois sítios: este terminal + um chat novo no Composer.");
  console.log("Eu conto o tempo. Tu colas o prompt e, no fim, a resposta.");
  console.log(`Log: ${logPath}`);
  console.log("");

  for (;;) {
    const slot = nextEmptySlot(manual);
    if (!slot) {
      console.log("Os 15 samples estão cheios em bench/manual.json.");
      console.log("Manda esse ficheiro neste chat.");
      break;
    }

    const fixture = fixtures.get(slot.id);
    if (!fixture) throw new Error(`missing fixture ${slot.id}`);
    const prompt = `${HOP_SYSTEM_PROMPT}\n\n${hopUserPrompt(fixture)}\n`;
    const n = slot.sample + 1;

    console.log("----------------------------------------");
    console.log(`Agora: ${slot.id}   sample ${n} de 3`);
    console.log("1. New chat no Composer.");
    console.log("2. Copia o bloco abaixo (já está também em bench/ui-paste.txt).");
    writeFileSync(pastePath, prompt);
    console.log("");
    console.log(prompt);
    console.log("3. Quando fores clicar ENVIAR, volta aqui e carrega ENTER.");
    await ask(rl, "ENTER = enviei, começa a contar. ");
    const started = performance.now();
    console.log("A contar… quando o texto do Composer parar, ENTER.");
    await ask(rl, "ENTER = parou. ");
    const latency_ms = Math.round(performance.now() - started);
    console.log(`Tempo: ${latency_ms} ms`);

    writeFileSync(pastePath, "");
    console.log("");
    console.log("4. Copia a resposta INTEIRA do Composer.");
    console.log(`   Cola em ${pastePath}, guarda o ficheiro, ENTER aqui.`);
    await ask(rl, "ENTER = já guardei a resposta em ui-paste.txt. ");
    const text = readFileSync(pastePath, "utf8").trim();
    if (!text) {
      console.log("ui-paste.txt está vazio. Este sample não foi gravado. Repete.");
      continue;
    }

    const sample = { latency_ms, text };
    manual = applySample(manual, slot, sample);
    writeFileSync(manualPath, JSON.stringify(manual, null, 2));
    appendLog({
      at: new Date().toISOString(),
      id: slot.id,
      sample: slot.sample,
      latency_ms,
      text
    });
    console.log(`Gravado ${slot.id} #${n}  ${latency_ms} ms  (${text.length} chars)`);
    console.log("");
  }

  rl.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
