# TypedDecisionMCP

Repositório: [`hectorlutero/TypedDecisionMCP`](https://github.com/hectorlutero/TypedDecisionMCP).

MCP de **uma** tool (`decide`, formerly `decidir`) para o Cursor. Motor local: lê logits das opções. Sem TypeSafe. Sem JSON gerado no caminho de 10×.

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

Último bench nesta VM (Qwen3-0.6B Q8, GPU auto / E1 KV on): authored **33/40 (0,825)**, held-out **15/20 (0,75)**, `generated_tokens === 0`, p50 ~**456 ms**. Tempo 10× tipicamente **3–4/5** (UI `cursor-ui` grok-4.7). Tokens 10× **0/5** (CoT curto na UI). C5: tool `decide` chamada nos 5 hops; 2.ª call no mesmo stdio quente. Escada 1.7B medida: authored **pior** (0,775) e ~2,7× mais lenta — **não** é o default. Aceite de produto: **v1** (authored ≥ 0,75 + tempo 10× best-effort + C5). Alvos 0,85/0,9 e 15× tokens ficam fora do ship nesta máquina. Detalhe: [PLAN-melhorias.md](PLAN-melhorias.md), snapshot `bench/out/quality-0.9-speed.md`.

## Presets

`command` · `subagent` · `diff` · `file` · `commit` · `bundle`

`file` e `bundle` exigem `state.candidates` (2–20 caminhos). Portuguese aliases still parse: `comando`, `subagente`, `ficheiro`, `pacote`.
