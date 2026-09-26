---
name: instantiate-mcp
description: Instantiate TypedDecisionMCP (stdio decide) on any Cloud Agent or self-hosted VM. Use when decide is missing, dist/index.js is missing, GGUF or head-mlp is missing, or a new VM needs the local MCP.
---

# instantiate-mcp

Deixa o TypedDecisionMCP **pronto neste VM**: `dist/index.js`, GGUF MiniLM e `head-mlp.json`. O Cursor é que faz o spawn stdio (`node dist/index.js`). Esta skill não substitui o picker de MCP no mobile.

## Quando

- A tool `decide` não está no catálogo, ou falha com `head-mlp weights not found` / `GGUF not found`.
- VM nova, snapshot sem cache, ou My Machines sem o motor.
- Pedido para instanciar o MCP nesta máquina.

## Fazer

1. Na raiz do repo:

```bash
bash scripts/instantiate-mcp.sh
```

O script é idempotente: `npm ci` se faltar `node_modules`, `npm run build` se faltar `dist/index.js`, `npm run fetch-model`, `npm run train:joint` só se faltar `head-mlp.json`.

2. Confirmar `.cursor/mcp.json` com `TypedDecisionMCP` → `node` + `${workspaceFolder}/dist/index.js`. Se estiver vazio, copiar `examples/cursor.mcp.json`.

3. Smoke (opcional): `node dist/index.js` tem de aceitar stdio. Não deixes o processo no ar — o Cursor levanta o stdio.

4. Hops `command` / `subagent` / `diff` / `file` / `commit`: usa a skill `decide`. Não escrevas probabilidade no texto. Lê `action`: `auto` continua, `review` pergunta, `stop` não executa.

## Cloud Agent e iPhone

- O `install` do environment (`bash scripts/instantiate-mcp.sh`) corre isto em **toda** VM nova deste repo.
- No mobile o app **não** instancia o MCP. Em [cursor.com/agents](https://cursor.com/agents) o dropdown MCP tem de ter TypedDecisionMCP (stdio, o mesmo command/args). No iPhone, marca esse servidor no lançamento do run.
- Esta conversa / VM já arrancada não ganha a tool até um run novo com o MCP ligado.

## Não fazer

- Não uses HTTP/`start:http` neste caminho (via 1 = stdio na VM).
- Não peças TypeSafe nem JSON gerado para o hop.
- Não treines o head se `~/.cache/TypedDecisionMCP/head-mlp.json` já existe.
