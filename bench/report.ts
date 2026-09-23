import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptProxy, gate10x, pairHops, qualityOk, timeGateActive, type BaselineMethod } from "./report-math.js";
import { median } from "./spawn.js";

type LogitsFile = {
  rows: Array<{
    id: string;
    split: string;
    latency_ms: number;
    generated_tokens: number;
    hits: { ok: number; n: number };
    answers?: unknown;
  }>;
};

type BaselineFile = {
  source: string;
  method?: string;
  tokenizer?: string;
  spawn_ms?: number[];
  rows: Array<{
    id: string;
    latency_ms: number;
    latency_raw_ms?: number;
    output_tokens: number;
    text?: string;
  }>;
};

const root = dirname(fileURLToPath(import.meta.url));

function main(): void {
  const logitsPath = join(root, "out/logits.json");
  if (!existsSync(logitsPath)) {
    console.error("missing bench/out/logits.json — run npm run bench:logits");
    process.exit(1);
  }
  const logits = JSON.parse(readFileSync(logitsPath, "utf8")) as LogitsFile;
  const authored = logits.rows.filter((row) => row.split === "authored");
  const heldout = logits.rows.filter((row) => row.split === "heldout");
  const authoredHits = authored.reduce((a, r) => a + r.hits.ok, 0);
  const authoredN = authored.reduce((a, r) => a + r.hits.n, 0);
  const heldHits = heldout.reduce((a, r) => a + r.hits.ok, 0);
  const heldN = heldout.reduce((a, r) => a + r.hits.n, 0);
  const acc = authoredN ? authoredHits / authoredN : 0;
  const heldAcc = heldN ? heldHits / heldN : 0;
  const gen = authored.every((row) => row.generated_tokens === 0);
  const p50 = median(authored.map((row) => row.latency_ms));
  const quality = qualityOk(acc, gen);

  const baselinePath = join(root, "baseline.json");
  if (!existsSync(baselinePath)) {
    console.log(
      JSON.stringify(
        {
          authored_acc: acc,
          heldout_acc: heldAcc,
          generated_tokens_zero: gen,
          p50_ms: p50,
          baseline_source: "missing",
          note: "10x ratios require a measured bench/baseline.json"
        },
        null,
        2
      )
    );
    process.exit(quality ? 0 : 1);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as BaselineFile;
  const method = baseline.method as BaselineMethod | undefined;
  const proxyOk = method === "cursor-ui" || (method === "cursor-subagent" && acceptProxy());
  const methodOk = baseline.source === "measured" && (method === "cursor-ui" || method === "cursor-subagent") && proxyOk;

  if (method === "cursor-subagent") {
    const missingText = baseline.rows.filter((row) => !row.text?.length);
    if (missingText.length) {
      console.error("cursor-subagent baseline requires text on every hop");
      process.exit(1);
    }
  }

  const paired = methodOk ? pairHops(authored, baseline.rows, method) : [];
  const clockOk = paired.filter((row) => row.validClock);
  const tokenWins = clockOk.filter((row) => row.token >= 10).length;
  const timeWins = clockOk.filter((row) => row.time >= 10).length;
  const n = clockOk.length;
  const tokenOk = gate10x(tokenWins, n);
  const timeActive = methodOk && timeGateActive(method, Boolean(baseline.spawn_ms?.length === 3));
  const timeStatus = !timeActive ? "skipped" : gate10x(timeWins, n) ? "passed" : "failed";
  const mixedRuler = paired.some((row) => row.ruler === "ui");

  console.log(
    JSON.stringify(
      {
        authored_acc: acc,
        heldout_acc: heldAcc,
        generated_tokens_zero: gen,
        p50_ms: p50,
        baseline_source: baseline.source,
        baseline_method: method ?? "missing",
        tokenizer: baseline.tokenizer ?? null,
        token_ruler: mixedRuler ? "mixed" : "chars/4",
        fixtures_token_10x: methodOk ? `${tokenWins}/${n}` : "0/0",
        fixtures_time_10x: timeActive ? `${timeWins}/${n}` : "skipped",
        time_gate: timeStatus
      },
      null,
      2
    )
  );

  if (baseline.source !== "measured") {
    console.error("baseline.json is not source=measured; 10x gate not accepted");
    process.exit(1);
  }
  if (method !== "cursor-ui" && method !== "cursor-subagent") {
    console.error("baseline.method must be cursor-ui or cursor-subagent");
    process.exit(1);
  }
  if (method === "cursor-subagent" && !acceptProxy()) {
    console.error("cursor-subagent proxy requires DECIDIR_ACCEPT_PROXY=1");
    process.exit(1);
  }
  if (!quality || !tokenOk) process.exit(1);
  if (timeStatus === "failed") process.exit(1);
}

main();
