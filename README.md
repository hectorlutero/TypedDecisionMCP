# TypedDecisionMCP

Repositório: [`hectorlutero/TypedDecisionMCP`](https://github.com/hectorlutero/TypedDecisionMCP).

MCP de **uma** tool (`decide`, formerly `decidir`) para o Cursor. Motor local default: **head-mlp** + MiniLM (embedding curto + probe). Opt-in: `DECIDE_ENGINE=logits` + Qwen. Sem TypeSafe. Sem JSON gerado no caminho de 10×.

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

`bench:report` separa qualidade de 10×. Qualidade: authored ≥ 0,75 e `generated_tokens === 0`. 10× tokens exige `bench/baseline.json` com `source: measured` e `method: cursor-ui` (Composer) ou `cursor-subagent` (`DECIDE_ACCEPT_PROXY=1`, `text` em todos os hops). Os hops são `cmd-01` `sub-01` `diff-02` `file-01` `commit-01`. Prompts em `bench/hop-prompts.md`. Mesma régua `chars/4` nos dois lados quando há `text`. 10× de tempo só com relógio da UI ou spawn de três hops `ok`.

Ship actual nesta VM (**head-mlp** + all-MiniLM-L6-v2 Q8): authored **40/40**, held-out **19/20**, `generated_tokens === 0`, p50 ~**16 ms**, 0 destructive false auto (miss só `h-diff-01`). Baseline logits (Qwen3-0.6B Q8) no mesmo commit: authored **33/40**, held-out **15/20**, p50 ~**381 ms**. Tempo 10× tipicamente **3–4/5** (UI `cursor-ui`). Aceite dual: held-out ≥ max(0,75, logits) e p50 ≤ 200 ms ou ≤ logits — MiniLM passa. Detalhe: [models/README.md](models/README.md), snapshot `bench/out/quality-minilm-ship.md`.

## Presets

`command` · `subagent` · `diff` · `file` · `commit` · `bundle`

`file` e `bundle` exigem `state.candidates` (2–20 caminhos). Portuguese aliases still parse: `comando`, `subagente`, `ficheiro`, `pacote`.
