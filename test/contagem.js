// Testa a contagem de gols/assistências com print + confirmação de admin. Rode com: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');
const { lerStats } = require('../src/contagem');

// ---------- leitura dos números ----------
assert.deepStrictEqual(lerStats('fiz 2 gols, dei 1 assistência'), { gols: 2, assist: 1 });
assert.deepStrictEqual(lerStats('@5545998353958 1 gol, 3 assistências'), { gols: 1, assist: 3 });
assert.deepStrictEqual(lerStats('Fiz dois gols e dei três assistências'), { gols: 2, assist: 3 });
assert.deepStrictEqual(lerStats('gols 4 assist 2'), { gols: 4, assist: 2 });
assert.deepStrictEqual(lerStats('só 1 gol hoje'), { gols: 1, assist: 0 });
assert.deepStrictEqual(lerStats('0 gols 0 assistências'), { gols: 0, assist: 0 });
assert.strictEqual(lerStats('bora jogar mais tarde?'), null);
assert.strictEqual(lerStats('fiz 99 gols').invalido, true);

// ---------- fluxo no grupo ----------
const CHAT = 'grupo@g.us';
const ID = {
  ana: 'ana@s.whatsapp.net', bia: 'bia@s.whatsapp.net', caio: 'caio@s.whatsapp.net',
  davi: 'davi@s.whatsapp.net', admin: 'admin@s.whatsapp.net',
};
const NOMES = { ana: 'Ana', bia: 'Bia', caio: 'Caio', davi: 'Davi', admin: 'Admin' };

const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bot-')), 'dados.json');
let store = new Store(arquivo);
let bot = new Bot(store);
let ultimas = [];
let seq = 0;

function fala(quem, text, extra = {}) {
  const msg = {
    chatId: CHAT, senderId: ID[quem], senderName: NOMES[quem], text,
    isAdmin: quem === 'admin', id: `MSG${++seq}`, temImagem: false, mentions: [], quoted: null,
    ...extra,
  };
  ultimas = bot.handle(msg);
  const saida = ultimas.map((x) => x.text).join('\n---\n');
  console.log(`\n[${NOMES[quem]}${extra.temImagem ? ' 📷' : ''}] ${text}${saida ? '\n' + saida.split('\n').map((l) => '  ‹ ' + l).join('\n') : '\n  ‹ (sem resposta)'}`);
  return { id: msg.id, saida };
}
const print = (quem, legenda = '') => fala(quem, legenda, { temImagem: true });
const citando = (print, autor) => ({ quoted: { id: print.id, senderId: ID[autor], temImagem: true } });

// 1) Ana manda print com legenda -> fica pendente
const p1 = print('ana', 'fiz 2 gols, dei 1 assistência');
assert.match(p1.saida, /pediu/);
assert.strictEqual(Object.keys(store.data.pendentes).length, 1);

// 2) Não-admin não confirma
assert.match(fala('bia', '/ok').saida, /Só admin/);

// 3) Admin confirma (único pendente, sem citar)
assert.match(fala('admin', '/ok').saida, /registrado/);
assert.strictEqual(Object.keys(store.data.pendentes).length, 0);
assert.strictEqual(Object.values(store.data.registros).length, 1);

// 4) Bia escreve ANTES de mandar o print -> bot pede o print
assert.match(fala('bia', 'fiz 1 gol').saida, /print/);
const p2 = print('bia'); // print sem texto: usa o pedido que estava esperando
assert.match(p2.saida, /pediu/);
assert.match(fala('admin', '/ok', citando(p2, 'bia')).saida, /registrado/);

// 5) Print DEPOIS do texto? Aqui é o contrário: print primeiro, texto depois
const p3 = print('davi');
assert.strictEqual(p3.saida, '');
assert.match(fala('davi', 'fiz dois gols e dei três assistências').saida, /pediu/);
assert.match(fala('admin', '/ok', citando(p3, 'davi')).saida, /registrado/);

// 6) /reg sem print citado NÃO vale
assert.match(fala('admin', '/reg @caio 3 gols', { mentions: [ID.caio] }).saida, /Só vale com print/);

// 7) /reg citando print de outra pessoa, marcando o jogador
const p4 = print('ana');
const r = fala('admin', '/reg @caio 3 gols 0 assistências', { mentions: [ID.caio], ...citando(p4, 'ana') });
assert.match(r.saida, /registrado/);
assert.match(r.saida, /print enviado por Ana/);

// 8) mesmo print não conta duas vezes
assert.match(fala('admin', '/reg @ana 5 gols', { mentions: [ID.ana], ...citando(p4, 'ana') }).saida, /já foi contado/);
assert.match(fala('admin', '/reg @ana 5 gols', { mentions: [ID.ana], ...citando(p1, 'ana') }).saida, /já foi contado/);

// 9) /desfazer libera o print pra ser registrado de novo
assert.match(fala('bia', '/desfazer 1').saida, /Só admin/);
assert.match(fala('admin', '/desfazer 1').saida, /desfeito/);
assert.match(fala('admin', '/reg @ana 4 gols 2 assistências', { mentions: [ID.ana], ...citando(p1, 'ana') }).saida, /registrado/);

// 10) número absurdo
assert.match(fala('caio', 'fiz 99 gols').saida, /parece errado/);

// 11) conversa normal não dispara nada
assert.strictEqual(fala('caio', 'bora jogar mais tarde?').saida, '');

// 12) consultas
assert.strictEqual(fala('ana', '/lista').saida, '', '/lista é de outro bot: ignorar');
const lista = fala('ana', '/listagols').saida;
assert.match(lista, /Lista geral/);
fala('ana', '/artilheiros');
fala('ana', '/assistentes');
fala('ana', '/pendentes');

const tot = bot.contagem.totais(CHAT);
assert.strictEqual(tot.get(ID.ana).gols, 4);
assert.strictEqual(tot.get(ID.ana).assist, 2);
assert.strictEqual(tot.get(ID.ana).jogos, 1);     // o registro #1 foi desfeito
assert.strictEqual(tot.get(ID.caio).gols, 3);
assert.strictEqual(tot.get(ID.davi).assist, 3);
assert.strictEqual(tot.get(ID.bia).gols, 1);

// 13) dados persistem (grava e recarrega)
store.salvarAgora();
store = new Store(arquivo);
bot = new Bot(store);
assert.strictEqual(bot.contagem.totais(CHAT).get(ID.caio).gols, 3);
assert.strictEqual(Object.values(store.data.registros).length, 5);

// ---------- 14) adição manual (/add), sem print ----------
const { lerManual } = require('../src/contagem');
assert.deepStrictEqual(lerManual('@5511911111111 3 gols 2 assistências'), { gols: 3, assist: 2, jogos: 0 });
assert.deepStrictEqual(lerManual('1 gol 2 assistências 4 jogos'), { gols: 1, assist: 2, jogos: 4 });
assert.deepStrictEqual(lerManual('5 jogos'), { gols: 0, assist: 0, jogos: 5 });
assert.strictEqual(lerManual('oi'), null);
assert.strictEqual(lerManual('999 gols').invalido, true);

assert.match(fala('ana', '/add @caio 2 gols', { mentions: [ID.caio] }).saida, /Só admin/);
// um jogador, uma menção (ids de teste não são numéricos)
const a1 = fala('admin', '/add @caio 2 gols 1 assistência', { mentions: [ID.caio] });
assert.match(a1.saida, /Adicionado manualmente/);
assert.match(a1.saida, /\+2 gols/);
let t = bot.contagem.totais(CHAT).get(ID.caio);
assert.deepStrictEqual([t.jogos, t.gols, t.assist], [1, 5, 1]); // não conta partida extra
// vários jogadores, uma linha cada, com jogos
const X = '5511911111111@s.whatsapp.net';
const Y = '5511922222222@s.whatsapp.net';
const a2 = fala('admin', '/add @5511911111111 3 gols\n@5511922222222 1 gol 2 assistências 4 jogos', { mentions: [X, Y] });
assert.match(a2.saida, /\+3 gols/);
assert.match(a2.saida, /\+4 jogos/);
assert.deepStrictEqual(ultimas[0].mentions, [X, Y]);
t = bot.contagem.totais(CHAT).get(Y);
assert.deepStrictEqual([t.jogos, t.gols, t.assist], [4, 1, 2]);
const a3 = fala('admin', '/add @5511911111111 1 gol @5511922222222 2 gols', { mentions: [X, Y] });
assert.match(a3.saida, /#9[\s\S]*#10/);
// erros
assert.match(fala('admin', '/add 3 gols').saida, /Marque o jogador/);
assert.match(fala('admin', '/add @caio oi', { mentions: [ID.caio] }).saida, /Não entendi/);
// desfazer uma adição manual
const idManual = Object.values(store.data.registros).find((r) => r.manual && r.jogador === ID.caio).id;
assert.match(fala('admin', `/desfazer ${idManual}`).saida, /Adição manual removida/);
t = bot.contagem.totais(CHAT).get(ID.caio);
assert.deepStrictEqual([t.jogos, t.gols, t.assist], [1, 3, 0]);
fala('ana', '/listagols');

console.log('\n✅ CONTAGEM: TODOS OS TESTES PASSARAM');
