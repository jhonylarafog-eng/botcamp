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
