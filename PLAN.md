# Plano: TypedDecisionMCP — 10× no hop, sem TypeSafe

Repositório: `hectorlutero/TypedDecisionMCP`.

Uma tool no Cursor. Motor **local**. Lê logits das opções. **Zero** chamada à TypeSafe. **Zero** JSON gerado no caminho que tem de bater 10×.

O Composer continua a escrever código. Esta tool só fecha `if`s: `yesno` / `choice` / `score` + `action`.

## O que é o 10× (travado)

Comparado com o hop de hoje: o modelo grande do Cursor **raciocina** o mesmo `if` e escreve JSON.

Sobre o **mesmo fixture**, o motor local tem de cumprir **os dois**:

| Métrica | Baseline (Cursor a raciocinar o `if`) | Alvo `decidir` | 10× |
|---|---|---|---|
| Tokens **gerados** no hop | 500–4 000 (CoT + JSON) | **0** no motor + transcript da tool | ≥ 10× nos tokens gerados do hop |
| Latência do hop | 2–15 s | p50 nosso (modelo quente) | ≥ 10× no mesmo id |

Há **dois réus**. Não se misturam.

| `method` | Onde | Aceite v1 | Relógio | Tokens |
|---|---|---|---|---|
| `cursor-ui` | Composer, chat novo, sem `decidir` | **sim** | envia → último token na UI | da UI; se houver `text`, o report reconta os dois lados com `chars/4` |
| `cursor-subagent` | Task/subagente, mesmo enunciado | **proxy** — só com `DECIDIR_ACCEPT_PROXY=1` | hops **em série**; `latency_ms = raw − mediana(3× spawn)` | `text` **obrigatório**; os dois lados no `chars/4` |

`method` vazio, `api-hop` ou proxy sem a flag: o report **não** dá 10×.

Hops do 10× (um por preset; um é “não”): `cmd-01`, `sub-01`, `diff-02`, `file-01`, `commit-01`.

Contador pinado: `bench/token-count.ts` (`chars/4`) no texto do hop e no `JSON.stringify(answers)`. Sem `text` no UI, o rácio usa o número da UI no numerador (`token_ruler: mixed`) — mais fraco.

Relógio do proxy: três hops que só respondem `ok` → `spawn_ms`. Se `latency_ms < 0,5 × latency_raw_ms`, o hop é nulo. Sem spawn de três, o 10× de **tempo** fica `skipped`; qualidade e 10× de tokens podem fechar.

Qualidade e 10× **separam-se**: authored ≥ 0,75 + `generated_tokens === 0` já é gate próprio. O v1 de tokens 10× exige `source: measured` + method aceite + ≥ 4/5 com rácio ≥ 10. O v1 de tempo 10× só corre se o relógio for UI ou proxy com spawn de três.

Cada linha do baseline guarda `text` (obrigatório no proxy), `model`, `method`, `tokenizer`. Sem `text` no proxy o report falha.

Regra de aceite do v1:

1. **Qualidade:** authored ≥ 0,75, held-out ≥ 0,70, `generated_tokens === 0`.
2. **Tokens 10×:** ≥ 4 dos 5 hops, mesma régua quando há `text`.
3. **Tempo 10×:** ≥ 4 dos 5, só se o relógio estiver activo.
4. **Independência:** `grep` sem `typesafe.ai`, sem `TYPESAFE_`, sem SDK TypeSafe.

10× da **sessão inteira** do Cursor está **fora**. Ler o repo e escrever código não passa por esta tool. O 10× é o hop de decisão.

JSON forçado (gpt-4o-mini, etc.) **não** é o caminho de 10×: ainda gera tokens e depende de API. Fica de fora do v1. TypeSafe / JEV fica de fora do v1 e do v2.

## Porquê este motor

O 10× só existe se o hop **deixar de gerar texto**.

O truque (o mesmo do SemIf, sem o produto deles): modelo aberto **congelado**, um forward pass, softmax **só** nos tokens das opções que tu declaraste. Não há decode. Não há parse. Não há TypeSafe.

| Caminho | Tokens gerados | Dependência | Chega a 10×? |
|---|---|---|---|
| Cursor a raciocinar o `if` | 500–4 000 | Cursor | baseline |
| JSON forçado (API barata) | 50–200 | OpenAI-compatible | ~3–8× tokens; não |
| TypeSafe JEV | 0 no motor | conta + waitlist + API | irrelevante: excluído |
| **Logits locais (este plano)** | **0** no motor | pesos GGUF no disco | **sim**, se o load e o prompt forem curtos |

Modelo v1: **Qwen3-0.6B Q8_0** (~639 MB). Corre em CPU. Cabe no Desktop e, com o GGUF no environment, no Cloud Agent sem GPU.

Escada, só se o 0.6B falhar o 0,75 de qualidade:

- MiniCPM5-2B Q4 (~1,56 GB) — Desktop
- Qwen3.5-4B Q4 (~3 GB) — GPU; **não** é requisito do 10×

O 10× de tempo mede-se com o modelo **quente**. O primeiro download não conta.

## Arquitetura

```
agente Cursor
    │  uma tool: decidir
    ▼
TypedDecisionMCP (stdio | http)
    │  valida contrato + monta presets
    ▼
engine/logits          ← único motor de 10×
    llama.cpp / node-llama-cpp
    GGUF local (0.6B default)
    1 forward pass / pergunta
    lê logprob das opções → softmax
    ▼
policy  →  { answers, action, engine, usage, latency_ms }
```

Prefixo do `state` partilhado: uma passagem no estado, ramifica as perguntas (o SemIf chama isto shared / parallel suffixes). É isto que mantém o p50 ≤ 200 ms quando o `pacote` manda as cinco de uma vez.

### Contrato (nosso, não o da TypeSafe)

**Tool `decidir`**

```ts
{
  state: string | object | array
  preset?: "comando" | "subagente" | "diff" | "ficheiro" | "commit" | "pacote"
  questions?: {
    [id: string]:
      | { type: "yesno"; instructions: string }
      | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
      | { type: "score";  instructions: string; criteria: string[] } // 2–10
  }
}
```

Resposta:

```ts
{
  engine: "logits"
  model: string          // revision + quantização pinadas
  answers: { ... }
  action: "auto" | "review" | "stop"
  reasons: { id, signal, threshold }[]
  usage: { prompt_tokens: number; generated_tokens: 0 }
  latency_ms: number
}
```

- `yesno` (não `noul`): P(sim) ∈ [0, 1].
- `choice`: option + distribuição + confidence (margem do argmax).
- `score`: média ponderada dos níveis + distribuição.

Opções no prompt são **rótulos de um token** (`yes`/`no`, `A`/`B`/`C`, ou ids ASCII de um token). Descrições longas vão no texto da pergunta, **não** no token que se lê. Se o tokenizer partir um id em dois tokens, o servidor recusa com 422 — senão o 10× e a calibração mentem.

### Cinco `if`s

| Preset | Tipo | Pergunta | Polaridade |
|---|---|---|---|
| `comando` | yesno | Este comando é destrutivo (apaga, force-push, drop, overwrite irrecuperável)? | risco se sim → `signal = 1 - p` |
| `subagente` | choice | Qual `subagent_type`? | `explore` · `generalPurpose` · `ci-investigator` · `cursor-guide` · `security-review` |
| `diff` | yesno | O diff cobre o pedido, sem extra? | ok se sim |
| `ficheiro` | choice | Qual caminho? | `state.candidates` 2–20 |
| `commit` | score | Quão pronto para commit? | `falta teste` · `review` · `pronto` |

`pacote` = as cinco no mesmo `state` (ficheiro exige `candidates`).

Política (código, não o modelo): `signal < 0.5` → stop; `< 0.8` → review; senão auto. O pior `action` do pedido vence.

### O que o v1 **não** tem

- TypeSafe, JEV, `noul`, `/v1/systemone`, SDK deles
- Motor JSON / micro-scorers
- Segunda tool MCP
- Hook em cada shell
- Treino / LoRA (isso é outro produto; não é preciso para 10× de hop)
- SemIf como dependência runtime (o truque sim; o repo deles não)

## Árvore

```
TypedDecisionMCP/
  bench/
    fixtures/*.jsonl          # os 5 ifs, ouro + baseline gravado
    baseline.ts               # corre o “Cursor pensa o if” (API que TU escolheres, só no bench)
    logits.ts                 # corre o motor
    report.ts                 # imprime os rácios; exit 1 se < 10× ou acc < 0.75
  src/
    contract.ts
    policy.ts
    packs/cursor.ts
    engine/logits.ts          # único motor
    engine/prompt.ts          # state + opções de um token
    engine/tokenize.ts        # recusa option multi-token
    decide.ts
    server.ts                 # uma tool
    index.ts                  # stdio
    http.ts
  models/README.md            # como obter o GGUF pinado; git-lfs ou download no install
  cursor/rule.mdc
  cursor/SKILL.md
  examples/cursor.mcp.json
  test/
  PLAN.md
```

Pesos **não** vão no git. Pin da revision + sha256 no `models/README.md`. `npm run fetch-model` baixa para `~/.cache/TypedDecisionMCP/`.

Stack: Node 20+, TypeScript, `@modelcontextprotocol/sdk`, `node-llama-cpp` (ou binário `llama-cli` se o binding falhar no Cloud). Sem Express se o HTTP do SDK chegar.

## Fases (a 1 é o 10×; sem ela não há MCP)

### Fase 0 — Harness e ouro

- [ ] 40 linhas de ouro *authored* (8 por preset; `comando` com polaridade explícita)
- [ ] 10 linhas *held-out* que não se usam para afinar prompt
- [x] `bench/baseline.ts`: hop medido. Sem chave: cinco chats no Cursor (`bench/hop-prompts.md` → `bench/manual.json`). Com chave: os mesmos cinco via API. Commitar `bench/baseline.json` (números, não a chave)
- [ ] `bench/report.ts` com as fórmulas de 10× e o 0,75
- [ ] Fixture de polaridade: comando destrutivo com `yesno` alto → `action: stop`

**Pronto quando:** `npm run bench:baseline` gera o ficheiro. Ainda não há motor. O 10× ainda não existe — o réu está medido.

Baseline no harness pode ser qualquer modelo grande que **imite** o hop do Cursor (CoT + JSON). Não é TypeSafe. Não é dependência de runtime.

### Fase 1 — Motor de logits (gate do 10×)

- [ ] Carregar Qwen3-0.6B Q8 pinado via `node-llama-cpp`
- [ ] Prompt fixo: estado → pergunta → linhas `yes` / `no` ou `A option` …
- [ ] Um decode **proibido**. `getLogits` / eval sem sampling. Softmax nas ids das opções
- [ ] Recusar option que não seja 1 token no tokenizer pinado
- [ ] Prefixo do `state` em cache para `pacote`
- [ ] `generated_tokens` sempre 0 no usage
- [ ] Warmup no startup (uma eval descartada) para o p50 não incluir compile
- [ ] `npm run bench:logits && npm run bench:report`

**Pronto quando:** o report é verde: ≥ 10× tokens, ≥ 10× tempo (quente), acc ≥ 0,75 no authored. Se o 0.6B falhar a qualidade, **sobe o modelo da escada e volta a medir** — não se “compensa” com JSON. Se o 4B for preciso para o 0,75 e o p50 passar de 200 ms, o 10× de tempo falha: corta-se o prompt, não se volta à TypeSafe.

Este é o checkpoint que importa. Sem report verde, não se escreve MCP.

### Fase 2 — Contrato, packs, política

- [ ] Zod do contrato acima (`yesno`, não `noul`)
- [ ] Packs dos cinco presets; `ficheiro` lê `state.candidates`
- [ ] Política + testes de polaridade
- [ ] `decide()` puro (sem MCP) para os testes

**Pronto quando:** vitest do contrato/política/packs passa sem GPU e sem rede.

### Fase 3 — MCP, uma tool

- [ ] `decidir` stdio, descrição curta (~300 tokens de schema)
- [ ] Devolve o JSON da resposta; o agente não “interpreta prosa”
- [ ] `DECIDIR_MODEL` path do GGUF; default do cache
- [ ] Smoke: `DECIDIR_MODEL=... npm run smoke` chama a tool com mock de transporte

**Pronto quando:** Customize do Cursor lista uma tool. Fixture “apaga node_modules” → `comando` → `stop`.

### Fase 4 — Cola Cursor

- [ ] `examples/cursor.mcp.json` (stdio, sem chaves de API)
- [ ] `cursor/rule.mdc` + `SKILL.md`: se o hop for um dos cinco, chama `decidir`; não escrevas probabilidade no texto; lê `action`
- [ ] README: Desktop e Cloud (GGUF no environment, HTTP)

**Pronto quando:** um agente com a rule chama a tool nos cinco fixtures manuais.

### Fase 5 — HTTP / Cloud Agent

- [ ] Entrypoint HTTP, bind `127.0.0.1`, token opcional
- [ ] Documentar no `environment`: `install` baixa o GGUF para o cache (idempotente). Sem isto o Cloud Agent não tem 10× — tem erro
- [ ] Health devolve `model_loaded` e `warm`

**Pronto quando:** Cloud Agent com o GGUF no snapshot chama `decidir` sem TypeSafe e sem JSON API.

### Fase 6 — Qualidade sem perder o 10×

- [ ] Temperature scaling **por preset**, fit só no authored, mede no held-out
- [ ] Calibração **não** muda o argmax; só o `signal` / ECE
- [ ] Se a temperatura piorar o rácio de tempo, não entra
- [ ] Report volta a correr no CI (bench de logits + ouro; baseline commitado, não se chama API no CI)

**Pronto quando:** held-out ≥ 0,70 acc, authored ≥ 0,75, 10× intacto.

## Ordem

**0 → 1 → (stop se o report for vermelho) → 2 → 3 → 4 → 5 → 6**

A fase 1 é o produto. O MCP é o adaptador Cursor. Construir o MCP antes do report verde é construir um wrapper sem o 10×.

## Dependências

- Node 20+
- ~1 GB em disco para o 0.6B (mais se subir a escada)
- Desktop: CPU chega para o 0.6B
- Cloud Agent: o GGUF tem de estar no **install/snapshot**; esta VM agora não o tem
- Uma API **só no bench da fase 0** para gravar o baseline (a tua chave, um modelo grande). Runtime: nenhuma
- Repo git. Publicar no GitHub (`hectorlutero/TypedDecisionMCP`) quando houver credencial neste ambiente — este run nasceu sem repo e sem `gh auth`

## Riscos

| Risco | Mitigação |
|---|---|
| 0.6B erra os `if`s | Escada 2B/4B; prompt mais estreito; **não** voltar a API. Se o 4B quebrar o p50, o v1 não fecha — corta-se fixture/prompt. |
| Option multi-token | Recusa 422; ids `yes`/`no`/`A`/`B`. |
| Primeiro load come o 10× | Warmup no start; p50 só depois de `model_loaded`. |
| Agente não chama a tool | Rule + SKILL; sem chamada não há 10× no Cursor, só no bench. |
| Schema MCP come tokens | Uma tool, descrição curta. |
| Cloud sem GGUF | `install` baixa; health falha fechado (erro), não inventa resposta. |
| Copiar API TypeSafe “para ser compatível” | Contrato próprio. CI bloqueia `typesafe` / `noul` / `systemone`. |
| Medir 10× contra JSON local do 0.6B | Isso é ~5× (SemIf). O baseline do aceite é o **hop do Cursor a raciocinar**, não o próprio 0.6B a gerar JSON. |

## Critérios de pronto (v1)

1. Report: qualidade (acc ≥ 0,75, gen 0). 10× tokens se houver baseline `cursor-ui` ou proxy com flag. 10× tempo só com relógio UI ou spawn de três.
2. Uma tool `decidir` no Cursor. Zero tools a mais.
3. Runtime sem rede obrigatória. Sem TypeSafe. Sem chave de LLM.
4. `generated_tokens === 0` em todas as respostas do motor.
5. Fixture destrutivo → `stop`.
6. CI: testes + report contra baseline **commitado** + grep de independência.
7. README com `fetch-model` + `mcp.json` sem `TYPESAFE_*`.

## Publicar no GitHub

Nome: `hectorlutero/TypedDecisionMCP`. MIT. Sem pesos. Sem secrets.

Este ambiente **não tem** `gh auth` nem `GITHUB_TOKEN` (o agente arrancou sem repositório). O código e o plano ficam neste workspace até existir login ou um repo vazio para push.

Ordem de publicação: repo vazio → este plano + harness (fase 0) → motor quando o report for verde. Não abrir o repo com um wrapper TypeSafe “temporário”.
