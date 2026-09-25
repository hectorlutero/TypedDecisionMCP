# Eu não aceitei o teto que a IA desenhou

Tudo começou com curiosidade de YouTube.

Vi o Fireship falando de JEV e de gente que tinha feito modelo open source. Puxei isso pra dentro do Cursor, num agente na cloud, e depois trouxe pra máquina local: *ok, e se eu fizer um MCP que decide hops pra mim?* Command, subagent, diff, file, commit. Um semáforo. Auto, review, stop. Sem inventar texto. Sem gastar token de resposta.

Eu não queria “mais um plugin bonito”. Eu queria medir.

---

## Primeiro eu fui pro banco — o baseline na mão

No começo o trabalho era chato e certo: benchmark.

Chat novo. Cronômetro. Colar o hop. Anotar. Eu fiz a primeira leva e perguntei se podia seguir. Tropecei no óbvio — *não vi qual modelo estava chamando* — e tive que resetar o teste direito. Coletei o `bench/manual.json`. Pedi guia passo a passo. Liguei o MCP. Puxei transcript atrás de transcript pra não perder o fio da cloud.

Enquanto a IA falava em plano e aceite, eu estava na fila do laboratório: um hop de cada vez, no Cursor real, na minha máquina.

Quando perguntei o que ainda estava pendente, a resposta era uma lista. Eu falei: **pode executar todos**.

---

## Depois eu pedi briga entre ideias

Não queria uma opinião só.

Disparei vários agentes pra explorar, discutir entre si e achar soluções. A limitação eu deixei clara: **Cursor, máquina local**. Sem fantasia de cluster.

Aí veio a tentação de ouro: qualidade 0,9. Eu acreditei que 0,9 era o nosso ouro. Pedi pra planejar e ver quanto de velocidade isso sacrificava. Deixei executar.

Depois freiei.

*Cancela. Vamos dar um passo atrás. Quais eram as métricas antes de tentar o 0,9?*

Perguntei o melhor custo-benefício. Fechei no que fazia sentido pro uso real — não no número que soa bem no slide. Perguntei o tamanho do modelo. Perguntei de novo o benchmark. Eu estava dirigindo o volante, não só aprovando diffs.

---

## O dia em que eu trouxe uma análise de fora e perguntei: isso faz sentido?

Numa manhã eu colei uma análise (veio do Grok) que dizia uma coisa desconfortável:

A oportunidade revolucionária **não** é “mais um MCP” nem “subir o modelo até passar 0,75”.

O código ainda não tinha explorado de verdade onde estava o salto. Três camadas que eu levei a sério:

1. O truque do 10× estava pela metade — o motor reavaliava o state inteiro em cada pergunta, em vez de reutilizar o prefixo.  
2. Um modelo geral estava sendo usado como se fosse modelo de decisão.  
3. Havia caminho de cabeça leve, cache, outra forma de representar o hop — não só “compra um Qwen maior”.

Eu não engoli. Perguntei: **olha o que essa análise trouxe, veja se faz sentido.**

Exigi que o git estivesse atualizado. Perguntei o que fazia sentido dentro daquela análise. Perguntei o que era **Head MLP**. Pedi estimativa de impacto e complexidade. Pedi explicação didática — *eu não tenho muito conhecimento*. Pedi os passos pra construir. Mandei montar plano completo e disparar exploradores. Perguntei as outras oportunidades. Atualizei o plano. Mandei virar PRD. Questionei se os módulos eram deep ou rasos. Reavaliei. Mudei nomenclatura pro inglês (`decidir` → `decide`). Virei issues. Avaliei granularidade com subagentes sem contexto. Disparei explorador, executor e adversário. Pedi TDD e merge conforme os testes passassem.

Isso não é “a IA descobriu sozinha”. Isso sou eu empurrando a investigação até ela virar trabalho de verdade.

---

## Onde a IA falava teto — e eu continuei perguntando

Few-shot no 0.6B não funcionou. Eu não aceitei o slogan. Perguntei:

- o problema é a limitação do 0.6B?  
- o que realmente limita esse modelo? o que é ICL?  
- me mostra na íntegra o que acontece com o modelo pra ele se perder  
- alternativas mexendo no modelo, sem mexer, e fazendo os dois  

Quando falaram em probe mais leve e em destilar action, eu pedi o que isso seria — e como fazer.

Aí a pergunta que importa no dia a dia:

**É possível chegarmos a 200 ms? O que poderia impactar isso sem prejudicar qualidade?**

E a pergunta de produto, não de lab:

*Pelo meu uso do Cursor, quanto isso impactaria pelo ganho de velocidade? Faz sentido sacrificar um pouco a acurácia numa escala de uso maior? Dá pra cobrir essa falha de outras formas?*

E no fim daquele arco, a frase que eu uso como título desta história:

**Okay, conclusão: estamos chegando num limite? Consegue explorar alternativas mais ousadas de aumentar a qualidade e reduzir o tempo? Como eu poderia investigar isso com ainda mais profundidade?**

Eu pedi até o prompt de investigação profunda. Porque o “teto” que a IA descrevia — 0.6B, ICL fraco, p50 na casa dos centenas de ms, “não assume 1.7B/4B” — pra mim era hipótese de trabalho, não sentença.

---

## O que a investigação achou quando a gente desmontou o relógio

Mais tarde a gente destrinchou de verdade.

Não era a sonda. A sonda media quase nada.  
Não era “só quantizar”: Q4 do mesmo 0.6B quase não moveu; CUDA nem compilou; CPU piorou.  
No hop de arquivo, recalcular a mesma frase várias vezes doía — prefix-KV no Qwen ajudou um pouco.  
O decoder de chat fundo e estreito, na MX330, era um porteiro gordo cheirando leite: ~380 ms de prefill pra classificar uma frase curta.

O joint no Qwen melhorou qualidade (37/40, 16/20) e ficou ~411 ms. Ainda longe dos 200 ms. Ainda o mesmo emprego errado pra rede.

Aí veio a aposta ousada que a conversa anterior já cheirava: **trocar a rede**. MiniLM + probes. Mesmo contrato do `decide`. Policy continua mandando no auto/review/stop.

Resultado medido na minha máquina:

| | Authored | Held-out | p50 |
| --- | ---: | ---: | ---: |
| Logits Qwen | 33/40 | 15/20 | ~0,58 s → depois ~0,38 s no ship |
| Joint Qwen | 37/40 | 16/20 | ~0,41 s |
| **MiniLM + sondas** | **40/40** | **19/20** | **~0,015 s** |

Zero falso auto destrutivo nessa corrida. Um miss no held-out (`h-diff-01`). Geração do classificador: zero.

Isso não foi “a IA disse que o teto era X e eu aceitei”. Foi: eu suspeitei do teto, trouxe análise de fora, forcei Head MLP, forcei perguntas de leigo, forcei 200 ms, forcei uso diário — e a gente **passou** do teto do decoder Qwen trocando o emprego do modelo.

Hoje isso está em `main`, MCP global, user rule pedindo `decide` nos hops. O semáforo local deixou de ser o vilão do milissegundo.

---

## O que eu ainda não fechei (de propósito)

A fatura de verdade do Cursor — tokens do modelo grande, vários modelos de UI, uma ou duas semanas de uso — **ainda não medi**. O lab mostrou o amarelo rápido. O campo é o próximo capítulo. Por isso existem os roteiros R1–R8.

A moral, na minha voz: quando a IA desenha um teto, eu pergunto se é parede ou só o fim do corredor que ela enxerga. Às vezes é parede. Às vezes é falta de ousadia medida. Nesse projeto, medir ousadia valeu: o porteiro ficou leve, e o hop parou de me fazer esperar meio segundo.

---

## Próximos passos (campo)

_A preencher após 1–2 semanas de testes no plugin, em vários modelos._

Roteiros: [roteiros-economia-campo.md](roteiros-economia-campo.md) (R1–R8). Log: `bench/campo/log.jsonl`.

-
-
-
-
