// Simulação completa de um campeonato, sem WhatsApp. Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const CHAT = 'grupo@g.us';
const P = {
  ana: 'ana@s.whatsapp.net', bia: 'bia@s.whatsapp.net', caio: 'caio@s.whatsapp.net',
  davi: 'davi@s.whatsapp.net', edu: 'edu@s.whatsapp.net', fabi: 'fabi@s.whatsapp.net',
  admin: 'admin@s.whatsapp.net',
};
const NOMES = { ana: 'Ana', bia: 'Bia', caio: 'Caio', davi: 'Davi', edu: 'Edu', fabi: 'Fabi', admin: 'Admin' };

// rng determinístico
let seed = 42;
const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const store = new Store(null);
const bot = new Bot(store, { rng });
let ultimas = [];

function diz(quem, texto, isAdmin = false) {
  const r = bot.handle({ chatId: CHAT, senderId: P[quem], senderName: NOMES[quem], text: texto, isAdmin });
  ultimas = r;
  const t = r.map((x) => x.text).join('\n---\n');
  console.log(`\n[${NOMES[quem]}] ${texto}${t ? '\n' + t.split('\n').map((l) => '  ‹ ' + l).join('\n') : '\n  ‹ (sem resposta)'}`);
  return t;
}
const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
const rodada = () => camp().partidas.map((id) => store.data.partidas[id]);

// ---------- 1) X1, Libertadores, 4 clubes, 4 jogadores ----------
diz('ana', '/iniciar');
assert.match(ultimas[0].text, /Escolha a competição/);
diz('bia', '/libertadores');                         // não é organizadora: deve recusar
assert.match(ultimas[0].text, /Só quem iniciou/);
diz('ana', '/libertadores');
diz('ana', '/x1');
diz('ana', '/times 4');
const clubes = camp().clubes.map((c) => c.nome);
assert.strictEqual(clubes.length, 4);

// digitação com erro e sem acento
const nomeDe = (i) => clubes[i];
diz('ana', nomeDe(0).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
assert.match(ultimas[0].text, /entrou no/);
diz('ana', nomeDe(0));                               // de novo
assert.match(ultimas[0].text, /já está/);
diz('bia', nomeDe(0));                               // clube cheio (x1)
assert.match(ultimas[0].text, /completo/);
diz('bia', nomeDe(1));
diz('caio', nomeDe(2));
diz('davi', nomeDe(3));
assert.strictEqual(camp().status, 'andamento');
assert.strictEqual(rodada().length, 2);
console.log('\n>>> Semifinais montadas');

// ---------- Semifinal 1: disputa do "cria" ----------
const s1 = rodada()[0];
const idsS1 = [...s1.timeA.jogadores, ...s1.timeB.jogadores];
const [j1, j2] = idsS1.map((id) => Object.keys(P).find((k) => P[k] === id));
diz(j1, 'cria');
assert.match(ultimas[0].text, /mandou primeiro/);
diz(j2, 'cria');                                     // chegou depois: ignorado
assert.match(ultimas[0].text, /já pediu primeiro/);
diz(j1, '/sala 1111');                               // quem pediu NÃO cria a sala
assert.match(ultimas[0].text, /Quem cria a sala é o/);
diz(j2, '/sala 2222');
assert.match(ultimas[0].text, /Código: 2222/);
diz(j1, '/placar 2x2');                              // empate sem pênaltis
assert.match(ultimas[0].text, /pênaltis/);
diz(j1, '/placar 3x1');
diz(j1, '/confirmar');                               // quem reportou não confirma
assert.match(ultimas[0].text, /time adversário/);
diz(j2, '/placar 1x2');                              // disputa: j2 informa o MESMO resultado visto de outro lado
diz(j1, '/confirmar');
assert.strictEqual(s1.estado, 'finalizada');
assert.strictEqual(s1.vencedor, store.data.partidas[s1.id].vencedor);
diz(j1, '/gols 3');
diz(j1, '/assist 0');
diz(j2, '/gols 1');

// ---------- Semifinal 2: pênaltis + /forcar ----------
const s2 = rodada()[1];
const [k1, k2] = [...s2.timeA.jogadores, ...s2.timeB.jogadores].map((id) => Object.keys(P).find((k) => P[k] === id));
diz(k2, 'cria');
const criador = s2.criador;
const quemCria = s2.timeA.clube === criador ? s2.timeA.jogadores[0] : s2.timeB.jogadores[0];
diz(Object.keys(P).find((k) => P[k] === quemCria), '/sala ABC');
diz(k1, '/placar 2x2 pen 5x4');
diz('admin', '/forcar', true);
assert.strictEqual(s2.estado, 'finalizada');
diz(k1, '/gols 2');
diz(k1, '/assist 1');

// ---------- Final ----------
assert.strictEqual(camp().nomeRodada, 'Final');
const fin = rodada()[0];
const [f1, f2] = [...fin.timeA.jogadores, ...fin.timeB.jogadores].map((id) => Object.keys(P).find((k) => P[k] === id));
diz(f1, 'cria');
const criadorF = fin.criador;
const cr = fin.timeA.clube === criadorF ? fin.timeA.jogadores[0] : fin.timeB.jogadores[0];
diz(Object.keys(P).find((k) => P[k] === cr), '/sala FINAL');
diz(f2, '/placar 4x0');
diz(f1, '/confirmar');
assert.match(ultimas.map((x) => x.text).join('\n'), /CAMPEÃO/);
assert.strictEqual(store.data.ativos[CHAT], undefined);
diz(f2, '/gols 4');

// ---------- Rankings ----------
diz('ana', '/ranking');
diz('ana', '/trofeus');
diz('ana', '/artilharia');
diz('ana', '/assistencias');
diz('ana', '/derrotas');
diz('ana', '/perfil');
assert.match(ultimas[0].text, /ELO/);
assert.match(store.data.campeonatos[1].campeao, /./);

// ---------- 2) X2 com 3 clubes (folga) e /comecar ----------
diz('ana', '/iniciar champions x2');
diz('ana', '/times 3');
const cl2 = camp().clubes.map((c) => c.nome);
const dupla = (a, b, i) => { diz(a, cl2[i]); diz(b, cl2[i]); };
dupla('ana', 'bia', 0);
dupla('caio', 'davi', 1);
diz('edu', cl2[2]);                                  // clube 3 incompleto (1/2)
diz('ana', '/status');
diz('admin', '/comecar', true);
assert.strictEqual(camp().status, 'andamento');
assert.strictEqual(camp().clubes.length, 2);         // só os completos
diz('ana', '/cancelar', true);
assert.strictEqual(store.data.ativos[CHAT], undefined);

// ---------- 3) X3 com bye ----------
diz('ana', '/iniciar libertadores x3');
diz('ana', '/times 3');
const cl3 = camp().clubes.map((c) => c.nome);
['ana', 'bia', 'caio'].forEach((q) => diz(q, cl3[0]));
['davi', 'edu', 'fabi'].forEach((q) => diz(q, cl3[1]));
diz('admin', '/comecar', true);
assert.strictEqual(rodada().length, 1);
assert.strictEqual(camp().nomeRodada, 'Final');

// duplas / trios
diz('ana', '/trios');
diz('ana', '/duplas');

console.log('\n✅ TODOS OS TESTES PASSARAM');
