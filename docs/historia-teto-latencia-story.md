# Meio segundo por hop — e o que isso faz ao teu turno

Imagina isto: o agente no Cursor está pronto. Sabe o comando. Sabe o ficheiro. Falta só uma coisa — um semáforo local que diz «vai», «mostra-me antes», ou «para».

Esse semáforo chama-se `decide`. Classifica o **hop**: o próximo passo pequeno — um command, um subagent, um diff, um file, um commit. Depois a policy mapeia o resultado para `auto`, `review` ou `stop`. Não escreve resposta. Não gasta tokens de chat. Só classifica.

Porquê te importares com um hop local?

Porque o agente espera. Antes de correr o comando. Antes de abrir o subagent. Antes de aceitar o diff. Meio segundo aqui, meio segundo ali — e o turno deixa de fluir. Pior: se o classificador se enganar num command destrutivo e mandar `auto` onde a policy deveria ter parado, o atrito vira risco.

A pergunta humana não era «o modelo errou a teoria». Era: quanto tempo entre a pergunta e a libertação do turno — e se consegues baixar o relógio sem soltar o controlo.

---

## O que se sente no laptop

Durante semanas o motor por omissão foi **logits** no Qwen — o modelo olha para as pontuações brutas das opções e escolhe. Funcionava. Também custava.

Na GeForce MX330 deste relato — GPU de portátil, nada de datacenter — o p50 (metade das corridas mais rápidas que este número) ficou em cerca de **577 ms**. Authored: 33 em 40. Held-out — o conjunto que o motor não «viu» a treinar no mesmo sentido, o teste de fora — 15 em 20. Tokens de resposta gerados: sempre zero. O contrato do `decide` aguentava: classificação, não chat.

Meio segundo não parece muito. Até o agente repetir o hop dezenas de vezes no mesmo turno. Aí o intervalo deixa de ser lab e passa a ser atrito na mão.

---

## Primeiro bloco: o óbvio que não cede

O reflexo natural: quantizar mais. Trocar Q8 por Q4. Tentar outra via na GPU. Empurrar para CPU.

Day1 fechou estas portas com números, não com opinião. Q4: praticamente sem ganho (−1%). CUDA: falha. CPU: pior. No mesmo 0.6B, no mesmo portátil, o teto do decoder estreito não cedia a «mais um knobs».

Metáfora simples: tinhas um corredor estreito. Pintar as paredes mais depressa não alarga o corredor.

---

## Segundo bloco: um atalho no ficheiro

No hop `file`, reutilizar o **prefix-KV** — guardar o prefixo já «lido» para não recalcular tudo — cortou o p50 do ficheiro de ~537 ms para ~414 ms. Ajudou. Foi para o motor: probes, temperaturas, e o **joint head** no Qwen — uma cabeça pequena em cima da rede, a ler o embedding e a decidir a opção.

O joint Qwen head-mlp: authored 37/40, held-out 16/20, p50 ~411 ms. Ainda zero tokens de resposta. Melhor qualidade. Latência ainda na casa das centenas de milissegundos.

O atalho no ficheiro moveu o preset certo. Não moveu o produto para a dezena de milissegundos.

---

## Terceiro bloco: e se a rede for outra?

A terceira frente não foi afinar o Qwen outra vez. Foi trocar a rede.

**MiniLM** — um embedding pequeno, all-MiniLM-L6-v2 — e **probes** lineares em cima: cabeças leves que leem o embedding e classificam. O `decide` continua a classificar hops. A policy continua a mandar na acção (`auto` / `review` / `stop`). Muda o motor de representação.

Restrições que se mantiveram: ouro na opção; a policy é dona da acção; sem TypeSafe; sem destilar a acção para dentro do modelo.

---

## A viragem que parte a intuição

Esperavas um ganho. Talvez metade. Talvez um terço.

O candidato a ship, medido nesta máquina:

| | Authored | Held-out | p50 |
| --- | --- | --- | --- |
| Logits Qwen | 33/40 | 15/20 | ~577 ms |
| Joint Qwen head | 37/40 | 16/20 | ~411 ms |
| MiniLM + probes | **40/40** | **19/20** | **~15 ms** |

Quinze milissegundos. Não quatrocentos. Não quinhentos e setenta.

Falso `auto` destrutivo nesta corrida: **zero**. O único miss nomeado no held-out: **h-diff-01**. Geração continua zero → zero.

Tokens de prompt locais (soma): cerca de **−30%** face aos logits. Economia no motor local do `decide` — não a fatura billable do Cursor. Essa ainda não medimos.

Em linguagem de produto: o hop deixa de ser o gargalo sensível no relógio. A classificação sobe. O ouro da opção aguenta. A policy não perde o controlo.

---

## O nome da ideia (só agora)

O teto do hop não era «quantizar melhor o mesmo decoder». Era o custo de representar o hop num corredor estreito e profundo, hop após hop, no caminho crítico do agente.

Partir o teto foi trocar a representação: embedding leve + probes, com o mesmo contrato — classificar, não chatter; policy manda na acção.

Não é magia de GPU. É mudar o que pedes ao motor em cada hop.

---

## O que ainda não sabemos

Não medimos a economia real de tokens billable no Cursor — o que pagas quando o agente usa vários modelos, com o plugin no caminho crítico.

Medimos p50 e acerto do motor local. Medimos geração zero. Medimos a soma de prompt tokens locais.

Não medimos se o hop mais rápido muda o comportamento do agente (menos retries, menos review humano, menos stops inúteis). Não medimos a economia no plugin em vários modelos, em uso diário.

Esse campo é o próximo capítulo. Os números de lab não o substituem.

A acção mais sábia agora não é celebrar o milissegundo. É meter o plugin a trabalhar 1–2 semanas, em vários modelos, e ver o que o campo diz — não o que o bench promete.

---

## Próximos passos (campo)

_A preencher após 1–2 semanas de testes no plugin, em vários modelos._

-
-
-
-
