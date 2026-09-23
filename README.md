# TypedDecisionMCP

Repositório: [`hectorlutero/TypedDecisionMCP`](https://github.com/hectorlutero/TypedDecisionMCP).

MCP de **uma** tool (`decidir`) para o Cursor. Motor local: lê logits das opções. Sem TypeSafe. Sem JSON gerado no caminho de 10×.

Alvo em [PLAN.md](PLAN.md): ≥ 10× menos tokens gerados e ≥ 10× menos tempo no hop de decisão, com accuracy ≥ 0,75 no ouro authored.

## Uso

```bash
npm install
npm test
npm run fetch-model
npm run build
```

`examples/cursor.mcp.json` aponta para `dist/index.js`. A rule está em `cursor/rule.mdc`.

```bash
npm run bench:logits
npm run bench:report
```

`bench:report` separa qualidade de 10×. Qualidade: authored ≥ 0,75 e `generated_tokens === 0`. 10× tokens exige `bench/baseline.json` com `source: measured` e `method: cursor-ui` (Composer) ou `cursor-subagent` (`DECIDIR_ACCEPT_PROXY=1`, `text` em todos os hops). Os hops são `cmd-01` `sub-01` `diff-02` `file-01` `commit-01`. Prompts em `bench/hop-prompts.md`. Mesma régua `chars/4` nos dois lados quando há `text`. 10× de tempo só com relógio da UI ou spawn de três hops `ok`.

Último bench nesta VM (Qwen3-0.6B Q8, CPU): qualidade authored **0,775**, held-out 0,70, `generated_tokens === 0`. Proxy no **mesmo** subagente (2× `ok` quente + 3 spawn + 5 hops, um parágrafo por critério): 10× tokens **2/5** (cmd-01 14,5×, diff-02 11,7×; os outros 1,2–2,9×). Tempo `skipped` (resume ainda ~15 s). Aceite UI ainda não correu.

## Presets

`comando` · `subagente` · `diff` · `ficheiro` · `commit` · `pacote`

`ficheiro` e `pacote` exigem `state.candidates` (2–20 caminhos).
