// Castigo (tirar o admin por 24h e bloquear promoção). Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');
const { criarVigia } = require('../src/castigo_wa');

const CHAT = 'grupo@g.us';
const ADM = 'admin@s.whatsapp.net';
const X = '5511911110000@s.whatsapp.net';
const Y = '5511922220000@s.whatsapp.net';
const DONO = '5511900000000@s.whatsapp.net';

let agora = new Date('2026-11-18T19:00:00-03:00').getTime();
const store = new Store(null);
const bot = new Bot(store, { agora: () => agora });
const vigia = criarVigia({ bot, store });

function grupoFalso(participantes) {
  const g = {
    participants: participantes, chamadas: [], msgs: [], falhaDemote: false,
    user: { id: '5545998353958:7@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: g.participants }),
    groupParticipantsUpdate: async (jid, ids, acao) => {
      if (g.falhaDemote) throw new Error('not-authorized');
      g.chamadas.push({ jid, ids, acao });
      if (acao === 'demote') ids.forEach((id) => { g.participants.find((p) => p.id === id).admin = null; });
    },
    sendMessage: async (jid, m) => { g.msgs.push(m); return { key: { id: `m${g.msgs.length}` } }; },
  };
  return g;
}
const promover = (g, id) => { g.participants.find((p) => p.id === id).admin = 'admin'; };
const ultima = (g) => g.msgs[g.msgs.length - 1]?.text || '';

async function diz(g, quem, texto, mentions = [], isAdmin = false) {
  const r = bot.handle({ chatId: CHAT, senderId: quem, senderName: 'x', text: texto, isAdmin, mentions });
  const textos = [];
  for (const it of r) {
    if (it.castigo) await vigia.aplicarCastigo(g, CHAT, it.castigo);
    else textos.push(it.text);
  }
  const t = [...textos, ...(r.some((i) => i.castigo) ? [ultima(g)] : [])].join('\n---\n');
  console.log(`\n[${quem.split('@')[0]}] ${texto}\n${t.split('\n').map((l) => '  ‹ ' + l).join('\n')}`);
  return t;
}

(async () => {
  const g = grupoFalso([
    { id: DONO, admin: 'superadmin' },
    { id: ADM, admin: 'admin' },
    { id: X, admin: 'admin' },
    { id: Y, admin: null },
  ]);

  // ---------- permissões e uso ----------
  assert.match(await diz(g, Y, '/castigo @5511911110000', [X]), /Só admin/);
  assert.match(await diz(g, ADM, '/castigo', [], true), /Marque a pessoa/);

  // ---------- aplica: tira o admin e avisa ----------
  let t = await diz(g, ADM, '/castigo @5511911110000', [X], true);
  assert.match(t, /CASTIGO!.*perdeu o admin por 24h/);
  assert.match(t, /nem manualmente, nem por outro bot/);
  assert.deepStrictEqual(g.chamadas, [{ jid: CHAT, ids: [X], acao: 'demote' }]);
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, null);
  assert.deepStrictEqual(g.msgs[g.msgs.length - 1].mentions, [X]);
  assert.match(await diz(g, Y, '/castigos'), /faltam 24h00/);

  // ---------- alguém promove de novo: o bot tira na hora ----------
  promover(g, X);
  await vigia.varrerCastigos(g, CHAT);
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, null);
  assert.match(ultima(g), /está de castigo até .* não pode ser admin\. Tirei o admin de novo/);
  assert.strictEqual(g.chamadas.length, 2);
  // sem promoção nenhuma, a varredura não faz nada
  await vigia.varrerTodos(g);
  assert.strictEqual(g.chamadas.length, 2);
  // outros admins não são tocados
  assert.strictEqual(g.participants.find((p) => p.id === ADM).admin, 'admin');

  // ---------- promoção por outro bot, de novo e de novo ----------
  for (let i = 0; i < 3; i++) { promover(g, X); await vigia.varrerCastigos(g, CHAT); }
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, null);

  // ---------- a pessoa aparece com outro tipo de id (LID) ----------
  const L = '98765432101234@lid';
  const g2 = grupoFalso([{ id: DONO, admin: 'superadmin' }, { id: L, jid: Y, admin: 'admin' }, { id: ADM, admin: 'admin' }]);
  await diz(g2, ADM, '/castigo @5511922220000', [Y], true); // marcado pelo número, o grupo conhece como LID
  assert.strictEqual(g2.participants.find((p) => p.id === L).admin, null);
  promover(g2, L);
  await vigia.varrerCastigos(g2, CHAT);
  assert.strictEqual(g2.participants.find((p) => p.id === L).admin, null);
  await diz(g2, ADM, '/perdoar @5511922220000', [Y], true);

  // ---------- dona do grupo, quem não existe, bot sem poder ----------
  const antes = Object.keys(store.data.castigos).length;
  assert.match(await diz(g, ADM, '/castigo @5511900000000', [DONO], true), /dona \(criadora\)/);
  assert.match(await diz(g, ADM, '/castigo @5511900099999', ['5511900099999@s.whatsapp.net'], true), /Não achei essa pessoa/);
  g.falhaDemote = true;
  promover(g, ADM);
  assert.match(await diz(g, DONO, '/castigo @admin', [ADM], true), /Não consegui tirar o admin/);
  g.falhaDemote = false;
  assert.strictEqual(Object.keys(store.data.castigos).length, antes, 'castigo que não deu certo não fica registrado');

  // ---------- perdoar ----------
  assert.match(await diz(g, ADM, '/perdoar @5511922220000', [Y], true), /não está de castigo/);
  assert.match(await diz(g, Y, '/perdoar @5511911110000', [X]), /Só admin/);
  assert.match(await diz(g, ADM, '/perdoar @5511911110000', [X], true), /foi perdoado/);
  promover(g, X);
  await vigia.varrerCastigos(g, CHAT);
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, 'admin', 'perdoado pode ser admin');
  assert.match(await diz(g, Y, '/castigos'), /Ninguém está de castigo/);

  // ---------- 24 horas depois o castigo acaba sozinho ----------
  g.participants.find((p) => p.id === X).admin = null;
  await diz(g, ADM, '/castigo @5511911110000', [X], true);
  agora += 23 * 3_600_000;
  promover(g, X);
  await vigia.varrerCastigos(g, CHAT);
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, null, 'com 23h ainda vale');
  assert.match(await diz(g, Y, '/castigos'), /faltam 1h00/);
  agora += 2 * 3_600_000;
  promover(g, X);
  await vigia.varrerCastigos(g, CHAT);
  assert.strictEqual(g.participants.find((p) => p.id === X).admin, 'admin', 'passou de 24h: pode ser admin de novo');
  assert.match(await diz(g, Y, '/castigos'), /Ninguém está de castigo/);

  // ---------- fica salvo (sobrevive a reinício) ----------
  g.participants.find((p) => p.id === X).admin = null;
  await diz(g, ADM, '/castigo @5511911110000', [X], true);
  const salvo = JSON.parse(JSON.stringify(store.data));
  const bot2 = new Bot(Object.assign(new Store(null), { data: salvo }), { agora: () => agora });
  assert.ok(bot2.castigo.daPessoa(CHAT, [X]), 'castigo continua depois de reiniciar');

  console.log('\n✅ CASTIGO: TODOS OS TESTES PASSARAM');
})().catch((e) => { console.error(e); process.exit(1); });
