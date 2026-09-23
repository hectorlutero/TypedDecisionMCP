# TypedDecisionMCP

Repositório: [`hectorlutero/TypedDecisionMCP`](https://github.com/hectorlutero/TypedDecisionMCP).

MCP de **uma** tool (`decidir`) para o Cursor. Motor local: lê logits das opções. Sem TypeSafe. Sem JSON gerado no caminho de 10×.

Alvo v1 em [PLAN.md](PLAN.md): ≥ 10× menos tokens gerados e ≥ 10× menos tempo no hop de decisão, com accuracy ≥ 0,75 no ouro authored. Implementação do alvo seguinte (authored 0,85 e 15×) em [PLAN-melhorias.md](PLAN-melhorias.md).

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

Último bench nesta VM (Qwen3-0.6B Q8, CPU): `ficheiro` authored **8/8** (`roleForPath`). Authored total **31–35/40** (oscila em `commit`/`diff`). Held-out **14–16/20**. `generated_tokens === 0`. Priors no `init`: `cmd-01` ~234 ms (era ~500). Proxy antigo: 10× tokens **3/5**; tempo `skipped`. Aceite `cursor-ui` ainda não correu. Plano: [PLAN-melhorias.md](PLAN-melhorias.md).

## Presets

`comando` · `subagente` · `diff` · `ficheiro` · `commit` · `pacote`

`ficheiro` e `pacote` exigem `state.candidates` (2–20 caminhos).
