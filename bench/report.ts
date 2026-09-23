import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  rows: Array<{ id: string; latency_ms: number; output_tokens: number }>;
};

const root = dirname(fileURLToPath(import.meta.url));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

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

  const baselinePath = join(root, "baseline.json");
  let tokenRatio: number | null = null;
  let timeRatio: number | null = null;
  let baselineSource = "missing";
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as BaselineFile;
    baselineSource = baseline.source;
    const byId = new Map(baseline.rows.map((row) => [row.id, row]));
    const paired = authored
      .map((row) => {
        const base = byId.get(row.id);
        if (!base) return null;
        const transcript = Math.max(1, Math.ceil(JSON.stringify(row.answers ?? {}).length / 4));
        return {
          token: base.output_tokens / transcript,
          time: base.latency_ms / Math.max(1, row.latency_ms)
        };
      })
      .filter((row): row is { token: number; time: number } => row !== null);
    const tokenWins = paired.filter((row) => row.token >= 10).length;
    const timeWins = paired.filter((row) => row.time >= 10).length;
    tokenRatio = paired.length ? tokenWins / paired.length : 0;
    timeRatio = paired.length ? timeWins / paired.length : 0;
    console.log(
      JSON.stringify(
        {
          authored_acc: acc,
          heldout_acc: heldAcc,
          generated_tokens_zero: gen,
          p50_ms: p50,
          baseline_source: baselineSource,
          fixtures_token_10x: `${tokenWins}/${paired.length}`,
          fixtures_time_10x: `${timeWins}/${paired.length}`
        },
        null,
        2
      )
    );
    const tokenOk = tokenWins / paired.length >= 0.8;
    const timeOk = timeWins / paired.length >= 0.8;
    if (baseline.source !== "measured") {
      console.error("baseline.json is not source=measured; 10x gate not accepted");
      process.exit(1);
    }
    if (!(acc >= 0.75 && gen && tokenOk && timeOk)) {
      process.exit(1);
    }
    return;
  }

  console.log(
    JSON.stringify(
      {
        authored_acc: acc,
        heldout_acc: heldAcc,
        generated_tokens_zero: gen,
        p50_ms: p50,
        baseline_source: baselineSource,
        note: "10x ratios require a measured bench/baseline.json"
      },
      null,
      2
    )
  );
  if (!(acc >= 0.75 && gen)) process.exit(1);
}

main();
