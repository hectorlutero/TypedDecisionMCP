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

`bench:report` só aceita 10× com `bench/baseline.json` gravado por `npm run bench:baseline` (`source: measured`). Sem isso o report mede qualidade e `generated_tokens === 0`.

Último bench nesta VM (Qwen3-0.6B Q8, CPU, sem baseline medido): `generated_tokens === 0`, p50 ~200 ms, authored ~0.60. O gate 0,75 ainda não passou — a escada 2B/4B é o próximo passo de qualidade, não uma API.

## Presets

`comando` · `subagente` · `diff` · `ficheiro` · `commit` · `pacote`

`ficheiro` e `pacote` exigem `state.candidates` (2–20 caminhos).
