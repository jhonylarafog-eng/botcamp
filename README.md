# ⚽ Bot de Campeonato para WhatsApp

Bot que organiza campeonatos **X1, X2 e X3** em grupos de WhatsApp. O jogo roda fora do WhatsApp; o bot só forma os times, sorteia os confrontos, controla a sala e guarda os rankings.

## Como funciona

1. **Novo jeito:** `/iniciarcampx1`, `/iniciarcampx2` ou `/iniciarcampx3` (admin: `aleatorio` no final pro modo aleatório). O bot pergunta a *liga* (20 opções, responde só o número) e *quantos clubes entram* (64/32/16/8/4/2). Depois é só digitar o nome do time. Entrou, não sai mais; só admin tira com `/removertime` (respondendo a mensagem da pessoa ou marcando). `/listacamp` mostra times livres e preenchidos. Quando enche, o bot avisa, cria os confrontos e segue o *cria*. No fim: `/vitoria eu` ou `/vitoria @quem` (admin), ou o jogador fala *ganhei* e o bot pergunta aos admins (`/confirmar` ou `/negar`). As ligas e os clubes ficam em `src/ligas.js` (edite à vontade).
   **Camp aberto:** `/campabertox1`, `/campabertox2` ou `/campabertox3` (só admin). Mesmo menu de liga e tamanho, mas ninguém escolhe time: é só digitar *vou jogar* (ou `/voujogar`). Quando as vagas fecham (clubes × jogadores por time, ex.: 4 clubes no x3 = 12), o bot sorteia os clubes e embaralha todo mundo entre os times. `/listacamp` mostra os inscritos, `/removertime` (admin) tira alguém e `/comecar` (admin) sorteia antes de encher, com quem já entrou.
   _Jeito antigo (ainda funciona):_ `/iniciar` e escolher a competição (`/champions`, `/libertadores`, `/brasileirao`) e o modo (`/x1`, `/x2`, `/x3`)
2. Cada pessoa **digita o nome do clube** pra entrar nele (aceita apelido e erro de digitação)
3. Quando todos os clubes enchem, o bot sorteia os confrontos (mata-mata, com folga se o número for ímpar)
4. Em cada jogo, alguém manda `cria`: quem mandar primeiro faz o **time adversário** criar a sala. O bot marca o time que vai criar
5. O criador manda `/sala CÓDIGO` e o bot marca o outro time
6. Fim do jogo: `/placar 3x1` (seu time primeiro) e o adversário confirma com `/confirmar`. Empate: `/placar 2x2 pen 4x3`
7. Cada jogador registra `/gols N` e `/assist N` da última partida

Rankings: `/ranking` (ELO), `/trofeus`, `/artilharia`, `/derrotas`, `/duplas`, `/trios`, `/perfil`.

Admins do grupo (ou quem iniciou o campeonato) podem usar `/comecar`, `/cancelar` e `/forcar`.

## Contagem de gols e assistências (com print)

1. O jogador manda o **print** do fim da partida e escreve, por exemplo, `fiz 2 gols, dei 1 assistência` (na legenda do print, ou antes/depois dele, em até 15 minutos). Sem print, o bot não anota nada.
2. O bot registra um pedido pendente. Um **admin** responde ao print com `/ok` para confirmar.
3. Para corrigir os números: `/reg @fulano 2 gols 1 assistência`, também **respondendo ao print**. O `/reg` não funciona sem citar um print.
4. Cada registro conta 1 partida jogada. Um mesmo print não pode ser contado duas vezes.
5. **Remover (admin):** `/remover3gol @fulano` ou `/remover5assistencia @fulano` tira gols/assistências (só se a pessoa tiver essa quantidade). **Resetar (admin):** `/resetartilharia` pede confirmação; `/resetartilharia confirmar` zera tudo.
6. **Adição manual (admin, sem print):** `/add @fulano 3 gols 2 assistências` soma direto. Opcional `4 jogos` para contar partidas (por padrão soma 0 jogos). Vários jogadores: um por linha, separados por `;` ou só marcando um depois do outro.

Consultas: `/artilheiros` ou `/assistencias` (mesma lista: todos marcados, por participações = gols + assistências), `/pendentes`.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `BOT_NUMBER` | Número do WhatsApp do bot, só dígitos com DDI (ex.: `5511999998888`) |
| `ADMIN_KEY` | Senha da página de pareamento |
| `DATA_DIR` | Pasta de dados (login + campeonatos). **Precisa ser um volume** (`/data`) |
| `PORT` | Porta da página web (a Railway define sozinha) |
| `PREFIX` | Prefixo dos comandos (padrão `/`) |

## Conectando o WhatsApp (sem QR code)

1. Abra `https://SEU-SITE/?key=SUA_ADMIN_KEY` no navegador do celular
2. A página mostra um código de 8 caracteres
3. No WhatsApp **do número do bot**: Aparelhos conectados → Conectar um aparelho → **Conectar com número de telefone** → digite o código
4. Adicione o número do bot no grupo e deixe como admin

A sessão fica salva no volume, então não precisa parear de novo a cada atualização.

## Usando o WhatsApp pessoal

Funciona. O bot entra como "aparelho conectado": não muda foto, nome nem recado. As respostas do bot aparecem no grupo como mensagens enviadas pelo dono do número, e o que o dono digitar (`/iniciar`, nome de clube, `cria`) também vale como comando. O dono é sempre admin do bot. Mantenha o celular com internet pelo menos a cada poucos dias, senão o WhatsApp desconecta o aparelho.

## Editando os clubes

Abra `src/clubs.js`. Cada clube tem um nome e uma lista de apelidos. É só adicionar, tirar ou corrigir.

## Rodando os testes

```
npm install
npm test
```

## Avisos

- A conexão usa uma biblioteca **não oficial** (Baileys). Use um número só do bot; existe risco de banimento do número
- Os dados ficam num arquivo JSON, suficiente para grupos de amigos


## Modo aleatório

O admin manda `/x3aleatorio` (ou `/x1aleatorio`, `/x2aleatorio`). Dá pra já incluir a competição e a fase: `/x3aleatorio libertadores quartas`.

1. O bot mostra as fases: `/final` (2 times), `/semi` (4), `/quartas` (8), `/oitavas` (16). Só admin escolhe.
2. Aparecem os clubes e cada pessoa digita o nome de um clube pra entrar.
3. Quando todas as vagas enchem, o bot **embaralha os jogadores entre os times** e **sorteia os confrontos**.
4. O admin pode usar `/comecar` pra sortear antes de encher: forma quantos times completos der (mínimo 2) e quem sobrar fica de fora.

Depois disso o campeonato segue normal (`cria`, `/sala`, `/placar`, `/confirmar`).

## Times durante as inscrições

- Quando alguém entra num clube, o bot mostra o time (nome + jogadores marcados + vagas livres).
- `/listatimes` mostra todos os times: completos e com vagas.
- O bot **ignora `/lista`** de propósito, porque outro bot do grupo usa esse comando. Gols e assistências: `/artilheiros`.

## Prêmio Puskas (gol mais bonito do dia)

- O jogador manda o **vídeo do gol com a legenda `/puskas`** (ou responde ao vídeo com `/puskas`). Os gols **ficam guardados até acontecer uma votação** (não somem na virada do dia). Máximo de **10 gols esperando votação**; o 11º é recusado até o admin votar.
- `/puskas lista` mostra os gols esperando votação. `/puskas remover N` tira um gol (o autor ou admin).
- **Admin:** `/iniciar puskas` fecha o grupo (só admins falam), explica como funciona e reenvia os gols da lista, um de cada vez ("Gol 1 de N — gol do @fulano"), pedindo pra reagir no mais bonito. Depois reabre o grupo pra todos votarem. Precisa de pelo menos 2 gols. **O número do bot precisa ser admin do grupo** pra fechar/abrir (se não for, o bot avisa e segue sem fechar). Se o grupo já estava fechado, o bot não mexe nele.
- A votação é por **reação**: cada pessoa reage (qualquer emoji) no vídeo do gol que achou mais bonito. 1 voto por pessoa (reagir em outro gol muda o voto; tirar a reação tira o voto). Não vale votar no próprio gol.
- Plano B se a reação não funcionar: `/puskas votar N`.
- **Admin:** `/encerrar puskas` apura, revela os autores, reenvia o vídeo vencedor e soma 1 Puskas pro autor ("@fulano agora tem 2 Puskas"). **A votação não fecha sozinha: o admin precisa mandar `/encerrar puskas`.** `/puskas hall` (ou `/puskas ranking`) mostra todo mundo que já ganhou, com a contagem, marcando as pessoas. Tudo fica salvo no volume. Em caso de empate, todos os empatados vencem. `/cancelarpuskas` (ou `/puskas cancelar`) cancela a votação e descarta os votos, **mas mantém os gols**: dá pra abrir de novo com `/iniciar puskas`.
- Os vídeos ficam em `DATA_DIR/puskas`. Os que não ganham são apagados na apuração. **O hall e os vídeos dos vencedores nunca são apagados sozinhos.** Pra economizar espaço, um admin pode usar `/limparpuskas` (mostra quanto dá pra liberar) e `/limparpuskas confirmar`, que apaga só os *vídeos* de vencedores com mais de 60 dias; o hall e a contagem de Puskas ficam.

## Castigo (tirar o admin por 24h)

- **Admin:** `/castigo @fulano` tira o admin da pessoa por **24 horas**. `/castigos` mostra quem está de castigo e quanto falta.
- **Não dá pra perdoar nem renovar:** o castigo dura exatamente 24h. Castigar de novo quem já está de castigo só mostra quanto falta.
- Durante o castigo, **ninguém consegue promover a pessoa de novo** (nem manualmente, nem por outro bot): quando o WhatsApp avisa que ela virou admin, o bot tira o admin na hora e avisa o grupo. Há também uma conferência a cada 2 minutos e ao reconectar, caso algum aviso se perca.
- **Outro bot (o que puxa campeonato):** ao castigar, o bot também manda no grupo `/removeadmin @fulano` pra tirar a pessoa da lista de admins daquele bot. Se alguém mandar `/addadmin` marcando (ou respondendo) quem está de castigo, o bot espera 3 segundos e manda `/removeadmin` de novo. Os comandos podem ser trocados com as variáveis `CMD_TIRAR_ADMIN_OUTRO_BOT` e `CMD_DAR_ADMIN_OUTRO_BOT`. Limite: só percebe o `/addadmin` quando alguém manda a mensagem; se o outro bot der admin por outro caminho, o bot não vê.
- Depois de 24h o castigo acaba sozinho (o bot não promove ninguém; um admin pode promover de novo).
- **Números blindados:** a variável `PROTEGIDOS` (números separados por vírgula, só dígitos com DDI, ex.: `5511999998888,5511988887777`) lista quem **não pode ser castigado**.
- **O número do bot precisa ser admin do grupo.** O bot não consegue rebaixar a dona (criadora) do grupo.
- Os castigos ficam salvos no volume, então sobrevivem a reinícios.


## Boas-vindas
Quando alguém novo entra no grupo, o bot manda a foto de perfil da pessoa (se ela deixar ver; senão só o texto) com uma mensagem de boas-vindas marcando ela. Para desligar, coloque a variável `BOAS_VINDAS=nao` na Railway. O bot precisa estar no grupo (admin não é obrigatório).

## Jogos 🎮

- `/quiz [N]` (admin): quiz de futebol — o bot pergunta no grupo, o primeiro que escreve a resposta certa ganha 1 ponto. Banco de perguntas em `src/quiz_dados.js`.
- `/cidadedorme` (admin): abre as inscrições (digitar *eu*), `/iniciarjogo` começa. Cada um recebe o papel no privado (assassino, detetive, médico, cidadão); de noite agem por privado (`/matar N`, `/salvar N`, `/investigar N`), de dia `/votar N`.
- `/lugares` (admin): Adivinha o Lugar — cada um recebe um lugar secreto no privado e descreve na sua vez sem dizer o nome; quem adivinhar primeiro pontua. Lugares em `src/lugares_dados.js`.
- Ao abrir cada jogo o bot marca todo mundo do grupo (marcação oculta) e explica as regras em poucas linhas.
- Comuns: `/entrar`, `/sairjogo`, `/pular`, `/apurar` (admin), `/cancelarjogo` (admin). Os prazos são retomados se o bot reiniciar.
