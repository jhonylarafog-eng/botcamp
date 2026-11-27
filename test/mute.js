// Mute: /mutar, /desmutar, /mutados. Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const CHAT = 'grupo@g.us';
const OUTRO = 'outro@g.us';
const id = (n) => `55119000000${String(n).padStart(2, '0')}@s.whatsapp.net`;
const ADM1 = id(1); const ADM2 = id(2); const MEMBRO = id(3); const DONO = '5511988887777@s.whatsapp.net';

function novo() {
  const store = new Store(null);
  const bot = new Bot(store, { rng: () => 0.5, protegidos: ['5511988887777'] });
  const admins = new Set([ADM1, ADM2]);
  const diz = (quem, texto, extra = {}, chatId = CHAT) =>
    bot.handle({ chatId, senderId: quem, senderName: 'x', text: texto, isAdmin: admins.has(quem), mentions: [], ...extra });
  const txt = (rs) => rs.map((r) => r.text).join('\n');
  return { store, bot, diz, txt, admins };
}

// ---------- mutar ----------
{
  const h = novo();
  assert.match(h.txt(h.diz(MEMBRO, '/mutar', { mentions: [id(4)] })), /Só admin/);
  assert.match(h.txt(h.diz(ADM1, '/mutar')), /Marque quem/);
  const rs = h.diz(ADM1, '/mutar @a', { mentions: [id(4)] });
  assert.match(h.txt(rs), /foi mutado/);
  assert.match(h.txt(rs), /mesmo sendo admin/);
  assert.deepStrictEqual(rs[0].mentions, [id(4)]);
  assert.ok(h.bot.mute.daPessoa(CHAT, [id(4)]), 'ficou mutado');
  assert.ok(!h.bot.mute.daPessoa(OUTRO, [id(4)]), 'só neste grupo');
  assert.ok(!h.bot.mute.daPessoa(CHAT, [id(5)]), 'os outros continuam livres');
  assert.match(h.txt(h.diz(ADM1, '/mutar @a', { mentions: [id(4)] })), /já estava mutado/);
  // com o 9 extra do celular, é a mesma pessoa
  assert.ok(h.bot.mute.daPessoa(CHAT, ['551100000004@s.whatsapp.net']), 'sem o 9 extra do celular é a mesma pessoa');
}
// várias pessoas de uma vez, e respondendo a uma mensagem
{
  const h = novo();
  const rs = h.diz(ADM1, '/mutar @a @b', { mentions: [id(4), id(5)] });
  assert.match(h.txt(rs), /foram mutados/);
  assert.ok(h.bot.mute.daPessoa(CHAT, [id(4)]) && h.bot.mute.daPessoa(CHAT, [id(5)]));
  const r2 = h.diz(ADM1, '/mutar', { quoted: { senderId: id(6), id: 'X' } });
  assert.match(h.txt(r2), /foi mutado/);
  assert.ok(h.bot.mute.daPessoa(CHAT, [id(6)]), 'responder a mensagem também muta');
  assert.match(h.txt(h.diz(ADM2, '/mutados')), /@5511900000004[\s\S]*@5511900000005[\s\S]*@5511900000006/);
}
// admin também pode ser mutado; não dá pra se mutar; dono é protegido
{
  const h = novo();
  assert.match(h.txt(h.diz(ADM1, '/mutar @eu', { mentions: [ADM1] })), /mutar a si mesmo/);
  assert.ok(!h.bot.mute.daPessoa(CHAT, [ADM1]));
  assert.match(h.txt(h.diz(ADM1, '/mutar @dono', { mentions: [DONO] })), /protegido/);
  assert.ok(!h.bot.mute.daPessoa(CHAT, [DONO]), 'dono não é mutado');
  assert.match(h.txt(h.diz(ADM1, '/mutar @adm2', { mentions: [ADM2] })), /foi mutado/);
  assert.ok(h.bot.mute.daPessoa(CHAT, [ADM2]), 'admin pode ser mutado');
}
// ---------- desmutar ----------
{
  const h = novo();
  h.diz(ADM1, '/mutar @a', { mentions: [id(4)] });
  assert.match(h.txt(h.diz(MEMBRO, '/desmutar @a', { mentions: [id(4)] })), /Só admin/);
  assert.ok(h.bot.mute.daPessoa(CHAT, [id(4)]), 'não-admin não libera');
  assert.match(h.txt(h.diz(ADM2, '/desmutar @b', { mentions: [id(5)] })), /não estava mutado/);
  assert.match(h.txt(h.diz(ADM2, '/desmutar @a', { mentions: [id(4)] })), /pode falar de novo/);
  assert.ok(!h.bot.mute.daPessoa(CHAT, [id(4)]), 'liberado');
  assert.match(h.txt(h.diz(ADM2, '/mutados')), /Ninguém está mutado/);
  // versão sobe a cada mudança (o conector descarta o "não mutado" guardado)
  const v = h.bot.mute.versao;
  h.diz(ADM1, '/mutar @a', { mentions: [id(4)] });
  assert.ok(h.bot.mute.versao > v);
}
// ---------- mesma pessoa com outro id (LID x número) ----------
{
  const h = novo();
  const LID = '123456789012345@lid';
  // admin marca a pessoa pelo LID; o conector informa que o número dela é id(4)
  h.diz(ADM1, '/mutar @a', { mentions: [LID], formas: { '123456789012345': [LID, id(4)] } });
  assert.ok(h.bot.mute.daPessoa(CHAT, [id(4)]), 'reconhece pelo número');
  assert.ok(h.bot.mute.daPessoa(CHAT, [LID]), 'e pelo LID');
  // libera marcando pelo número
  h.diz(ADM2, '/desmutar @a', { mentions: [id(4)], formas: { '5511900000004': [id(4), LID] } });
  assert.ok(!h.bot.mute.daPessoa(CHAT, [LID]) && !h.bot.mute.daPessoa(CHAT, [id(4)]));
  // aprende ids novos da pessoa (pra reconhecer rápido depois)
  h.diz(ADM1, '/mutar @a', { mentions: [id(4)] });
  const reg = h.bot.mute.daPessoa(CHAT, [id(4)]);
  h.bot.mute.aprender(CHAT, reg, [id(4), LID]);
  assert.ok(h.bot.mute.daPessoa(CHAT, [LID]), 'aprendeu o LID');
}
// ---------- persistência ----------
{
  const h = novo();
  h.diz(ADM1, '/mutar @a', { mentions: [id(4)] });
  const bot2 = new Bot(h.store, { rng: () => 0.5 });
  assert.ok(bot2.mute.daPessoa(CHAT, [id(4)]), 'continua mutado depois de reiniciar');
  assert.ok(bot2.mute.temMutados(CHAT) && !bot2.mute.temMutados(OUTRO));
}
// ---------- ajuda ----------
{
  const h = novo();
  assert.match(h.txt(h.diz(MEMBRO, '/ajuda')), /\/mutar/);
}
console.log('✅ mute: ok');
