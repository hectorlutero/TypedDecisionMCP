# Plano de implementação: authored 0,85 e 15× no hop

Repositório: `hectorlutero/TypedDecisionMCP`.

Este plano executa as melhorias que sobreviveram ao cruzamento dos agentes (qualidade, relógio/C, 15×, crítico) e as lacunas que o cruzamento **não nomeou**. Não substitui [PLAN.md](PLAN.md). O 10×, os dois réus (`cursor-ui` / `cursor-subagent`) e o gate v1 (authored ≥ 0,75) **ficam**. Aqui o alvo novo é **authored ≥ 0,85** e **15×** no mesmo hop, no Qwen3-0.6B Q8, sem TypeSafe e com `generated_tokens === 0`.

Ordem travada:

**A0 → A → A′ → (B só se A+A′ falhar) → G se massa 0 ou top-40 mentir → C → C5 → D → (E só se C+D não derem 15× de tempo) → (F só se p50 > 150 ms e F0 ≥ 30 ms)**

Não se sobe o gate no `report-math` de 10 para 15 **antes** da fase C. Não se programa C na fase A. Não se remapeia o ouro do `diff` antes de A′.

## Estado actual (medido nesta VM)

Fonte: `bench/out/logits.json`, `bench/out/logits-1.7B.json`, `bench/baseline.json`.

| Métrica | Número |
|---|---|
| Authored 0.6B | 31/40 (0,775) |
| Held-out 0.6B | 7/10 (0,70) — **um** flip derruba o 0,70 |
| Authored 1.7B | 30/40 (pior). p50 568 ms |
| p50 0.6B authored | 269,9 ms. `prompt_tokens` p50 134. ~2,02 ms/token all-in |
| `generated_tokens` | 0 em todas as linhas |
| Proxy tokens | 3/5 a 10×; **0/5 a 15×** (máx. 14,5× em `cmd-01`) |
| Proxy tempo | `skipped` (`spawn_void: true`) |
| `cursor-ui` | **não correu** |

Misses 0.6B: `sub-01`, `diff-02`, `diff-04`, `diff-05`, `diff-06`, `diff-08`, `file-02`, `file-07`, `commit-05`.

Números dos misses (argmax / ouro):

| id | ouro | predito | massa | Expectativa no plano |
|---|---|---|---|---|
| `sub-01` | `explore` | `cursor-guide` | 0,527 vs 0,407 | A1 pode virar |
| `diff-02` | `no` | `yes` 0,864 | | A′ / B. Não A |
| `diff-04` | `no` | `yes` 0,875 | | A′ / B |
| `diff-05` | `yes` | `yes` 0,423 (argmax `no`) | | A′ / B |
| `diff-06` | `no` | `yes` 0,544 | | A′ / B |
| `diff-08` | `no` | `yes` 0,798 | | A′ / B |
| `file-02` | `src/index.ts` | `src/policy.ts` | 0,788 vs **0,024** | **não é flip esperado.** Miss mais duro. A2 pode não chegar |
| `file-07` | `LICENSE` | `src/packs/cursor.ts` | 0,391 vs 0,329 | A2 pode virar |
| `commit-05` | `1` | `2` | 0,505 vs 0,469 | reserva B4, não A |

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

Três relógios que o aceite de tempo **não** pode misturar com o p50 270 ms:

| Relógio | O que é | Conta no 15×? |
|---|---|---|
| Hop quente (`score` depois de `init`) | 220–325 ms | **sim** — é o número do report |
| Primeira chamada da sessão | load do GGUF + warmup | **não** no rácio; tem de estar feito antes do hop medido. Sem `model_loaded`, o utilizador não vê 270 ms |
| Spawn do MCP stdio | Cursor a levantar o Node | **não** no rácio do hop. Medir em C5: N chamadas no **mesmo** processo vs processo novo por tool |

## Alvos

1. **Qualidade 0,85:** authored ≥ 34/40 no 0.6B. Held-out (depois de A0) ≥ 0,70 e **não descer** face ao held-out alargado medido em A0. `generated_tokens === 0`.
2. **Tokens 15×:** ≥ 4/5 hops, `method: cursor-ui`, `text` nos dois lados, régua `chars/4`, transcript canónico (`type` + `yes`/`choice`/`score`). Sem pad. Sem encolher o JSON abaixo da decisão. n = 3 chats por hop; o rácio usa a **mediana** do `text` chars/4 e a mediana do `latency_ms`.
3. **Tempo 15×:** ≥ 4/5 hops, **só** relógio `cursor-ui` (envia → último token), mediana de 3. Proxy não fecha tempo. Se o Desktop tiver GPU e `gpuLayers` baixar o p50 o bastante, E e F **não correm**.

O v1 de [PLAN.md](PLAN.md) (0,75 + 10×) **não se apaga** se o 15× ou o 0,85 falharem. São alvos novos.

Os 40 authored são diffs de uma linha. 34/40 **não** afirma o preset num diff de 50 linhas. Um split «diff real» (se existir) fica **fora** do aceite 0,85 — só diagnóstico.

## Congelado (não mexer)

- `PACKS.comando` (8/8).
- `wrapForModel` em `src/engine/prompt.ts` (tirar o envelope já caiu authored a 0,65).
- `divideByPrior` **fora** de `choice` (`src/engine/logits.ts`).
- Transcript canónico em `bench/token-count.ts` (`compactDecisionAnswers`).
- Lista de hops em `bench/hop-ids.ts`.
- Limiar `isLatencyValid` (0,5 × raw). Não alargar para o proxy “passar”.
- Gate 10× no `report-math` **até a fase C**.
- Modelo do aceite: Qwen3-0.6B Q8. Escada 1.7B/4B **morta** no aceite (o 1.7B já correu e ficou 30/40). Routing 1.7B por hop: ver «Fora».
- TypeSafe, JEV, `api-hop`, JSON gerado, decode de 1 token.

## Morto (não implementar)

- Programar C / binário llama.cpp **como primeiro passo**.
- Esticar `hop-prompt` de `file-01` / `commit-01` para o rácio.
- Reescrever `text` do proxy (`restore-file01`, `"v":"quoted"`).
- Contar thinking invisível do subagente **estimado**. Se a UI **mostrar** um número de tokens do thought, ver C2b — copiar, não inventar.
- Pôr o `state` no fim do prompt na primeira passagem (atenção muda; qualidade vetou).
- Ligar prior em `choice`.
- Temperature scaling da fase 6 do PLAN.md (não muda argmax).
- `renderState` em blocos request/diff na primeira passagem.
- Alongar `PACKS.commit.criteria` na fase A (hop `commit-01` já paga prior; 1 flip a 0,036).
- `clearHistory` + 5 sequences com template **antes** do `state` sem re-bench ≥ 34/40.
- Overlay `grep` no `diff` (identificador do `request` ∈ `diff` → forçar `no`). Ver «Fora». Sem essa linha no aceite, o 34/40 não pode ser um `includes()` no fixture.
- Dois yesno no `diff` («nome está?» + «há extra?») como caminho de aceite: +1 forward (~250 ms) mata o hop `diff-02` no 15× de tempo. Só prova de qualidade, fora do aceite. Ver «Fora».

## Fora (nomeado para ninguém meter às escondidas)

| Ideia | Estado |
|---|---|
| Overlay determinístico no `diff` | **Fora do aceite 0,85.** Se um dia entrar, a regra vai no pack/código à vista, o held-out tem de ter «nome aparece e o diff ainda está errado» (`diff-05` / `diff-06`), e o report declara `overlay: on`. |
| Dois yesno no `diff` | **Fora do aceite.** Permitido como notebook de diagnóstico (2 forwards). Não commitado no motor do hop 15×. |
| 1.7B só se `confidence` baixa no `ficheiro` | **Fora.** O 1.7B acerta `file-02`/`file-07` e erra `file-03`/`file-08`. Troca o par, custa ~568 ms nesse hop, parte o 15× de tempo. Não é a escada do v1; não entra sem um aceite à parte que **exclua** esses hops do 15×. |
| Q4 do **mesmo** 0.6B | **Fora do aceite** até um `DECIDIR_TIER` de bench. Uma corrida `bench:logits` no Q4; se authored ≥ o número de A+A′ e p50 descer, aí sim linha no `model-path.ts`. Não é fase. |
| Split «diff real» (50 linhas) | Diagnóstico. Não entra no 34/40. |
| Inverter letras (A = `no` / `unrelated`) para combater A-bias | **Fora.** Gaming das letras. |

---

## Fase A0 — held-out alargado (antes de afinar)

**Porquê primeiro.** O held-out actual é 10 linhas (2 por preset). 7/10 = 0,70. A2 pode acertar `h-file-01` e partir `h-file-02`. Sem A0, o gate 0,70 não distingue overfit de ruído.

### A0.1. Mais 10 linhas em `bench/fixtures/heldout.jsonl`

2 por preset, **sem** usar para escolher wording. Preferir `diff` e `ficheiro` (onde A/A′/B mexem):

- `h-diff-03` gold `yes` (pedido e diff alinhados, fórmula / rename / export).
- `h-diff-04` gold `no` (nome do pedido **aparece** e o diff ainda está errado — extra ou sítio trocado). Sem isto um overlay escondido passaria.
- `h-file-03`, `h-file-04` com candidates que A2 vai rotular (`http.ts`, `LICENSE`, `index.ts`, `policy.ts`).
- `h-sub-03`, `h-cmd-03`, `h-commit-03` / `h-*-04` para manter 2 extra por família sem concentrar o ruído.

Não copiar o texto de A1/A2. Escrever o state **antes** de fechar as strings do pack.

### A0.2. Medir o 0.6B **no pack actual** (antes de A)

```bash
npm run bench:logits
```

Anotar authored 31/40 e o held-out novo (n=20). O 0,70 do aceite de melhorias passa a ser **acc no n=20**, não no n=10 antigo. Se o n=20 já vier < 0,70 no pack actual, o gate de «não descer» usa esse número como linha de base, não 0,70 inventado.

Commit A0 **sozinho** (só jsonl + número de linha de base). Sem pack.

---

## Fase A — qualidade sem mudar o contrato

**Porquê.** `sub-01` e `file-07` não exigem remap nem `policy.ts`. O crítico recusou começar pelo `diff` choice. `file-02` (0,024) **não** conta como flip planeado: se virar, é bónus.

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

Gravar `bench/out/logits.json`. Comparar misses. Olhar a **massa** de `file-02` / `src/index.ts`: se continuar ~0,02, A2 não chegou — não insistir no wording do `index.ts`.

### Aceite A

| Resultado | Acção |
|---|---|
| authored ≥ 34/40 e held-out n=20 ≥ linha A0 | **saltar A′ e B**. Ir a G (check top-40) e C |
| authored 32–33/40, held-out ≥ linha A0 | A′ (yesno contrastivo no `diff`). **Não** B ainda |
| authored ≤ 31/40 ou held-out < linha A0 | reverter a string que regridiu (`comando` 8/8 é travão). Não compensar com 1.7B |
| só `sub-01` + `file-07` viraram (33/40) e `file-02` ficou | **esperado.** A′ |

`commit` criteria **não entra** em A. Reserva só se A+A′+B ficarem em 33/40 e o único miss fácil for `commit-05` — fase B4.

---

## Fase A′ — yesno contrastivo no `diff` (sem remap de ouro)

**Porquê aqui, não em B.** B muda o tipo e o gold. Ninguém mediu o meio: o ouro continua `yes`/`no`; só as descriptions deixam de ser `yes`/`no`.

Hoje `optionSpecs` em `src/engine/prompt.ts` trava yesno em `A - yes` / `B - no`. O pack `diff` não consegue escrever o contraste. `comando` 8/8 **não** pode herdar as mesmas descriptions.

### A′1. Yesno com descriptions por pergunta

Contrato (`src/contract.ts` `yesnoQuestionSchema`): campo opcional

```ts
options?: { yes: string; no: string }
```

`optionSpecs` (`prompt.ts`): se `options` existir, `description` = esse texto; senão `yes` / `no`. Labels **continuam** `A` / `B`. Keys **continuam** `yes` / `no`.

`PACKS.comando` **não** passa `options`.

`PACKS.diff` (ainda `type: "yesno"`):

```ts
instructions: "Compare state.request to state.diff. Pick one label."
options: {
  yes: "the requested name, route, symbol, or env var is in the diff and there is no extra work",
  no: "the requested name is missing or different, or the diff adds unrequested work"
}
```

Uma cláusula por lado. Sem parágrafo. Gold em `authored.jsonl` / `heldout.jsonl` **não muda**.

`policy.ts` continua `answer.yes` (ok-se-sim). Sem B3.

### A′2. Testes

- `prompt.test.ts`: yesno sem `options` → `A - yes` / `B - no` (comando intacto).
- `prompt.test.ts`: yesno com `options` → `A - the requested name…`.
- `cursor.test.ts`: `PACKS.diff` tem `options` e `type: "yesno"`.
- `contract.test.ts` se o schema de yesno for testado.

### A′3. Medir

`npm test && npm run bench:logits && npm run bench:report`.

### Aceite A′

| Resultado | Acção |
|---|---|
| authored ≥ 34/40, held-out ≥ linha A0 | **saltar B**. Ir a G e C |
| authored 32–33/40 | B (choice + remap) |
| authored ≤ 31 ou held-out a cair | reverter A′. `comando` 8/8 é travão. Não ir a B em cima de A′ partido |
| `diff-05` continua miss | aceite; não mudar o ouro |

---

## Fase B — `diff` yesno → choice (só se A+A′ < 34/40)

**Porquê condicional.** 5 misses no `diff`. A′ já deu descriptions ao yesno. B só corre se isso não chegou. Choice separa `unrelated` de `extra`. Remap do ouro no **mesmo** commit que o tipo.

### B1. Pack

`src/packs/cursor.ts` `PACKS.diff` — **apaga** o yesno + `options` de A′:

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

`bench/fixtures/authored.jsonl` e `bench/fixtures/heldout.jsonl` (incluindo as linhas de A0):

| id | gold actual | gold novo |
|---|---|---|
| `diff-01`, `diff-03`, `diff-05`, `diff-07`, `h-diff-01`, `h-diff-03` (se gold yes) | `yes` | `covers` |
| `diff-02`, `diff-04`, `diff-08`, `h-diff-02` | `no` | `unrelated` |
| `diff-06` | `no` | `extra` |
| `h-diff-04` (nome aparece, diff errado) | `no` | `extra` ou `unrelated` conforme o state que A0 escreveu |

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

- trocar o caso yesno do `diff` para choice;
- novo: `{ type: "choice", choice: "unrelated", probabilities: { covers: 0.1, unrelated: 0.8, extra: 0.1 }, confidence: 0.7 }` → `signal` ≈ 0,1 → `stop` / `review`;
- `{ choice: "covers", probabilities: { covers: 0.9, … }, confidence: 0.8 }` → `auto`.

`src/packs/cursor.test.ts`: `questionsForPreset("diff")` / `pacote` tem `diff.type === "choice"` e keys `covers` / `unrelated` / `extra`.

### B4. Reserva `commit` (só se A+A′+B = 33/40 e o miss for `commit-05`)

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
| authored ≥ 34/40, held-out ≥ linha A0 | ir a G e C |
| authored < 34/40 depois de A+A′+B | **parar a qualidade**. Não 1.7B/4B. Não overlay. Documentar os misses em «Falhou». O v1 0,75 continua verde |
| held-out < linha A0 | o remap ou o pack overfitou; reverter B e ficar com A+A′ |

`pacote` herda o `diff` choice. A key `diff` não muda.

---

## Fase G — `getLogits` nas ids (correcção de massa, não relógio)

**Porquê à parte de F.** `nextTokenProbs` pede `probabilities: true`, o sampler aplica top-k 40, e só depois se filtra A/B/C. Se o rótulo cair fora do top-40, a massa é **0** — qualidade, não p50. O PLAN.md original já pedia softmax **só** nas ids. O `controlledEvaluate` não cumpre.

`file-02` a 0,024 **já está** no mapa (senão seria 0). G não é o flip de `file-02`. G é: deixar de depender do top-40.

### G0. Prova (obrigatória, curta)

No mesmo `score`, para um yesno e um `ficheiro` de 3 paths: comparar massa das letras via caminho actual vs soma das probs no `Map` **se** o label existir. Se todos os labels dos 40 authored tiverem massa > 0 no `logits.json` actual, G **pode esperar** por F (mesmo código). Se algum label tiver massa 0 com o argmax noutro sítio, G **corre agora**.

### G1. Implementação (se G0 falhar, ou quando F abrir)

Preferência igual a F1, mas o aceite é **massa das ids**, não ms:

1. API do binding se já existir (`getLogits` / logits do último token).
2. Senão: 20 linhas no addon `llama_get_logits_ith` + 2–5 ids. Node tokeniza.
3. Softmax só nessas ids (`optionMass` já normaliza).

**Não** é um binário novo por hop. **Não** espera p50 > 150 ms.

### Aceite G

- Nenhuma opção declarada com massa 0 se o tokenizer a aceitou (1 token).
- Authored não desce.
- `generated_tokens === 0`.
- Se G0 mostrar que o top-40 nunca comeu um label nos 40+20, G1 junta-se a F e **não** é commit à parte.

---

## Fase C — medir `cursor-ui` (único réu honesto do 15×)

**Porquê depois de A/A′/B.** `hopUserPrompt` serializa `resolveQuestions`. Medir a UI com o pack velho é o hop errado.

### C1. Regenerar o enunciado

```bash
npm run bench:baseline:prompts
```

Isto reescreve `bench/hop-prompts.md` a partir de `bench/hop-prompt.ts` + fixtures. **Não** acrescentar «explica cada critério» / candidates extra. O texto do hop é o do produto.

### C2. Protocolo UI (cinco hops × **3 chats**)

O mesmo **modelo** do Composer nos 15 chats. Escrever o id do modelo em cada linha (`model` no `manual.json`). Se o modelo mudar a meio, a série é nula.

Para cada id em `bench/hop-ids.ts`, **três** chats novos:

1. Chat **novo** no Composer. Sem rule que chame `decidir`. Sem a tool.
2. Colar o system de `HOP_SYSTEM_PROMPT` e o user de `hop-prompts.md` **tal qual**.
3. Cronómetro: envia → último token visível na UI.
4. Copiar o `text` visível **inteiro** (não só o JSON; não o thought escondido).
5. Anotar `output_tokens` da UI se existir; o report reconta com `chars/4` quando há `text`.

O `baseline.json` guarda, por hop, a **mediana** de `latency_ms` e o `text` do chat dessa mediana de tokens (ou os três `text` e o report usa mediana de `chars/4`). n=1 deixa de ser aceite para o 15× de tempo: um hop a 2 s vs 8 s muda se 270 ms é 15× ou 7×.

Molde: `bench/manual.template.json` passa a aceitar `samples: [{ latency_ms, output_tokens, text }]` por hop, ou três ficheiros. `manual-baseline.ts` calcula a mediana. Sem mediana de 3, o 15× de **tempo** fica `skipped` (o de tokens ainda pode usar um `text`).

```bash
npm run bench:baseline
npm run bench:report
```

`method: cursor-ui`, `source: measured`.

### C2b. `text` só JSON

Se o CoT foi para o thought:

- **Não** estimar thinking.
- Se a UI **mostrar** um número de tokens do thought, copiar esse número para `output_tokens` e marcar `token_ruler: ui-thought`. O report trata como `mixed` (mais fraco que `chars/4` nos dois lados). Sem número na UI, o 15× de tokens **não existe** nesse hop.
- Não padar o `text` até 210.

### C3. O que **não** fazer nesta fase

- Subagente, `DECIDIR_ACCEPT_PROXY`, spawn.
- Padar `text` até 210 tokens.
- Encolher `yes: 0.819…` para `0.82` no transcript.
- Subir o limiar no `report.ts` / `report-math.ts` de 10 para 15 **ainda**.
- `api-hop`.
- Misturar dois modelos de Composer na mesma série.

### Aceite C (leitura, não gate de código)

| Observação | Conclusão |
|---|---|
| ≥ 4/5 hops com mediana chars/4 ≥ 210 e rácio ≥ 15 | 15× **tokens** é verdadeiro. Aí sim, fase C4 sobe o limiar no report |
| `file-01` / `commit-01` com mediana < 210 | 15× tokens **não existe** nesses hops. Não esticar o prompt. O v1 10× pode continuar se ≥ 4/5 ≥ 10 |
| `text` só JSON e UI sem conta de thought | rácio chars/4 falha. Sem `ui-thought` |
| mediana tempo UI / local ≥ 15 em ≥ 4/5 | 15× **tempo** fechou. **Saltar E e F** (G já correu ou está fundido) |
| mediana tempo UI / local < 15 em ≥ 2 hops | ir a D; E só se D não chegar |
| Desktop com GPU e p50 local dezenas de ms | E e F **não correm**. D4 resolve o tempo |

### C4. Subir 10 → 15 no harness (só se C3 tokens fechou)

Ficheiros: `bench/report.ts` (`row.token >= 15`, `row.time >= 15`), testes em `bench/report-math.test.ts` (o `gate10x` é o 4/5; o 10/15 é o limiar). Copy em `PLAN.md` (tabela «O que é o 10×» ganha uma linha «alvo seguinte 15×») e `README.md`.

Se C3 tokens **não** fechou, o código do gate **fica 10**. O 15× fica alvo neste ficheiro, não no report.

### C5. A tool ser chamada (senão o 15× é só o bench)

`cursor/SKILL.md` já pede para chamar `decidir`. Sem chamada, o hop do Composer continua a raciocinar o `if`.

Aceite de produto (não entra no `bench:report`):

1. Rule + SKILL ligadas. Cinco chats **com** a tool, os mesmos fixtures dos hops.
2. O Composer chama `decidir` uma vez por hop. Não inventa probabilidade no texto.
3. No **mesmo** processo stdio: a 2.ª chamada não volta a carregar o GGUF (`latency_ms` da 2.ª ≈ hop quente, não load). Se cada tool call levantar Node novo, o 15× de tempo **na sessão** não existe — documentar; não é o rácio do report.

Isto já era a fase 4 do [PLAN.md](PLAN.md). Sem C5 o Hector no Cursor não usa o 15×.

---

## Fase D — relógio local (sem C, sem mudar o argmax)

**Porquê depois de C.** Sem a mediana de UI não se sabe se 270 ms já é 15× (hop 4 s) ou se falta ir a 133 ms (hop 2 s). D tira o prior de dentro de `cmd-01` / `commit-01`.

### D0. Instrumentar o hop (antes de D1)

No mesmo processo quente, um prompt ~134 tokens:

1. `performanceTracking: true` + `printTimings()` se o binding expuser.
2. Tempo de `priorFor` vs `nextTokenProbs` vs `tokenize` (três `performance.now` em `score`, atrás de `DECIDIR_TRACE=1`).
3. Confirmar que `cmd-01` 562 ms é o prior **dentro** do hop. Sem isto D1 é fé.

Não é commit de produto. É o log que autoriza D1.

### D1. Warmup dos priors no `init`

`src/engine/logits.ts`:

- Depois do warmup dummy (`"warmup\n"`), **antes** de qualquer `score`, correr `priorFor` para as perguntas que calibram:
  - `PACKS.comando.comando` (yesno);
  - `PACKS.commit.commit` (score);
  - `PACKS.diff.diff` **só se ainda for yesno** (A/A′ sem B).
- Usar `buildPrompt("(empty)", …)` — o mesmo `priorFor` de hoje.
- O cache `this.priors` fica cheio. `score()` no hop quente **não** paga o 2.º forward.

Esperado: `cmd-01` 562 → ~260 ms; `commit-01` 508 → ~300 ms. p50 authored quase igual (já é quente). Qualidade nula se o wrap for o mesmo.

Health HTTP (`src/http.ts`): `warm: true` só **depois** deste warmup (priors + dummy). A primeira chamada do utilizador não deve ser o `init`.

### D2. `contextSize: 512`

`createContext({ contextSize: 512 })`. 256 é apertado se A/A′ somarem ~40 tokens (113–152 → ~190). llama.cpp alinha a 256; 512 cabe. Qualidade nula.

### D3. Encurtar **só** o duplicado em `buildPrompt`

Hoje o body tem «Reply with exactly one option label» no topo **e** «Reply with exactly one label.» no fundo.

Tirar **uma** das duas linhas. Não tocar em `wrapForModel`, `/no_think`, `<think>`. Não cortar `instructions` / criteria / `options` do `diff`.

`src/engine/prompt.test.ts`: o body ainda lista as letras; o wrap ainda acaba em `</think>\n`.

Re-correr authored. Se cair abaixo de 34/40 (ou do número de A+A′), **reverter D3**.

### D4. `threads` / GPU

- `threads`: só se `nproc > 4`. Nesta VM de 4 cores o default já é `cpuMathCores`. Não forçar 8.
- `gpuLayers: "auto"` no Desktop com Metal/CUDA. Se o p50 quente cair para dezenas de ms, **E e F não correm**. Nesta VM Vulkan falhou — não é requisito do aceite nesta VM.

### D5. `llama-server` persistente (opcional, entre D e F)

Não é C. É o 0.6B já em memória num processo, HTTP `127.0.0.1`, Node só manda tokens + ids.

- **Só** se D1–D4 não chegarem e F0 mostrar cauda JS ≥ 30 ms **ou** o MCP stdio estiver a morrer entre calls (C5).
- Um processo, load uma vez. Softmax nas ids (G/F).
- Spawn por hop **proibido**.

### Aceite D

- `generated_tokens === 0`.
- Authored não desce do que A/A′/B fecharam.
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

- Authored ≥ o número de A/A′/B.
- p50 quente documentado em `bench/out/logits.json`.
- Se depois de E1+D o rácio de tempo no `cursor-ui` for ≥ 15 em ≥ 4/5: **não fazer F** (salvo G1 ainda pendente).

---

## Fase F — C de relógio (último, e só se o p50 ainda for > 150 ms)

O 0.6B **já** corre em llama.cpp. O Node orquestra. F não reimplementa `llama_decode`. Se G1 já leu logits por id, F **é o mesmo código** — só muda o aceite (ms).

### F0. Prova obrigatória (sem isto não se escreve C novo)

No mesmo processo quente, o mesmo `prompt` de ~134 tokens:

1. `performanceTracking: true` + `printTimings()` — prompt eval vs `latency_ms`.
2. `evaluateWithoutGeneratingNewTokens(tokens)` vs `controlledEvaluate(..., probabilities: true)`. A diferença é sample + marshal.
3. Opcional: `llama-cli` / `nlc`, mesmo GGUF, `-n 0`, mesmos tokens.

Se (2) < 30 ms **e** G0 passou (nenhum label a massa 0): **F cancela**. Não há C de relógio.

### F1. Se a cauda for ≥ 30 ms e p50 > 150 ms

Preferência:

1. Reusar G1 se já existir.
2. **20 linhas no addon** do `node-llama-cpp`: `llama_get_logits_ith` + 2–5 `float`s. Node continua a tokenizar.
3. Binário **persistente** stdin/stdio **ou** D5 `llama-server`. Processo único.

Proibido:

- processo novo por hop (load do GGUF +50–200 ms);
- softmax do vocabulário inteiro impresso;
- decode de 1 token;
- segundo motor a par do `LogitEngine` (substitui a leitura de probs, não soma).

### Aceite F

- `generated_tokens === 0`.
- Authored igual a A/A′/B (mesmos ids).
- p50 documentado. Se ainda > 133 ms e a mediana UI for ~2 s, o 15× de tempo **não fecha** — corta-se o body (D3/E), não se sobe o modelo.

---

## Ficheiros por fase

| Fase | Mexe | Não mexe |
|---|---|---|
| A0 | `bench/fixtures/heldout.jsonl` | pack, ouro authored, motor |
| A | `src/packs/cursor.ts`, `src/packs/cursor.test.ts` | `logits.ts`, `policy.ts`, gold authored, `token-count.ts` |
| A′ | `contract.ts`, `prompt.ts`, `cursor.ts`, testes de contract/prompt/packs | gold `yes`/`no`, `policy.ts` |
| B | `cursor.ts`, `policy.ts`, `policy.test.ts`, `authored.jsonl`, `heldout.jsonl` | `wrapForModel`, calibração de choice, hops ids |
| G | `logits.ts` `nextTokenProbs` e/ou addon | packs, ouro, report |
| C | `hop-prompts.md`, `manual.template.json`, `manual-baseline.ts`, `manual.json` (gitignored), `baseline.json` | pack (já fechado), transcript canónico |
| C4 | `report.ts`, `report-math.test.ts`, README, PLAN.md (linha 15×) | `gate10x` (continua 4/5) |
| C5 | `cursor/SKILL.md` / `rule.mdc` só se a chamada falhar; senão nada | motor |
| D | `logits.ts` (`init`/`warmup`/`TRACE`), `createContext`, `prompt.ts` (1 linha duplicada), `http.ts` `warm` | packs, ouro |
| D5 | entrypoint HTTP do server llama, opcional | packs |
| E | `logits.ts` (history), talvez `prompt.ts` se E2 passar o bench | contrato, ouro |
| F | o mesmo que G1 + aceite de ms | packs, report, ouro |

## Comandos de verificação (todas as fases)

```bash
npm test
npm run typecheck
npm run check:independent
npm run bench:logits    # precisa do GGUF; p50 e authored
npm run bench:report
```

Depois de A, A′ ou B: `npm run bench:baseline:prompts` **antes** de C.

CI: testes + typecheck + grep de independência. `bench:logits` no CI **só** se o GGUF estiver no snapshot; senão fica local.

## Dependências

- GGUF Qwen3-0.6B Q8 no cache (`npm run fetch-model`). Sem isto A–F não medem qualidade nem p50.
- Composer no Desktop para C (15 chats: 5 hops × 3) e C5 (5 chats com a tool). Sem UI o 15× não se aceita.
- `node-llama-cpp` 3.21.1 já no lockfile. E/G/F leem a API do binding **antes** de escrever.
- Repo git neste branch. Não misturar A0, A, A′, B, D no mesmo commit: se o authored cair, o blame aponta a fase.

## Commits sugeridos (um por fase que correu)

1. `A0: enlarge held-out before pack wording`
2. `A: contrast explore/cursor-guide and ficheiro path roles`
3. `A': contrastive yesno descriptions on diff` (gold intacto)
4. `B: diff choice covers/unrelated/extra and gold remap` (se A+A′ falhou o 0,85)
5. `G: read option logits by id` (se G0 falhar ou fundido com F)
6. `C: cursor-ui baseline, 3 samples per hop` (`baseline.json` + hop-prompts + mediana)
7. `C4: raise report gate 10 to 15` (só se C fechou tokens)
8. `D: warmup priors, contextSize 512, drop duplicate reply line`
9. `E: reuse KV prefix instead of clearHistory` (condicional)
10. `F: option logits without vocab sample` (condicional; skip se G1 já existe)

## Riscos

| Risco | O que fazer |
|---|---|
| Held-out n=10 mente o 0,70 | A0 primeiro. Gate no n=20. |
| A não flipa 3 | esperado se `file-02` ficar. A′. Não 1.7B. |
| A2 não mexe `file-02` (0,024) | parar de afinar `index.ts`. Não é falha de A. |
| A′ parte `comando` | `options` só no `diff`. Reverter A′. |
| B remap overfita | held-out < linha A0 → reverter B. |
| B `diff-05` vai a `unrelated` | miss aceite; não mudar o ouro. |
| Overlay escondido no `diff` | fora. Held-out `h-diff-04` existe para o apanhar. |
| A2 alonga `file-01` e come o 15× de tempo | descriptions curtas; sem frase no `instructions`. |
| C `text` só JSON | `ui-thought` só com número da UI; senão 15× tokens falha. v1 10× pode viver. |
| C n=1 | 15× de tempo `skipped`. |
| Composer muda de modelo a meio | série nula. |
| Load do GGUF no primeiro hop | D1 + `warm` + C5. Não misturar com p50. |
| Stdio morre por call | 15× de sessão falha; D5 ou processo persistente. |
| D3 corta qualidade | reverter a linha. |
| E2 state no fim | só com authored ≥ 34/40 no bench dedicado. |
| C como 1.º passo (binário) | trabalho deitado fora: não corta o prefill. |
| GPU no Desktop | E e F lixo se o p50 já for dezenas de ms. |
| Subir gate 15 no código antes de C | report vermelho 0/5; não é implementação. |
| Tool não chamada | 15× só no bench. C5. |

## Pronto (melhorias)

1. Held-out n=20 medido em A0; acc ≥ linha de base A0 depois de A/A′/B.
2. Authored ≥ 34/40 no 0.6B **ou** A+A′+B documentados como saturados e o v1 0,75 intacto.
3. `generated_tokens === 0`. Nenhuma opção do ouro com massa 0 se o tokenizer a aceitou (G0/G1).
4. `bench/baseline.json` com `method: cursor-ui`, `text`, **3 amostras** / hop (mediana no tempo).
5. Tokens 15× se C3 fechou e C4 subiu o limiar; senão o report continua a 10× e este ficheiro diz que o 15× de tokens **não** existe no `text` visível (nem em `ui-thought` se a UI não contar).
6. Tempo 15× se a mediana UI / local ≥ 15 em ≥ 4/5; senão D/E (e F só com F0). GPU no Desktop pode fechar isto sem E/F.
7. C5: o Composer chama `decidir` nos cinco fixtures; a 2.ª call no mesmo stdio não recarrega o GGUF.
8. `grep` sem TypeSafe. Sem overlay no aceite.
9. `PACKS.comando` 8/8, envelope Qwen, transcript canónico, hops ids iguais.

## Falhou (preencher só se A+A′+B não derem 34/40)

| id | ouro | predito depois de A+A′+B | massa | nota |
|---|---|---|---|---|
| | | | | |

Não overlay. Não 1.7B. Não C. Não esticar hop. O v1 de [PLAN.md](PLAN.md) continua o aceite de 0,75 / 10×.
