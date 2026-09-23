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

`bench:report` só aceita 10× com `bench/baseline.json` (`source: measured`). Sem chave de API: mede **cinco hops no Cursor** (`cmd-01` `sub-01` `diff-01` `file-01` `commit-01`), preenche `bench/manual.json` a partir de `bench/manual.template.json`, corre `npm run bench:baseline`. Prompts em `bench/hop-prompts.md`. Sem isso o report mede qualidade e `generated_tokens === 0`.

Último bench nesta VM (Qwen3-0.6B Q8, CPU, sem baseline medido): `generated_tokens === 0`, p50 ~270 ms, **authored 0,775**, held-out 0,70. O gate de qualidade (0,75) passou. O 10× de tokens/tempo ainda precisa de `bench/baseline.json` medido (`npm run bench:baseline`). Escada `DECIDIR_TIER=1.7B|4B` se quiseres repetir o ouro noutro GGUF.

## Presets

`comando` · `subagente` · `diff` · `ficheiro` · `commit` · `pacote`

`ficheiro` e `pacote` exigem `state.candidates` (2–20 caminhos).
