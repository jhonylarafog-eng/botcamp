// Testa a Bola de Ouro (votação top 3 com pontos 5-3-1). Rode com: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const CHAT = 'grupo@g.us';
const J = (n) => `55119000000${n}@s.whatsapp.net`;
const P = { ana: J(11), bia: J(12), caio: J(13), davi: J(14), edu: J(15), fabi: J(16), admin: J(99) };
const NOME = { ana: 'Ana', bia: 'Bia', caio: 'Caio', davi: 'Davi', edu: 'Edu', fabi: 'Fabi', admin: 'Admin' };

const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bot-')), 'dados.json');
let store = new Store(arquivo);
let bot = new Bot(store);

function fala(quem, text, extra = {}) {
  const r = bot.handle({
    chatId: CHAT, senderId: P[quem], senderName: NOME[quem], text, isAdmin: quem === 'admin',
    id: 'M' + Math.random(), temImagem: false, mentions: [], quoted: null, ...extra,
  });
  const saida = r.map((x) => x.text).join('\n---\n');
  console.log(`\n[${NOME[quem]}] ${text}${saida ? '\n' + saida.split('\n').map((l) => '  ‹ ' + l).join('\n') : '\n  ‹ (sem resposta)'}`);
  return { saida, r };
}
// voto com menções, como o WhatsApp manda: texto "@número" + lista de jids
const vota = (quem, ...alvos) =>
  fala(quem, '/votar ' + alvos.map((a) => '@' + P[a].split('@')[0]).join(' '), { mentions: alvos.map((a) => P[a]) });

// todo mundo fala uma vez (o bot guarda os nomes)
for (const q of ['ana', 'bia', 'caio', 'davi', 'edu']) fala(q, 'oi');

// registros de partidas (como se o admin tivesse confirmado prints)
let rid = 0;
const reg = (quem, gols, assist) => {
  store.data.registros[++rid] = { id: rid, chatId: CHAT, jogador: P[quem], gols, assist, printId: 'p' + rid, por: P.admin, em: 1 };
};
reg('ana', 3, 1); reg('bia', 2, 2); reg('caio', 1, 0); reg('davi', 0, 3); reg('edu', 4, 0);
// fabi NÃO tem partida registrada -> não é candidato nem vota

// ---------- abrir ----------
assert.match(fala('ana', '/bolaouro Temporada 1').saida, /Só admin/);
assert.match(fala('admin', '/bolaouro Temporada 1').saida, /Votação aberta/);
assert.match(fala('admin', '/bolaouro').saida, /Já tem uma votação aberta/);
assert.match(fala('ana', '/votar').saida, /Escolha exatamente \*3\*/); // 5 candidatos -> top 3

// ---------- regras de voto ----------
assert.match(fala('fabi', '/votar @x', { mentions: [P.ana] }).saida, /Só vota quem já tem partida/);
assert.match(vota('ana', 'ana', 'bia', 'caio').saida, /Não vale votar em você/);
assert.match(vota('ana', 'bia', 'bia', 'caio').saida, /repita/);
assert.match(vota('ana', 'bia', 'caio', 'fabi').saida, /não está na lista/);
assert.match(vota('ana', 'bia', 'caio').saida, /exatamente/);

// ---------- votos válidos ----------
// Ana: Edu 5, Bia 3, Davi 1
assert.match(vota('ana', 'edu', 'bia', 'davi').saida, /Ana\* votou/);
// Bia: Edu 5, Ana 3, Caio 1
vota('bia', 'edu', 'ana', 'caio');
// Caio: pelos NOMES: Bia 5, Edu 3, Ana 1
assert.match(fala('caio', '/votar bia, edu e ana').saida, /Caio\* votou/);
// Davi: Ana 5, Edu 3, Bia 1
vota('davi', 'ana', 'edu', 'bia');
// Edu: Ana 5, Bia 3, Davi 1 ; depois muda o voto
vota('edu', 'ana', 'bia', 'davi');
assert.match(vota('edu', 'ana', 'davi', 'bia').saida, /mudou o voto/);

assert.match(fala('ana', '/votos').saida, /5\/5 votaram/);

// ---------- encerrar ----------
assert.match(fala('bia', '/encerrar').saida, /Só admin/);
const fim = fala('admin', '/encerrar');
assert.match(fim.saida, /BOLA DE OURO/);
// pontos esperados:
// Ana: Bia3 + Davi5 + Edu5 = 13 ; Edu: 5+5+3+3 = 16 ; Bia: 3+5+1+3? calculado abaixo
const v = Object.values(store.data.votacoes)[0];
const pts = Object.fromEntries(v.resultado.map((t) => [t.id, t.pts]));
assert.strictEqual(pts[P.edu], 5 + 5 + 3 + 3 /* ana, bia, caio, davi */ - 0);
assert.strictEqual(v.resultado[0].id, P.edu);
assert.deepStrictEqual(fim.r[0].mentions, [P.edu]);
assert.strictEqual(v.status, 'encerrada');
assert.match(fala('ana', '/votar @1 @2 @3').saida, /Não tem votação aberta/);

// ---------- hall e nova votação ----------
assert.match(fala('ana', '/hall').saida, /Temporada 1/);
assert.match(fala('admin', '/bolaouro Temporada 2').saida, /Temporada 2/);
assert.match(fala('admin', '/cancelarvotacao').saida, /cancelada/);

// ---------- persistência ----------
store.salvarAgora();
store = new Store(arquivo);
bot = new Bot(store);
assert.match(fala('ana', '/hall').saida, /Temporada 1/);

console.log('\n✅ BOLA DE OURO: TODOS OS TESTES PASSARAM');
