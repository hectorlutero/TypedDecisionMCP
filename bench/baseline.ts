import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOP_IDS } from "./hop-ids.js";
import { HOP_SYSTEM_PROMPT, hopUserPrompt } from "./hop-prompt.js";
import { importManualFile } from "./import-manual.js";
import { loadFixtures } from "./load-fixtures.js";

/**
 * Records the 10× defendant: a Cursor hop that thinks the if and writes JSON.
 * Runtime of TypedDecisionMCP never calls this.
 *
 * Without BENCH_BASELINE_API_KEY, imports bench/manual.json (five hops measured
 * in Cursor). That is the path that still counts as measured.
 */
async function main(): Promise<void> {
  const dest = join(dirname(fileURLToPath(import.meta.url)), "baseline.json");
  const key = process.env.BENCH_BASELINE_API_KEY;
  if (!key) {
    try {
      const written = importManualFile();
      console.log(written);
      return;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      console.error("Measure the five hops in Cursor (see bench/hop-prompts.md), fill bench/manual.json, rerun.");
      process.exit(2);
    }
  }

  const baseUrl = (process.env.BENCH_BASELINE_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.BENCH_BASELINE_MODEL ?? "gpt-4o";
  const byId = new Map(loadFixtures("authored").map((row) => [row.id, row]));
  const rows = [];
  for (const id of HOP_IDS) {
    const fixture = byId.get(id);
    if (!fixture) throw new Error(`missing hop fixture ${id}`);
    const started = performance.now();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: HOP_SYSTEM_PROMPT },
          { role: "user", content: hopUserPrompt(fixture) }
        ]
      })
    });
    const json = (await res.json()) as {
      usage?: { completion_tokens?: number; prompt_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };
    rows.push({
      id: fixture.id,
      split: fixture.split,
      preset: fixture.preset,
      latency_ms: performance.now() - started,
      output_tokens: json.usage?.completion_tokens ?? 0,
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      text: json.choices?.[0]?.message?.content ?? ""
    });
    console.error(`${fixture.id} ${rows.at(-1)?.output_tokens} tok ${rows.at(-1)?.latency_ms.toFixed(0)}ms`);
  }
  const out = {
    source: "measured" as const,
    method: "api-hop",
    model,
    recorded_at: new Date().toISOString(),
    rows
  };
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(dest);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
