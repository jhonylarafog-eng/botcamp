# ⚽ Bot de Campeonato para WhatsApp

Bot que organiza campeonatos **X1, X2 e X3** em grupos de WhatsApp. O jogo roda fora do WhatsApp; o bot só forma os times, sorteia os confrontos, controla a sala e guarda os rankings.

## Como funciona

1. `/iniciar` e escolher a competição (`/champions`, `/libertadores`, `/brasileirao`) e o modo (`/x1`, `/x2`, `/x3`)
2. Cada pessoa **digita o nome do clube** pra entrar nele (aceita apelido e erro de digitação)
3. Quando todos os clubes enchem, o bot sorteia os confrontos (mata-mata, com folga se o número for ímpar)
4. Em cada jogo, alguém manda `cria`: quem mandar primeiro faz o **time adversário** criar a sala. O bot marca o time que vai criar
5. O criador manda `/sala CÓDIGO` e o bot marca o outro time
6. Fim do jogo: `/placar 3x1` (seu time primeiro) e o adversário confirma com `/confirmar`. Empate: `/placar 2x2 pen 4x3`
7. Cada jogador registra `/gols N` e `/assist N` da última partida

Rankings: `/ranking` (ELO), `/trofeus`, `/artilharia`, `/assistencias`, `/derrotas`, `/duplas`, `/trios`, `/perfil`.

Admins do grupo (ou quem iniciou o campeonato) podem usar `/comecar`, `/cancelar` e `/forcar`.

## Contagem de gols e assistências (com print)

1. O jogador manda o **print** do fim da partida e escreve, por exemplo, `fiz 2 gols, dei 1 assistência` (na legenda do print, ou antes/depois dele, em até 15 minutos). Sem print, o bot não anota nada.
2. O bot registra um pedido pendente. Um **admin** responde ao print com `/ok` para confirmar.
3. Para corrigir os números: `/reg @fulano 2 gols 1 assistência`, também **respondendo ao print**. O `/reg` não funciona sem citar um print.
4. Cada registro conta 1 partida jogada. Um mesmo print não pode ser contado duas vezes.
5. `/desfazer N` cancela o registro número N (o print pode ser registrado de novo).
6. **Adição manual (admin, sem print):** `/add @fulano 3 gols 2 assistências` soma direto. Opcional `4 jogos` para contar partidas (por padrão soma 0 jogos). Vários jogadores: um por linha, separados por `;` ou só marcando um depois do outro. Dá pra desfazer com `/desfazer N`.

Consultas: `/listagols` (jogos, gols e assistências de todos), `/artilheiros`, `/assistentes`, `/pendentes`.

## Bola de Ouro (votação)

1. Um admin abre com `/bolaouro Temporada 1`. Os candidatos são os jogadores que têm partida registrada (`/listagols`).
2. Cada candidato vota nos **3 melhores**, em ordem: `/votar @1º @2º @3º` (ou pelos nomes: `/votar ana, bia, caio`). O 1º vale 5 pontos, o 2º vale 3 e o 3º vale 1. Não vale votar em si mesmo, e dá pra mudar o voto votando de novo.
3. O voto é **aberto**: o bot mostra no grupo cada voto. `/votos` mostra quem votou, quem falta e a parcial.
4. O admin encerra com `/encerrar`: o bot apura (desempate por mais 1º lugares, depois mais 2º), anuncia o campeão e guarda no `/hall`. `/cancelarvotacao` descarta.

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
- O bot **ignora `/lista`** de propósito, porque outro bot do grupo usa esse comando. Gols e assistências: `/listagols`.

## Prêmio Puskas (gol mais bonito do dia)

- O jogador manda o **vídeo do gol com a legenda `/puskas`** (ou responde ao vídeo com `/puskas`). Máximo de **10 gols por dia**; o 11º é recusado.
- `/puskas lista` mostra os gols de hoje. `/puskas remover N` tira um gol (o autor ou admin).
- **Admin:** `/iniciar puskas` fecha o grupo (só admins falam), explica como funciona e reenvia os gols de hoje, um de cada vez ("Gol 1 de N — gol do @fulano"), pedindo pra reagir no mais bonito. Depois reabre o grupo pra todos votarem. Precisa de pelo menos 2 gols. **O número do bot precisa ser admin do grupo** pra fechar/abrir (se não for, o bot avisa e segue sem fechar). Se o grupo já estava fechado, o bot não mexe nele.
- A votação é por **reação**: cada pessoa reage (qualquer emoji) no vídeo do gol que achou mais bonito. 1 voto por pessoa (reagir em outro gol muda o voto; tirar a reação tira o voto). Não vale votar no próprio gol.
- Plano B se a reação não funcionar: `/puskas votar N`.
- **Admin:** `/encerrar puskas` apura, revela os autores, reenvia o vídeo vencedor e soma 1 Puskas pro autor ("@fulano agora tem 2 Puskas"). **A votação não fecha sozinha: o admin precisa mandar `/encerrar puskas`.** `/puskas hall` (ou `/puskas ranking`) mostra todo mundo que já ganhou, com a contagem, marcando as pessoas. Tudo fica salvo no volume. Em caso de empate, todos os empatados vencem. `/puskas cancelar` descarta a votação.
- Os vídeos ficam em `DATA_DIR/puskas`. Os que não ganham são apagados na apuração; sobras antigas são apagadas depois de 3 dias.

## Castigo (tirar o admin por 24h)

- **Admin:** `/castigo @fulano` tira o admin da pessoa por **24 horas**. `/castigos` mostra quem está de castigo e quanto falta.
- **Não dá pra perdoar nem renovar:** o castigo dura exatamente 24h. Castigar de novo quem já está de castigo só mostra quanto falta.
- Durante o castigo, **ninguém consegue promover a pessoa de novo** (nem manualmente, nem por outro bot): quando o WhatsApp avisa que ela virou admin, o bot tira o admin na hora e avisa o grupo. Há também uma conferência a cada 2 minutos e ao reconectar, caso algum aviso se perca.
- Depois de 24h o castigo acaba sozinho (o bot não promove ninguém; um admin pode promover de novo).
- **Números blindados:** a variável `PROTEGIDOS` (números separados por vírgula, só dígitos com DDI, ex.: `5511999998888,5511988887777`) lista quem **não pode ser castigado**.
- **O número do bot precisa ser admin do grupo.** O bot não consegue rebaixar a dona (criadora) do grupo.
- Os castigos ficam salvos no volume, então sobrevivem a reinícios.
