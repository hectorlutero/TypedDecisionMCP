# O teto do hop: de meio segundo a quinze milissegundos

TypedDecisionMCP é um MCP local no Cursor. A ferramenta `decide` classifica o hop — command, subagent, diff, file, commit — e a policy mapeia o resultado para `auto`, `review` ou `stop`. Não gera tokens de resposta. O trabalho é classificar a opção e deixar a policy decidir a acção.

Durante semanas o motor por omissão foi logits no Qwen3-0.6B Q8. Funcionava. Também custava: cada hop sentia-se. O problema humano não era «o modelo errou a teoria». Era o intervalo entre a pergunta e a libertação do turno — e o risco de um comando destrutivo passar a `auto` sem merecer.

Este texto conta o que medimos, o que matámos, e o candidato a ship que partiu o teto de latência sem soltar a qualidade.

---

## Abertura

Um hop lento no Cursor não é só latência de lab. É o agente a esperar pelo `decide` antes de correr um comando, abrir um subagent, ou aceitar um diff. Meio segundo por hop, repetido, vira atrito. Um erro de classificação no command destrutivo vira pior: `auto` onde a policy deveria ter parado.

A tensão era essa: baixar o relógio sem afrouxar o ouro da opção, e sem deixar a policy perder o controlo da acção. Sem TypeSafe. Sem destilar a acção no modelo. O `decide` classifica; a policy manda.

---

## O que medimos

Baseline fixo: logits Qwen3-0.6B Q8, fresco.

| Métrica | Logits (omissão antiga) |
| --- | --- |
| Authored | 33/40 |
| Held-out | 15/20 |
| p50 | ~577 ms |
| `generated_tokens` | sempre 0 |

O motor não gera resposta. Os zeros de geração confirmam o contrato: classificação, não chat.

Hardware deste relato: GeForce MX330 2 GB, Vulkan. O decoder profundo e estreito do Qwen estava kernel-starved — prefill na casa dos ~380 ms contra um pico FP32 estimado de ~43 ms. Quantizar o mesmo modelo ou forçar outro backend não magia o kernel.

Restrições que se mantiveram ao longo das frentes:

- ouro na opção (yes/no, ordem de ficheiros, etc.);
- a policy é dona da acção (`auto` / `review` / `stop`);
- sem TypeSafe;
- sem destilar a acção para dentro do modelo.

---

## Três frentes

### 1. Q4 e GPU — Day1, kills honestos

Tentámos o óbvio no mesmo 0.6B: Q4 em vez de Q8. Latência: sem ganho (−1%). CUDA: falha de compilação. CPU: pior. O Day1 fechou estas portas com números, não com opinião. No MX330 Vulkan, o teto do decoder estreito não cede a quantização ligeira nem a backend alternativo.

### 2. Prefix-KV no ficheiro (Qwen)

No hop `file`, reutilizar o prefix-KV no Qwen cortou o p50 do ficheiro de ~537 ms para ~414 ms. A qualidade manteve-se o bastante para ir ao motor: file-pair probe, temperaturas, e o joint head-mlp no Qwen.

O joint Qwen head-mlp ficou assim:

| Métrica | Joint Qwen head-mlp |
| --- | --- |
| Authored | 37/40 |
| Held-out | 16/20 |
| p50 | ~411 ms |
| `generated_tokens` | 0 |

Melhor qualidade, latência ainda na casa das centenas de milissegundos. O KV no ficheiro ajudou o preset certo; não moveu o produto para a dezena de milissegundos.

### 3. Trocar a rede — MiniLM + probes lineares

A terceira frente não foi afinar o Qwen. Foi trocar a rede: embedding all-MiniLM-L6-v2 Q8 e probes lineares (head) em cima do embedding. O `decide` continua a classificar hops; a policy continua a mapear para acção. Muda o motor de representação.

---

## O resultado MiniLM

Candidato a ship medido nesta máquina:

| Métrica | Logits Qwen | Joint Qwen head | MiniLM + probes |
| --- | --- | --- | --- |
| Authored | 33/40 | 37/40 | **40/40** |
| Held-out | 15/20 | 16/20 | **19/20** |
| p50 | ~577 ms | ~411 ms | **~15 ms** |
| Falso `auto` destrutivo | — | — | **0** |
| Miss held-out | — | — | só **h-diff-01** |
| `generated_tokens` | 0 | 0 | **0 → 0** |

Tokens de prompt locais (soma): logits 7525 vs head 5282 — cerca de −30%. Geração continua zero. Isto é economia no motor local do `decide`, não a fatura billable do Cursor.

Em linguagem de produto: o hop deixa de ser o gargalo sensível no relógio, a classificação sobe no authored e no held-out, e o único miss nomeado no held-out é h-diff-01. Zero falso `auto` destrutivo nesta corrida.

---

## O que NÃO medimos ainda

Não medimos a economia real de tokens billable no Cursor — o que o utilizador paga quando o agente usa vários modelos, com o plugin no caminho crítico.

Medimos:

- p50 e acerto do motor local (`decide`);
- `generated_tokens === 0` no classificador;
- soma de prompt tokens locais (logits vs head).

Não medimos:

- tokens billable do Cursor ao longo de sessões reais;
- se o hop mais rápido muda o comportamento do agente (menos retries, menos review humano, menos stops inúteis);
- a economia de tokens no plugin em vários modelos, em uso diário.

Esse campo é o próximo capítulo. Os números de lab não o substituem.

---

## Próximos passos (campo)

_A preencher após 1–2 semanas de testes no plugin, em vários modelos._

Roteiros: [roteiros-economia-campo.md](roteiros-economia-campo.md) (R1–R8). Log: `bench/campo/log.jsonl`.

-
-
-
-

---

## Nota técnica (benches)

Corridas e agregados nesta máquina, sob `bench/out/`:

| Artefacto | Conteúdo |
| --- | --- |
| `bench/out/logits.json` | baseline logits Qwen |
| `bench/out/head-joint-bench.json` / `head-joint-report.json` | joint Qwen head-mlp |
| `bench/out/day1-prefill.json` | Day1 Q4 / GPU / CPU |
| `bench/out/day2-prefix-kv.json` | prefix-KV (qualidade / rácios) |
| `bench/out/day4-file-kv-engine.json` / `day4-file-kv-warm.json` | file ~537→414 ms no Qwen |
| `bench/out/day6-minilm-smoke.json` | smoke MiniLM |
| `bench/out/head-minilm-bench.json` / `head-joint-minilm-report.json` | authored/held-out/p50 MiniLM |
| `bench/out/head-minilm-cost.txt` | prompt tokens locais |
| `bench/out/plan-execution-summary.json` | resumo das frentes |

Pesos MiniLM de laboratório: `~/.cache/TypedDecisionMCP/head-mlp-minilm.json`. O head Qwen de produção em cache não foi o assunto deste relato de teto; outro trabalho trata do flip do motor por omissão.
