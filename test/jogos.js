// Jogos: Quiz de futebol, Cidade Dorme e Adivinha o Lugar. Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');
const { PERGUNTAS } = require('../src/quiz_dados');
const { LUGARES } = require('../src/lugares_dados');
const { bate } = require('../src/jogos');

const CHAT = 'grupo@g.us';
const id = (n) => `55119000000${String(n).padStart(2, '0')}@s.whatsapp.net`;
const ADMIN = 'admin@s.whatsapp.net';

function novo() {
  let seed = 7;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const store = new Store(null);
  const bot = new Bot(store, { rng });
  const timers = [];
  bot.jogos.agendar = (ms, fn) => timers.push({ ms, fn });
  const diz = (quem, texto, extra = {}) => {
    const rs = bot.handle({ chatId: CHAT, senderId: quem, senderName: quem.split('@')[0], text: texto, isAdmin: quem === ADMIN, ...extra });
    return rs;
  };
  const txt = (rs) => rs.map((r) => r.text).join('\n---\n');
  const dms = (rs) => rs.filter((r) => r.privadoPara);
  const g = () => bot.jogos.get(CHAT);
  // jogador manda comando no privado
  const priv = (quem, texto) => bot.privado({ tentativas: [{ chatId: CHAT, formas: [quem] }], text: texto });
  const vencerUltimo = () => { const t = timers[timers.length - 1]; return bot.jogos.vencer(CHAT, g() && g().token); };
  return { bot, store, diz, txt, dms, g, priv, timers, vencerUltimo };
}

// ---------- comparação de respostas ----------
assert.ok(bate('Acho que é o Pelé', ['Pelé', 'Pele']));
assert.ok(bate('neymar', ['Neymar']));
assert.ok(bate('mesi', ['Messi']), 'erro de 1 letra em palavra longa vale');
assert.ok(!bate('maradona', ['Messi']));
assert.ok(!bate('eu acho que talvez seja aquele jogador argentino que ganhou a copa de 2022 com a seleção', ['Messi']), 'texto longo não conta');
assert.ok(bate('praia', ['Praia']) && !bate('praiano', ['Praia'], { fuzzy: false }));

// ---------- dados ----------
assert.ok(PERGUNTAS.length >= 50 && LUGARES.length >= 50);
for (const q of PERGUNTAS) assert.ok(q.p && q.r.length >= 1, q.p);

// ---------- 1) QUIZ ----------
{
  const h = novo();
  let rs = h.diz(id(1), '/quiz 3');
  assert.match(h.txt(rs), /Só admin/);
  rs = h.diz(ADMIN, '/quiz 3');
  assert.ok(rs[0].todos, 'o início marca todo mundo');
  assert.match(rs[0].text, /Pessoal, vai começar o \*Quiz de Futebol\*/);
  assert.match(rs[1].text, /Pergunta 1\/3/);
  assert.match(h.txt(h.diz(ADMIN, '/quiz')), /Já tem/);
  for (let i = 0; i < 3; i++) {
    const q = PERGUNTAS[h.g().ordem[h.g().i]];
    assert.strictEqual(h.diz(id(2), 'sei lá').length, 0); // errado: silêncio
    const quem = i === 1 ? id(3) : id(2);
    rs = h.diz(quem, q.r[0]);
    assert.match(rs[0].text, /acertou/);
  }
  assert.strictEqual(h.g(), null, 'acabou');
  assert.match(h.txt(rs), /FIM DO QUIZ/);
  assert.match(h.txt(rs), /venceu/);
}
// quiz: tempo esgotado e pular
{
  const h = novo();
  h.diz(ADMIN, '/quiz 3');
  const rs = h.vencerUltimo();
  assert.match(h.txt(rs), /Acabou o tempo/);
  assert.match(h.txt(rs), /Pergunta 2\/3/);
  const rs2 = h.diz(ADMIN, '/pular');
  assert.match(h.txt(rs2), /Pergunta 3\/3/);
  h.diz(ADMIN, '/cancelarjogo');
  assert.strictEqual(h.g(), null);
}

// ---------- 2) CIDADE DORME ----------
{
  const h = novo();
  let rs = h.diz(ADMIN, '/cidadedorme');
  assert.ok(rs[0].todos && /Pessoal, vai começar a \*Cidade Dorme\*/.test(rs[0].text));
  for (let i = 1; i <= 4; i++) h.diz(id(i), 'eu');
  assert.match(h.txt(h.diz(ADMIN, '/iniciarjogo')), /pelo menos 5/);
  h.diz(id(5), '/entrar');
  assert.match(h.txt(h.diz(id(5), 'eu')), /já está dentro/);
  rs = h.diz(ADMIN, '/iniciarjogo');
  assert.strictEqual(h.dms(rs).filter((r) => /Você é/.test(r.text)).length, 5, 'cada um recebe o papel no privado');
  const papeis = h.g().jogadores.map((p) => p.papel);
  assert.strictEqual(papeis.filter((p) => p === 'assassino').length, 1);
  assert.ok(papeis.includes('detetive') && papeis.includes('medico'));
  assert.ok(!rs.filter((r) => !r.privadoPara).some((r) => /Você é/.test(r.text)), 'o papel de cada um não aparece no grupo');
  assert.strictEqual(h.g().fase, 'noite');

  const J = h.g().jogadores;
  const ass = J.find((p) => p.papel === 'assassino');
  const med = J.find((p) => p.papel === 'medico');
  const det = J.find((p) => p.papel === 'detetive');
  const cid = J.filter((p) => p.papel === 'cidadao');
  const num = (p) => J.indexOf(p) + 1;

  // quem não pode, não faz
  assert.match(h.dms(h.priv(cid[0].id, `/matar ${num(cid[1])}`))[0].text, /Você não pode/);
  assert.match(h.dms(h.priv(ass.id, `/matar ${num(ass)}`))[0].text, /parceiro/);
  // noite 1: assassino mata cidadão 0, médico salva o mesmo → ninguém morre
  h.priv(ass.id, `/matar ${num(cid[0])}`);
  let r = h.priv(det.id, `/investigar ${num(ass)}`);
  assert.match(r[0].text, /ASSASSINO/);
  r = h.priv(med.id, `/salvar ${num(cid[0])}`);
  assert.match(h.txt(r), /AMANHECEU/);
  assert.match(h.txt(r), /médico salvou/);
  assert.strictEqual(h.g().fase, 'dia');

  // dia: todos votam no assassino → eliminado, cidade vence
  const vivos = J.filter((p) => p.vivo);
  let ultimo;
  for (const p of vivos) {
    if (p === ass) { ultimo = h.diz(p.id, `/votar ${num(med)}`); continue; }
    ultimo = h.diz(p.id, `/votar ${num(ass)}`);
  }
  assert.match(h.txt(ultimo), /A CIDADE VENCEU/);
  assert.strictEqual(h.g(), null);
}
// cidade dorme: assassinos vencem; fora do jogo não dá pra votar; /apurar do admin
{
  const h = novo();
  h.diz(ADMIN, '/cidadedorme');
  for (let i = 1; i <= 5; i++) h.diz(id(i), 'eu');
  h.diz(ADMIN, '/iniciarjogo');
  const g = h.g();
  const ass = g.jogadores.find((p) => p.papel === 'assassino');
  const outros = () => g.jogadores.filter((p) => p.vivo && p !== ass);
  const num = (p) => g.jogadores.indexOf(p) + 1;
  assert.ok(!/Agora não tem votação|Você não está nesse jogo/.test(h.txt(h.diz(id(9), '/votar 1'))), '/votar fora da votação fica com o Puskas');
  // noite 1 sem salvar: mata quem não é médico/detetive (se houver) senão qualquer um
  for (let rodada = 0; rodada < 4 && h.g(); rodada++) {
    if (g.fase === 'noite') {
      const alvo = outros().find((p) => p.papel === 'cidadao') || outros()[0];
      h.priv(ass.id, `/matar ${num(alvo)}`);
      // força o fim da noite pelo prazo (médico/detetive vivos não agiram)
      if (h.g() && g.fase === 'noite') h.bot.jogos.vencer(CHAT, g.token);
    }
    if (h.g() && g.fase === 'dia') {
      assert.match(h.txt(h.diz(ADMIN, '/apurar')), /Ninguém votou/);
    }
  }
  assert.strictEqual(h.g(), null, 'terminou com vitória dos assassinos');
}
// cidade dorme: prazo da noite avança sozinho e o estado sobrevive ao reinício (rearmar)
{
  const h = novo();
  h.diz(ADMIN, '/cidadedorme');
  for (let i = 1; i <= 5; i++) h.diz(id(i), 'eu');
  h.diz(ADMIN, '/iniciarjogo');
  const antes = h.timers.length;
  h.bot.jogos.rearmar();
  assert.ok(h.timers.length > antes, 'rearmar agenda de novo');
  const rs = h.timers[h.timers.length - 1].fn();
  assert.match(h.txt(rs), /AMANHECEU/);
}

// ---------- 3) ADIVINHA O LUGAR ----------
{
  const h = novo();
  let rs = h.diz(ADMIN, '/lugares');
  assert.ok(rs[0].todos && /Pessoal, vai começar o \*Adivinha o Lugar\*/.test(rs[0].text));
  h.diz(id(1), 'eu'); h.diz(id(2), 'eu');
  assert.match(h.txt(h.diz(ADMIN, '/iniciarjogo')), /pelo menos 3/);
  h.diz(id(3), 'eu');
  rs = h.diz(ADMIN, '/iniciarjogo');
  const privs = h.dms(rs);
  assert.ok(privs.filter((r) => /lugar secreto/.test(r.text)).length === 3);
  // o grupo nunca vê o nome dos lugares
  const g = h.g();
  const grupoTxt = rs.filter((r) => !r.privadoPara).map((r) => r.text).join('\n');
  for (const p of g.jogadores) assert.ok(!grupoTxt.includes(LUGARES[g.lugares[p.id]].nome));
  // rodada 1: o narrador descreve, outro acerta
  const rodada = () => {
    const narr = g.ordem[g.vez];
    const lugar = LUGARES[g.lugares[narr]];
    const outro = g.ordem.find((x) => x !== narr);
    return { narr, lugar, outro };
  };
  let { narr, lugar, outro } = rodada();
  assert.strictEqual(h.diz(narr, 'é um lugar bem movimentado, tem muita gente').length, 0);
  assert.strictEqual(h.diz(outro, 'hmm talvez a lua').length, 0);
  rs = h.diz(outro, lugar.nome);
  assert.match(rs[0].text, /acertou/);
  assert.strictEqual(g.pontos[outro], 1);
  // rodada 2: narrador escorrega e fala o nome → anulado
  ({ narr, lugar, outro } = rodada());
  rs = h.diz(narr, `é tipo ${lugar.nome} sabe`);
  assert.match(h.txt(rs), /falou o nome/);
  // rodada 3: tempo esgota → fim e ranking
  ({ narr, lugar } = rodada());
  rs = h.vencerUltimo();
  assert.match(h.txt(rs), /FIM DO ADIVINHA O LUGAR/);
  assert.match(h.txt(rs), /venceu/);
  assert.strictEqual(h.g(), null);
  // /meulugar no privado depois de acabar não responde
}
// lugares: /meulugar no privado e quem está fora não palpita
{
  const h = novo();
  h.diz(ADMIN, '/lugares');
  for (let i = 1; i <= 3; i++) h.diz(id(i), 'eu');
  h.diz(ADMIN, '/iniciarjogo');
  const g = h.g();
  const r = h.priv(id(1), '/meulugar');
  assert.match(r[0].text, new RegExp(LUGARES[g.lugares[id(1)]].nome.replace(/[()]/g, '.')));
  assert.strictEqual(h.priv(id(99), '/meulugar'), null, 'quem não joga não recebe');
  const narr = g.ordem[g.vez];
  assert.strictEqual(h.diz(id(50), LUGARES[g.lugares[narr]].nome).length, 0, 'fora do jogo não pontua');
  h.diz(ADMIN, '/cancelarjogo');
}

// ---------- ajuda ----------
{
  const h = novo();
  assert.match(h.txt(h.diz(id(1), '/ajuda')), /\/cidadedorme/);
}
console.log('\n✅ jogos: ok');
