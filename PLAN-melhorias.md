# Plano de implementação: authored 0,85 e 15× no hop

Repositório: `hectorlutero/TypedDecisionMCP`.

Este plano executa as melhorias que sobreviveram ao cruzamento dos agentes (qualidade, relógio/C, 15×, crítico). Não substitui [PLAN.md](PLAN.md). O 10×, os dois réus (`cursor-ui` / `cursor-subagent`) e o gate v1 (authored ≥ 0,75) **ficam**. Aqui o alvo novo é **authored ≥ 0,85** e **15×** no mesmo hop, no Qwen3-0.6B Q8, sem TypeSafe e com `generated_tokens === 0`.

Ordem travada: **A → (B só se A falhar) → C → D → (E só se C mostrar que o tempo falha) → (F só se E deixar p50 > 150 ms)**.

Não se sobe o gate no `report-math` de 10 para 15 **antes** da fase C. Não se programa C na fase A.

## Estado actual (medido nesta VM)

Fonte: `bench/out/logits.json`, `bench/out/logits-1.7B.json`, `bench/baseline.json`.

| Métrica | Número |
|---|---|
| Authored 0.6B | 31/40 (0,775) |
| Held-out 0.6B | 7/10 (0,70) |
| Authored 1.7B | 30/40 (pior). p50 568 ms |
| p50 0.6B authored | 269,9 ms. `prompt_tokens` p50 134. ~2,02 ms/token all-in |
| `generated_tokens` | 0 em todas as linhas |
| Proxy tokens | 3/5 a 10×; **0/5 a 15×** (máx. 14,5× em `cmd-01`) |
| Proxy tempo | `skipped` (`spawn_void: true`) |
| `cursor-ui` | **não correu** |

Misses 0.6B: `sub-01`, `diff-02`, `diff-04`, `diff-05`, `diff-06`, `diff-08`, `file-02`, `file-07`, `commit-05`.

Números dos misses (argmax / ouro):

| id | ouro | predito | massa |
|---|---|---|---|
| `sub-01` | `explore` | `cursor-guide` | 0,527 vs 0,407 |
| `diff-02` | `no` | `yes` 0,864 | |
| `diff-04` | `no` | `yes` 0,875 | |
| `diff-05` | `yes` | `yes` 0,423 (argmax `no`) | |
| `diff-06` | `no` | `yes` 0,544 | |
| `diff-08` | `no` | `yes` 0,798 | |
| `file-02` | `src/index.ts` | `src/policy.ts` | 0,788 vs 0,024 |
| `file-07` | `LICENSE` | `src/packs/cursor.ts` | 0,391 vs 0,329 |
| `commit-05` | `1` | `2` | 0,505 vs 0,469 |

Hops do 10× / 15× (não mudar a lista): `cmd-01`, `sub-01`, `diff-02`, `file-01`, `commit-01`.

Latência destes hops no bench de 40 (prior **dentro** de `latency_ms` no primeiro yesno/score):

| hop | ms | tokens | nota |
|---|---|---|---|
| `cmd-01` | 562 | — | prior yesno comando |
| `sub-01` | 266 | 147 | choice; sem prior |
| `diff-02` | 244 | 120 | prior já veio de `diff-01` no authored; isolado seria ~430 |
| `file-01` | 292 | 132 | |
| `commit-01` | 508 | 136 | prior score |

15× de tokens com transcript canónico ~14 (`chars/4`) pede hop Cursor ≥ **210** tokens. 15× de tempo: hop UI 4 s → local ≤ **267** ms; hop UI 2 s → local ≤ **133** ms.

## Alvos

1. **Qualidade 0,85:** authored ≥ 34/40 no 0.6B. Held-out ≥ 0,70 (não descer). `generated_tokens === 0`.
2. **Tokens 15×:** ≥ 4/5 hops, `method: cursor-ui`, `text` nos dois lados, régua `chars/4`, transcript canónico (`type` + `yes`/`choice`/`score`). Sem pad. Sem encolher o JSON abaixo da decisão.
3. **Tempo 15×:** ≥ 4/5 hops, **só** relógio `cursor-ui` (envia → último token). Proxy não fecha tempo.

O v1 de [PLAN.md](PLAN.md) (0,75 + 10×) **não se apaga** se o 15× ou o 0,85 falharem. São alvos novos.

## Congelado (não mexer)

- `PACKS.comando` (8/8).
- `wrapForModel` em `src/engine/prompt.ts` (tirar o envelope já caiu authored a 0,65).
- `divideByPrior` **fora** de `choice` (`src/engine/logits.ts`).
- Transcript canónico em `bench/token-count.ts` (`compactDecisionAnswers`).
- Lista de hops em `bench/hop-ids.ts`.
- Limiar `isLatencyValid` (0,5 × raw). Não alargar para o proxy “passar”.
- Gate 10× no `report-math` **até a fase C**.
- Modelo: Qwen3-0.6B Q8. Escada 1.7B/4B **morta** até A+B saturarem abaixo de 34/40 (o 1.7B já correu e ficou 30/40).
- TypeSafe, JEV, `api-hop`, JSON gerado, decode de 1 token.

## Morto (não implementar)

- Programar C / binário llama.cpp **como primeiro passo**.
- Esticar `hop-prompt` de `file-01` / `commit-01` para o rácio.
- Reescrever `text` do proxy (`restore-file01`, `"v":"quoted"`).
- Contar thinking invisível do subagente.
- Pôr o `state` no fim do prompt na primeira passagem (atenção muda; qualidade vetou).
- Ligar prior em `choice`.
- Temperature scaling da fase 6 do PLAN.md (não muda argmax).
- `renderState` em blocos request/diff na primeira passagem.
- Alongar `PACKS.commit.criteria` na fase A (hop `commit-01` já paga prior; 1 flip a 0,036).
- `clearHistory` + 5 sequences com template **antes** do `state` sem re-bench ≥ 34/40.

---

## Fase A — qualidade sem mudar o contrato

**Porquê primeiro.** Três flips chegam a 34/40. `sub-01`, `file-07` e (se virar) `file-02` não exigem remap de ouro nem `policy.ts`. O crítico recusou começar pelo `diff` choice: as 3 vias **não foram medidas**.

**Ficheiro único de produto:** `src/packs/cursor.ts`.

### A1. `explore` vs `cursor-guide`

Só estas duas strings. **Não** acrescentar frase em `instructions`.

```ts
explore: "Read-only search in this repository. Locate code, callers, where UI is rendered. Not Cursor Settings."
"cursor-guide": "Cursor product: Settings, MCP install, app UI. Not a question about this repo's source."
```

`generalPurpose`, `ci-investigator`, `security-review` **iguais**.

Protege `sub-01` e `sub-06` / `h-sub-01` (o 1.7B já os perdeu com o critério actual).

### A2. `ficheiro`: papel do basename, keys iguais

`ficheiroQuestions` continua a usar o path como **key**. A description deixa de ser o path.

```ts
function roleForPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base === "index.ts") return "process / stdio entrypoint";
  if (base === "policy.ts") return "auto / review / stop thresholds";
  if (base === "LICENSE") return "copyright / license holder";
  if (base === "http.ts") return "HTTP listen";
  if (base === "cursor.ts") return "preset copy";
  if (base === "report.ts") return "10x report math";
  if (base === "contract.ts") return "yesno / choice / score schema";
  if (base === "logits.ts") return "logit engine";
  if (path.includes("models/") || base === "README.md") return "GGUF fetch docs";
  if (base.endsWith(".mcp.json")) return "Cursor MCP example JSON";
  return base;
}
```

`criteria: Object.fromEntries(candidates.map((path) => [path, roleForPath(path)]))`.

**Não** mudar `instructions` do `ficheiro` (frase extra come tokens no hop `file-01`).

### A3. Testes da fase A

- `src/packs/cursor.test.ts`:
  - keys de `ficheiro` continuam a ser os paths;
  - **novo:** description de `src/index.ts` contém `stdio`; de `LICENSE` contém `copyright`; de `src/policy.ts` contém `thresholds`.
  - `resolveQuestions(..., "subagente")`: `explore` e `cursor-guide` iguais às strings de A1.
- `npm test` + `npm run typecheck`.

### A4. Medir

```bash
npm run bench:logits
npm run bench:report
```

Gravar `bench/out/logits.json` (o script já escreve). Comparar misses.

### Aceite A

| Resultado | Acção |
|---|---|
| authored ≥ 34/40 e held-out ≥ 0,70 | **saltar B**. Ir a C. |
| authored 32–33/40, held-out ≥ 0,70 | B (diff choice). Não alongar `commit`. |
| authored ≤ 31/40 ou held-out < 0,70 | reverter a string que regridiu (`comando` 8/8 é travão). Não compensar com 1.7B. |

`commit` criteria **não entra** em A. Reserva só se A+B ficarem em 33/40 e o único miss fácil for `commit-05` — fase B2, no fim.

---

## Fase B — `diff` yesno → choice (só se A < 34/40)

**Porquê condicional.** 5 misses no `diff`. O yesno junta «cobre» e «sem extra» num `yes`. Choice separa `unrelated` de `extra`. Confiança sozinha: 0,55 (não medida). Remap do ouro no **mesmo** commit que o tipo, senão o held-out mente.

### B1. Pack

`src/packs/cursor.ts` `PACKS.diff`:

```ts
diff: {
  type: "choice",
  instructions: "Compare state.request to state.diff. Pick one label.",
  criteria: {
    covers: "the diff implements the request and adds nothing else",
    unrelated: "the requested name, route, symbol, or env var is missing or different",
    extra: "the diff includes unrequested work"
  }
}
```

Ordem das letras: **A `covers`, B `unrelated`, C `extra`**. Não inverter (os gold-yes `diff-01/03/07` já estão em massa alta na letra A).

Criteria de **uma** cláusula. Sem parágrafo extra.

### B2. Ouro (mesmo commit)

`bench/fixtures/authored.jsonl` e `bench/fixtures/heldout.jsonl`:

| id | gold actual | gold novo |
|---|---|---|
| `diff-01`, `diff-03`, `diff-05`, `diff-07` | `yes` | `covers` |
| `diff-02`, `diff-04`, `diff-08` | `no` | `unrelated` |
| `diff-06` | `no` | `extra` |
| `h-diff-01` | `yes` | `covers` |
| `h-diff-02` | `no` | `unrelated` |

Ouro alinhado ao **pedido**, não ao argmax actual. `diff-05` («Fix the off-by-one» + `Math.ceil(total / pageSize)`) é `covers`. Se o 0.6B o mandar a `unrelated`, é miss, não se muda o ouro.

`score-gold.ts` já lê `answer.choice`. Sem mudança.

### B3. Política

Hoje `signalFor("diff", yesno)` é ok-se-sim (`answer.yes`). Depois do flip, `choice` cai no ramo `answer.confidence`. Um `unrelated` correcto com margem alta vira `action: auto` — errado.

`src/policy.ts`:

```ts
if (id === "diff" && answer.type === "choice") {
  return answer.probabilities.covers ?? 0;
}
```

`covers` alto → `auto`. `unrelated` / `extra` → `P(covers)` baixo → `review` / `stop`.

`src/policy.test.ts`:

- manter o caso yesno do `diff` **ou** trocar para choice se o pack já não emitir yesno;
- novo: `{ type: "choice", choice: "unrelated", probabilities: { covers: 0.1, unrelated: 0.8, extra: 0.1 }, confidence: 0.7 }` → `signal` ≈ 0,1 → `stop` / `review`;
- `{ choice: "covers", probabilities: { covers: 0.9, … }, confidence: 0.8 }` → `auto`.

`src/packs/cursor.test.ts`: `questionsForPreset("diff")` / `pacote` tem `diff.type === "choice"` e keys `covers` / `unrelated` / `extra`.

### B4. Reserva `commit` (só se A+B = 33/40 e o miss for `commit-05`)

Uma cláusula nas criteria, sem parágrafo:

```
"needs review — tests exist; review is pending, changes requested, or not fully approved"
"ready to commit — tests exist and review is approved. changes requested is not ready"
```

Não mexer em `instructions`. Re-medir. Se `commit-01` (hop 15×) piorar o prefill sem flipar `commit-05`, reverter.

### B5. Medir

`npm test && npm run typecheck && npm run bench:logits && npm run bench:report`.

### Aceite B

| Resultado | Acção |
|---|---|
| authored ≥ 34/40, held-out ≥ 0,70 | ir a C |
| authored < 34/40 depois de A+B | **parar a qualidade**. Não 1.7B/4B. Documentar os misses em `PLAN-melhorias.md` (secção «Falhou»). O v1 0,75 continua verde |
| held-out < 0,70 | o remap ou o pack overfitou o authored; reverter B e ficar com A |

`pacote` herda o `diff` choice. Fixture `pacote` (se existir) e testes de merge já listam a key `diff` — o tipo muda, a key não.

---

## Fase C — medir `cursor-ui` (único réu honesto do 15×)

**Porquê depois de A/B.** `hopUserPrompt` serializa `resolveQuestions`. A1/A2 (e B) mudam o JSON que o Composer vê. Medir a UI com o pack velho é o hop errado.

### C1. Regenerar o enunciado

```bash
npm run bench:baseline:prompts
```

Isto reescreve `bench/hop-prompts.md` a partir de `bench/hop-prompt.ts` + fixtures. **Não** acrescentar «explica cada critério» / candidates extra. O texto do hop é o do produto.

### C2. Protocolo UI (cinco chats novos)

Para cada id em `bench/hop-ids.ts`:

1. Chat **novo** no Composer. Sem rule que chame `decidir`. Sem a tool.
2. Colar o system de `HOP_SYSTEM_PROMPT` e o user de `hop-prompts.md` **tal qual**.
3. Cronómetro: envia → último token visível na UI.
4. Copiar o `text` visível **inteiro** (não só o JSON; não o thought escondido).
5. Anotar `output_tokens` da UI se existir; o report reconta com `chars/4` quando há `text`.

Preencher `bench/manual.json` no molde `bench/manual.template.json`, `method: cursor-ui`. Um objecto com as 5 linhas, cada uma com `id`, `latency_ms`, `output_tokens`, `text`, `model`.

```bash
npm run bench:baseline
npm run bench:report
```

`bench/baseline.ts` + `import-manual.ts` gravam `bench/baseline.json` com `source: measured`, `method: cursor-ui`.

### C3. O que **não** fazer nesta fase

- Subagente, `DECIDIR_ACCEPT_PROXY`, spawn.
- Padar `text` até 210 tokens.
- Encolher `yes: 0.819…` para `0.82` no transcript.
- Subir o limiar no `report.ts` / `report-math.ts` de 10 para 15 **ainda**.
- `api-hop`.

### Aceite C (leitura, não gate de código)

| Observação | Conclusão |
|---|---|
| ≥ 4/5 hops com `text` chars/4 ≥ 210 e rácio ≥ 15 | 15× **tokens** é verdadeiro. Aí sim, fase C4 sobe o limiar no report |
| `file-01` / `commit-01` com `text` < 210 | 15× tokens **não existe** nesses hops. Não esticar o prompt. O v1 10× pode continuar se ≥ 4/5 ≥ 10 |
| `text` só JSON (`{"comando":"yes"}` ~5–10 tokens) | o CoT foi para o thought. O rácio chars/4 falha. Anotar `token_ruler`; não inventar thinking |
| tempo UI / local ≥ 15 em ≥ 4/5 | 15× **tempo** fechou. **Saltar E e F** |
| tempo UI / local < 15 em ≥ 2 hops | ir a D; E só se D não chegar |

### C4. Subir 10 → 15 no harness (só se C3 tokens fechou)

Ficheiros: `bench/report.ts` (`row.token >= 15`, `row.time >= 15`), testes em `bench/report-math.test.ts` (o `gate10x` é o 4/5; o 10/15 é o limiar). Copy em `PLAN.md` (tabela «O que é o 10×» ganha uma linha «alvo seguinte 15×») e `README.md`.

Se C3 tokens **não** fechou, o código do gate **fica 10**. O 15× fica alvo neste ficheiro, não no report.

---

## Fase D — relógio local (sem C, sem mudar logits)

**Porquê depois de C.** Sem números de UI não se sabe se 270 ms já é 15× (hop 4 s) ou se falta ir a 133 ms (hop 2 s). D mesmo assim tira o prior de dentro dos hops `cmd-01` / `commit-01`, que são o obstáculo do 4/5 mesmo contra 4 s.

### D1. Warmup dos priors no `init`

`src/engine/logits.ts`:

- Depois do warmup dummy (`"warmup\n"`), **antes** de qualquer `score`, correr `priorFor` para as perguntas que calibram:
  - `PACKS.comando.comando` (yesno);
  - `PACKS.commit.commit` (score);
  - `PACKS.diff.diff` **só se ainda for yesno** (A sem B).
- Usar `buildPrompt("(empty)", …)` — o mesmo `priorFor` de hoje.
- O cache `this.priors` fica cheio. `score()` no hop quente **não** paga o 2.º forward.

Esperado: `cmd-01` 562 → ~260 ms; `commit-01` 508 → ~300 ms. p50 authored quase igual (já é quente). Qualidade nula se o wrap for o mesmo.

Teste: unidade do cache (`priorCacheKey` já tem testes). Bench: `cmd-01` e `commit-01` em `latency_ms` < 350 ms no authored isolado.

### D2. `contextSize: 512`

`createContext({ contextSize: 512 })`. 256 é apertado se A/B somarem ~40 tokens (113–152 → ~190). llama.cpp alinha a 256; 512 cabe. Qualidade nula.

### D3. Encurtar **só** o duplicado em `buildPrompt`

Hoje o body tem «Reply with exactly one option label» no topo **e** «Reply with exactly one label.» no fundo.

Tirar **uma** das duas linhas. Não tocar em `wrapForModel`, `/no_think`, `<think>`. Não cortar `instructions` / criteria dos packs.

`src/engine/prompt.test.ts`: o body ainda lista `A - yes` / `B - no`; o wrap ainda acaba em `</think>\n`.

Re-correr authored. Se cair abaixo de 34/40 (ou 31/40 se B não correu), **reverter D3**.

### D4. `threads` / GPU

- `threads`: só se `nproc > 4`. Nesta VM de 4 cores o default já é `cpuMathCores`. Não forçar 8.
- `gpuLayers: "auto"` no Desktop com Metal/CUDA. Nesta VM Vulkan falhou — não é requisito.

### Aceite D

- `generated_tokens === 0`.
- Authored não desce do que A/B fecharam.
- `cmd-01` / `commit-01` sem o 2.º forward do prior.
- Re-correr `bench:report` contra o `baseline.json` da fase C (se C correu).

---

## Fase E — prefixo KV (só se C+D não derem 15× de tempo)

`clearHistory()` corre em **cada** pergunta e no prior (`src/engine/logits.ts`). `statePrefix()` existe em `prompt.ts` e **não é usado**.

### E1. Reuso do envelope (state no mesmo sítio)

Não mudar a ordem do body (`State` continua **antes** de `Question`). O prefixo partilhado é só o envelope Qwen até ao user.

- Deixar de `clearHistory()` cego.
- Usar a API do `node-llama-cpp` 3.21 (`adaptStateToTokens` / `compareContextTokens` / checkpoint — **confirmar no binding** antes de escrever).
- Se o prefixo não casar, aí sim `clearHistory` e eval completa (fallback).

Qualidade: logits iguais se os tokens do prefixo forem **exactos**. Re-correr authored **obrigatório**. Se um flip voltar atrás, reverter E1.

Corte esperado: 30–50 ms (envelope ~35–50 tokens × ~2 ms; o fecho `/no_think`+`<think>` está **depois** do body e reavalia).

### E2. Cinco sequences (template do preset antes do state)

**Proibido** até E1 estar verde **e** um bench dedicado com o `state` **no fim** do body manter authored ≥ 34/40.

Se esse bench passar:

- `createContext({ sequences: 5, contextSize: 512 })`.
- No `init`, uma sequence por preset (`comando`, `subagente`, `diff`, `ficheiro`, `commit`), template quente.
- Hop 15× (presets diferentes) deixa de pagar o template.

Qualidade vetou «state no fim» na primeira passagem: recency no 0.6B empurra a letra A e mata gold-no do `diff` e `file-02` (A = `src/policy.ts`).

### E3. Prefixo do `state` no `pacote`

0 ms no p50 authored (1 pergunta / fixture). 0 ms nos 5 hops 15×. Implementar **só** se o `pacote` for caminho de produto e E1 já existir. Não vender como corte do 15×.

### Aceite E

- Authored ≥ o número de A/B.
- p50 quente documentado em `bench/out/logits.json`.
- Se depois de E1+D o rácio de tempo no `cursor-ui` for ≥ 15 em ≥ 4/5: **não fazer F**.

---

## Fase F — C (último, e só se o p50 ainda for > 150 ms)

O 0.6B **já** corre em llama.cpp. O Node orquestra. F não reimplementa `llama_decode`.

### F0. Prova obrigatória (sem isto não se escreve C)

No mesmo processo quente, mesmo prompt ~134 tokens:

1. `performanceTracking: true` + `printTimings()` — prompt eval vs `latency_ms`.
2. `evaluateWithoutGeneratingNewTokens(tokens)` vs `controlledEvaluate(..., probabilities: true)`. A diferença é sample + marshal.
3. Opcional: `llama-cli` / `nlc`, mesmo GGUF, `-n 0`, mesmos tokens.

Se (2) < 30 ms: **F cancela**. C não paga o alvo 130 ms.

### F1. Se a cauda for ≥ 30 ms e p50 > 150 ms

Preferência:

1. **20 linhas no addon** do `node-llama-cpp`: `llama_get_logits_ith` + 2–5 `float`s das ids A/B/C. Node continua a tokenizar. Softmax só nessas ids (já é o algoritmo de `optionMass` + `normalize`).
2. Binário **persistente** stdin/stdio (um processo, load uma vez). Node manda tokens + ids; recebe 2–5 logits.

Proibido:

- processo novo por hop (load do GGUF +50–200 ms);
- softmax do vocabulário inteiro impresso;
- decode de 1 token;
- segundo motor a par do `LogitEngine` (substitui a leitura de probs, não soma).

### Aceite F

- `generated_tokens === 0`.
- Authored igual a A/B (mesmos ids).
- p50 documentado. Se ainda > 133 ms e o hop UI for ~2 s, o 15× de tempo **não fecha** — corta-se o body (D3/E), não se sobe o modelo.

---

## Ficheiros por fase

| Fase | Mexe | Não mexe |
|---|---|---|
| A | `src/packs/cursor.ts`, `src/packs/cursor.test.ts` | `logits.ts`, `policy.ts`, fixtures gold, `token-count.ts` |
| B | `cursor.ts`, `policy.ts`, `policy.test.ts`, `authored.jsonl`, `heldout.jsonl` | `wrapForModel`, calibração de choice, hops ids |
| C | `bench/hop-prompts.md` (gerado), `bench/manual.json` (gitignored), `bench/baseline.json` | pack (já fechado), transcript canónico |
| C4 | `report.ts`, `report-math.test.ts`, README, PLAN.md (linha 15×) | `gate10x` (continua 4/5) |
| D | `logits.ts` (`init`/`warmup`), `createContext`, `prompt.ts` (1 linha duplicada), `prompt.test.ts` | packs, ouro |
| E | `logits.ts` (history), talvez `prompt.ts` se E2 passar o bench | contrato, ouro |
| F | addon ou binário persistente + `logits.ts` `nextTokenProbs` | packs, report, ouro |

## Comandos de verificação (todas as fases)

```bash
npm test
npm run typecheck
npm run check:independent
npm run bench:logits    # precisa do GGUF; p50 e authored
npm run bench:report
```

Depois de A ou B: `npm run bench:baseline:prompts` **antes** de C.

CI: testes + typecheck + grep de independência. `bench:logits` no CI **só** se o GGUF estiver no snapshot; senão fica local.

## Dependências

- GGUF Qwen3-0.6B Q8 no cache (`npm run fetch-model`). Sem isto A–F não medem qualidade nem p50.
- Composer no Desktop para a fase C (cinco chats). Sem UI o 15× não se aceita.
- `node-llama-cpp` 3.21.1 já no lockfile. E/F leem a API do binding **antes** de escrever.
- Repo git neste branch. Não misturar remap de ouro (B) com warmup (D) no mesmo commit: se o authored cair, o blame tem de apontar a fase.

## Commits sugeridos (um por fase que correu)

1. `A: contrast explore/cursor-guide and ficheiro path roles`
2. `B: diff choice covers/unrelated/extra and gold remap` (se A falhou o 0,85)
3. `C: cursor-ui baseline for the five hops` (`baseline.json` + hop-prompts)
4. `C4: raise report gate 10 to 15` (só se C fechou tokens)
5. `D: warmup priors, contextSize 512, drop duplicate reply line`
6. `E: reuse KV prefix instead of clearHistory` (condicional)
7. `F: read option logits without vocab sample` (condicional)

## Riscos

| Risco | O que fazer |
|---|---|
| A não flipa 3 | B. Não 1.7B. |
| B remap overfita | held-out < 0,70 → reverter B. |
| B `diff-05` vai a `unrelated` | miss aceite; não mudar o ouro. |
| A2 alonga `file-01` e come o 15× de tempo | descriptions curtas; sem frase no `instructions`. |
| C `text` só JSON | 15× tokens falha; não padar. v1 10× pode viver. |
| D3 corta qualidade | reverter a linha. |
| E2 state no fim | só com authored ≥ 34/40 no bench dedicado. |
| C como 1.º passo | trabalho deitado fora: não corta o prefill. |
| Subir gate 15 no código antes de C | report vermelho 0/5; não é implementação. |

## Pronto (melhorias)

1. Authored ≥ 34/40 no 0.6B **ou** A+B documentados como saturados e o v1 0,75 intacto.
2. Held-out ≥ 0,70.
3. `generated_tokens === 0`.
4. `bench/baseline.json` com `method: cursor-ui` e `text` nos 5 hops.
5. Tokens 15× se C3 fechou e C4 subiu o limiar; senão o report continua a 10× e este ficheiro diz que o 15× de tokens **não** existe no `text` visível.
6. Tempo 15× se o relógio UI / local ≥ 15 em ≥ 4/5; senão D/E (e F só com F0).
7. `grep` sem TypeSafe.
8. `PACKS.comando` 8/8, envelope Qwen, transcript canónico, hops ids iguais.

## Falhou (preencher só se A+B não derem 34/40)

| id | ouro | predito depois de A+B | nota |
|---|---|---|---|
| | | | |

Não subir escada. Não C. Não esticar hop. O v1 de [PLAN.md](PLAN.md) continua o aceite de 0,75 / 10×.
