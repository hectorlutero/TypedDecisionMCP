# Olha que legal o que eu consegui

Tudo começou com um vídeo. Falaram de um jeito open source de a IA decidir coisas locais. Eu puxei isso pro meu computador: e se o assistente de IA que eu uso pedisse licença antes de cada passo perigoso?

Não queria um chatbot a mais. Queria um porteiro. Alguém que só diga: pode ir, me mostra antes, ou para. Sem textão. Sem inventar história.

---

## Eu medi na mão

No começo o trabalho foi chato e certo. Chat novo. Cronômetro. Anotar. Eu errei o modelo uma vez e tive que recomeçar o teste direito. Pedi guia passo a passo. Liguei a ferramenta. Quando a lista de pendências apareceu, eu falei: pode executar todos.

Depois pedi várias IAs discutindo entre si. A regra era clara: tem que rodar no meu setup, na minha máquina.

Cheguei a querer 90% de acerto como ouro. Vi o preço em velocidade. Dei marcha à ré. Cancela. Quais eram os números antes? Qual o melhor custo-benefício? Eu estava no volante.

---

## O notebook que eu tenho

Eu não tenho torre absurda nem placa com dezenas de gigas. Tenho um Dell de laptop com placa de vídeo fraca (MX330).

Isso me forçou a buscar solução eficiente. E a não depender de serviço pago na internet pra cada “pode” ou “para”. O porteiro tinha que morar aqui em casa.

---

## Eu trouxe uma análise de fora

Numa manhã colei um texto que dizia: a oportunidade não é “mais um plugin” nem “só subir o modelo até passar na prova”. O código ainda não tinha explorado o que importava — reaproveitar trabalho, parar de usar modelo de conversa pra um emprego de porteiro, testar cabeça leve.

Eu perguntei se fazia sentido. Exigi git atualizado. Perguntei o que era cada peça, em linguagem didática. Mandei virar plano, depois trabalho de verdade: issues, testes, merge conforme passava.

Quando um atalho famoso (few-shot) falhou no modelo pequeno, eu não engoli o slogan. Perguntei o que limita de verdade. Pedi pra ver o modelo se perdendo. Pedi alternativas com e sem mudar o modelo.

Perguntei se dava pra chegar perto de 200 milissegundos sem estragar qualidade. Perguntei pelo meu uso diário: vale sacrificar um pouco de acerto por velocidade? Dá pra cobrir a falha de outro jeito?

No fim daquele arco eu perguntei: estamos num limite? Tem alternativa mais ousada? Como eu investigo isso com mais profundidade?

O “teto” que a IA descrevia era hipótese de trabalho. Não sentença.

---

## O que a gente achou quando abriu o relógio

A demora não era o porteiro “pensando texto”. Era um modelo de conversa fazendo conta pesada pra uma pergunta simples — quase meio segundo por vez no começo. Quantizar o mesmo modelo quase não ajudou. Mandar pra processador piorou. No caminho de escolher arquivo, recalcular a mesma frase várias vezes doía; um atalho ajudou um pouco e ainda assim ficava lento na mão.

Aí veio a aposta: trocar o emprego da rede. Em vez do chef de restaurante fino pra cheirar se o leite está azedo, um ajudante leve só pra isso. Continua local. Continua três respostas. Quem manda no “pode / mostra / para” continua sendo a regra do produto, não o modelo inventando.

Resultado no meu Dell:

Antes, o porteiro clássico acertava bem, mas não esmagava, e demorava perto de meio segundo (depois melhorou um pouco e ainda era centenas de milissegundos). Com o ajudante leve: acertou quase tudo nos testes (40 em 40 num conjunto, 19 em 20 no de fora), respondeu num piscar (~15 milissegundos), e em ordem de apagar coisa não liberou “pode” falso.

Isso está no projeto principal agora. A ferramenta roda no notebook. Eu pedi pra ela valer em qualquer pasta de trabalho, não só nesse repo.

---

## O que ainda falta

Ainda não medi se isso barateia a conta do assistente no dia a dia, em vários modelos, por uma ou duas semanas. O laboratório mostrou o amarelo rápido. O campo é o próximo capítulo. Por isso existem roteiros de teste (R1 a R8).

Com máquina fraca, ou eu desistia ou ficava esperto. Fiquei esperto. O porteiro ficou leve e ficou em casa.

---

## Próximos passos (campo)

_A preencher depois de 1–2 semanas testando no dia a dia, em vários modelos._

Roteiros: [roteiros-economia-campo.md](roteiros-economia-campo.md).

-
-
-
-
