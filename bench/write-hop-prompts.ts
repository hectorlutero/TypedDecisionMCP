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
    "Três chats **novos** por hop (15 no total). Pensa, devolve JSON, **não** chames `decidir`. O conjunto inclui `diff-02` (ouro `no`).",
    "",
    "Aceite v1: `method: cursor-ui`. Copia `bench/manual.template.json` → `bench/manual.json` e cola os 3 `samples` por hop. O import tira a mediana.",
    "Proxy: `method: cursor-subagent` — três hops `ok` (`spawn_ms`), hops em série, `text` obrigatório. Molde `bench/proxy.template.json`. Report só aceita proxy com `DECIDIR_ACCEPT_PROXY=1`.",
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
