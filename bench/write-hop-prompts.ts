import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOP_IDS } from "./hop-ids.js";
import { HOP_SYSTEM_PROMPT, hopUserPrompt } from "./hop-prompt.js";
import { loadFixtures } from "./load-fixtures.js";

const root = dirname(fileURLToPath(import.meta.url));

export function renderHopPromptsMarkdown(): string {
  const byId = new Map(loadFixtures("authored").map((row) => [row.id, row]));
  const sections = HOP_IDS.map((id, index) => {
    const fixture = byId.get(id);
    if (!fixture) throw new Error(`missing hop fixture ${id}`);
    return [
      "",
      `## ${index + 1}. ${id} (\`${fixture.preset}\`)`,
      "",
      "Chat **novo**. Sem a tool `decidir`. Cronómetro no envio → último token.",
      "",
      "### System",
      "",
      "```",
      HOP_SYSTEM_PROMPT,
      "```",
      "",
      "### User",
      "",
      "```json",
      hopUserPrompt(fixture),
      "```"
    ].join("\n");
  });
  return [
    "# Cinco hops do Cursor (baseline 10×)",
    "",
    "Um chat por hop. Pensa, devolve JSON, **não** chames `decidir`.",
    "",
    "Anota `output_tokens` (tokens gerados do modelo) e `latency_ms` (envia → último token).",
    "Copia `bench/manual.template.json` para `bench/manual.json` e preenche. Depois:",
    "",
    "```bash",
    "npm run bench:baseline",
    "npm run bench:report",
    "```",
    "",
    ...sections,
    ""
  ].join("\n");
}

const markdown = renderHopPromptsMarkdown();
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(root, "hop-prompts.md"), markdown);
writeFileSync(join(outDir, "hop-prompts.md"), markdown);
console.log(join(root, "hop-prompts.md"));
