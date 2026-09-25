import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, getDecisionEngine } from "../src/decide.js";
import { loadFixtures } from "./load-fixtures.js";
import { goldHits } from "./score-gold.js";

const outDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const engine = await getDecisionEngine();
  const rows = [];
  try {
    for (const fixture of loadFixtures()) {
      const started = performance.now();
      const result = await decide({ state: fixture.state, preset: fixture.preset }, engine);
      const hits = goldHits(fixture, result.answers);
      rows.push({
        id: fixture.id,
        split: fixture.split,
        preset: fixture.preset,
        latency_ms: result.latency_ms,
        wall_ms: performance.now() - started,
        prompt_tokens: result.usage.prompt_tokens,
        generated_tokens: result.usage.generated_tokens,
        action: result.action,
        answers: result.answers,
        hits
      });
      console.error(`${fixture.id} ${result.action} ${hits.ok}/${hits.n} ${result.latency_ms.toFixed(0)}ms`);
    }
  } finally {
    await engine.dispose();
  }
  mkdirSync(join(outDir, "out"), { recursive: true });
  writeFileSync(join(outDir, "out/logits.json"), JSON.stringify({ rows }, null, 2));
  console.log(join(outDir, "out/logits.json"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
