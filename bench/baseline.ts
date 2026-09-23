import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderState } from "../src/contract.js";
import { resolveQuestions } from "../src/packs/cursor.js";
import { loadFixtures } from "./load-fixtures.js";

/**
 * Measures a "Cursor thinks the if" hop: one chat completion that must
 * reason and return JSON. Runtime of TypedDecisionMCP never calls this.
 */
async function main(): Promise<void> {
  const key = process.env.BENCH_BASELINE_API_KEY;
  const baseUrl = (process.env.BENCH_BASELINE_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.BENCH_BASELINE_MODEL ?? "gpt-4o";
  if (!key) {
    console.error("BENCH_BASELINE_API_KEY is required to record a measured baseline.");
    process.exit(2);
  }
  const rows = [];
  for (const fixture of loadFixtures("authored")) {
    const questions = resolveQuestions(fixture.state as never, fixture.preset, undefined);
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
          {
            role: "system",
            content:
              "Think step by step about the decision, then return only JSON answers for the questions."
          },
          {
            role: "user",
            content: JSON.stringify({
              state: renderState(fixture.state as never),
              questions
            })
          }
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
    model,
    recorded_at: new Date().toISOString(),
    rows
  };
  const dest = join(dirname(fileURLToPath(import.meta.url)), "baseline.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(dest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
