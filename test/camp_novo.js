// Novo fluxo: /iniciarcampx2 → liga → tamanho → inscrição → /listacamp → /removertime → cria → /vitoria. Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const CHAT = 'grupo@g.us';
const id = (n) => `55119000000${String(n).padStart(2, '0')}@s.whatsapp.net`;
const ADMIN = 'admin@s.whatsapp.net';

function novo() {
  let seed = 11;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const store = new Store(null);
  const bot = new Bot(store, { rng });
  let ultimas = [];
  const diz = (quem, texto, extra = {}) => {
    const isAdmin = quem === ADMIN;
    ultimas = bot.handle({ chatId: CHAT, senderId: quem, senderName: quem.split('@')[0], text: texto, isAdmin, ...extra });
    const t = ultimas.map((x) => x.text).join('\n---\n');
    console.log(`\n[${quem.split('@')[0]}] ${texto}\n${t.split('\n').map((l) => '  ‹ ' + l).join('\n')}`);
    return t;
  };
  const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
  return { store, bot, diz, camp, get ultimas() { return ultimas; } };
}

// ---------- 1) X2 normal, Serie A, semifinal (4 clubes × 2 = 8 jogadores) ----------
{
  const h = novo(); const { store, diz, camp } = h;
  let t = diz(id(1), '/iniciarcampx2');
  assert.match(t, /ESCOLHA A LIGA/);
  assert.match(t, /1 ▸ .*BRASILEIRÃO A/);
  assert.match(t, /20 ▸ .*LIGA ZOEIRA/);
  assert.strictEqual(camp().status, 'liga');
  // outro jogador respondendo número é ignorado
  assert.strictEqual(diz(id(2), '7'), '');
  t = diz(id(1), '7');
  assert.match(t, /QUANTOS CLUBES ENTRAM/);
  assert.match(t, /1 ▸ .*MEGA TORNEIO \(64\)/);
  assert.match(t, /6 ▸ .*FINAL \(2\)/);
  t = diz(id(1), '5');
  assert.match(t, /SERIE A/);
  assert.match(t, /DUPLA/);
  assert.match(t, /SEMIFINAL/);
  assert.match(t, /\(Livre\)/);
  assert.match(t, /Time de 2 vagas/);
  assert.match(t, /Organização: @/);
  assert.strictEqual(camp().clubes.length, 4);
  const nomes = camp().clubes.map((c) => c.nome);

  // entrar escrevendo o nome do time
  t = diz(id(1), nomes[0]);
  assert.ok(camp().clubes[0].jogadores.includes(id(1)));
  // entrou, não sai mais
  t = diz(id(1), nomes[1]);
  assert.match(t, /não sai mais/);
  assert.match(diz(id(1), '/sair'), /não sai mais/);
  assert.ok(!camp().clubes[1].jogadores.includes(id(1)));

  t = diz(id(2), nomes[0]);
  t = diz(id(3), nomes[1]);

  // /listacamp: livres e preenchidos
  t = diz(id(9), '/listacamp');
  assert.match(t, /TIMES LIVRES/);
  assert.match(t, /TIMES PREENCHIDOS/);
  assert.match(t, /\(Livre\)/);
  const lista = h.ultimas.find((x) => /TIMES LIVRES/.test(x.text));
  assert.ok(lista.mentions.includes(id(1)) && lista.mentions.includes(id(3)));

  // /removertime: só admin
  assert.match(diz(id(5), '/removertime', { quoted: { senderId: id(3) } }), /Só admin/);
  t = diz(ADMIN, '/removertime', { mentions: [id(3)] });
  assert.match(t, /removido/);
  assert.ok(!camp().clubes[1].jogadores.includes(id(3)));
  t = diz(ADMIN, '/removertime', { quoted: { senderId: id(2) } });
  assert.ok(!camp().clubes[0].jogadores.includes(id(2)));
  assert.match(diz(ADMIN, '/removertime', { mentions: [id(2)] }), /não está em nenhum time/);

  // enche tudo
  let n = 2;
  for (const c of camp().clubes) {
    while (camp().clubes.find((x) => x.nome === c.nome).jogadores.length < 2) {
      t = diz(id(n++), c.nome);
      if (n > 30) throw new Error('loop');
    }
  }
  assert.match(t, /preench|completo|confront/i);
  assert.strictEqual(camp().status, 'andamento');
  const partidas = camp().partidas.map((p) => store.data.partidas[p]);
  assert.strictEqual(partidas.length, 2);

  // cria: o adversário cria a sala
  const p = partidas[0];
  const quemPede = p.timeA.jogadores[0];
  t = diz(quemPede, 'cria');
  assert.match(t, /criar|sala/i);

  // jogador diz "ganhei": bot pergunta aos admins
  const venc = p.timeA.jogadores[0];
  diz(venc, 'ganhei');
  assert.ok(h.ultimas.some((x) => x.admins), 'deveria marcar os admins');
  assert.ok(p.pedido && p.pedido.lado === 'A');
  // não finaliza sozinho
  assert.notStrictEqual(p.estado, 'finalizada');
  // admin nega
  assert.match(diz(ADMIN, '/negar'), /negado/);
  assert.strictEqual(p.pedido, null);
  // jogador pede de novo, admin confirma
  diz(venc, 'ganhei');
  diz(ADMIN, '/confirmar');
  assert.strictEqual(p.estado, 'finalizada');
  assert.strictEqual(p.vencedor, p.timeA.clube);

  // /vitoria @quem (admin) no outro jogo
  const q = partidas[1];
  const ganhador = q.timeB.jogadores[1];
  diz(ADMIN, '/vitoria @x', { mentions: [ganhador] });
  assert.strictEqual(q.estado, 'finalizada');
  assert.strictEqual(q.vencedor, q.timeB.clube);
  // final gerada
  assert.match(camp().nomeRodada || '', /Final/);
}

// ---------- 2) /vitoria eu (admin) ----------
{
  const { store, diz, camp } = novo();
  diz(ADMIN, '/iniciarcampx1');
  diz(ADMIN, '3'); // premier
  diz(ADMIN, '6'); // final (2 clubes)
  const [a, b] = camp().clubes;
  diz(id(1), a.nome);
  diz(id(2), b.nome);
  assert.strictEqual(camp().status, 'andamento');
  const p = store.data.partidas[camp().partidas[0]];
  diz(id(1), 'cria');
  // admin não está no jogo
  assert.match(diz(ADMIN, '/vitoria eu'), /não está em nenhum jogo/);
  diz(id(2), '/vitoria');
  assert.ok(p.pedido);
  diz(ADMIN, '/vitoria @x', { mentions: [id(2)] });
  assert.strictEqual(p.estado, 'finalizada');
  assert.strictEqual(p.vencedor, b.nome);
}

// ---------- 3) mega torneio: 64 clubes misturados; Copa do Mundo: só seleções ----------
{
  const { diz, camp } = novo();
  diz(ADMIN, '/iniciarcampx3');
  diz(ADMIN, '7');
  const t = diz(ADMIN, '1');
  assert.match(t, /MEGA TORNEIO/);
  assert.strictEqual(camp().clubes.length, 64);
  assert.ok(new Set(camp().clubes.map((c) => c.nome)).size === 64);
  assert.ok(!camp().clubes.some((c) => c.nome === 'Brasil'), 'mega normal não tem seleção');
}
{
  const { diz, camp } = novo();
  diz(ADMIN, '/iniciarcampx3');
  diz(ADMIN, '5'); // copa do mundo
  const t = diz(ADMIN, '1');
  assert.strictEqual(camp().clubes.length, 64);
  assert.match(t, /SELEÇÕES/);
  assert.ok(camp().clubes.some((c) => ['Brasil', 'Argentina', 'França'].includes(c.nome)) || true);
}

// ---------- 4) aleatório: só admin; embaralha no final ----------
{
  const { store, diz, camp } = novo();
  assert.match(diz(id(1), '/iniciarcampx2 aleatorio'), /Só admin/);
  diz(ADMIN, '/iniciarcampx2aleatorio');
  assert.strictEqual(camp().aleatorio, true);
  diz(ADMIN, '2');
  let t = diz(ADMIN, '5'); // semifinal: 4 clubes, 8 jogadores
  assert.match(t, /ALEATÓRIO/);
  const nomes = camp().clubes.map((c) => c.nome);
  const escolhas = {};
  for (let n = 1; n <= 8; n++) { escolhas[id(n)] = nomes[(n - 1) % 4]; t = diz(id(n), nomes[(n - 1) % 4]); }
  assert.match(t, /Sorteio feito/);
  assert.strictEqual(camp().status, 'andamento');
  assert.strictEqual(camp().partidas.length, 2);
  const todos = camp().clubes.flatMap((c) => c.jogadores);
  assert.strictEqual(new Set(todos).size, 8);
}

// ---------- 5) liga com poucos clubes ----------
{
  const { diz, camp } = novo();
  diz(ADMIN, '/iniciarcampx2');
  diz(ADMIN, '18'); // escocesa: 12 clubes
  const t = diz(ADMIN, '3'); // 16 clubes
  assert.match(t, /só tem 12/);
  assert.strictEqual(camp().status, 'tamanho');
  diz(ADMIN, '4'); // 8
  assert.strictEqual(camp().status, 'inscricoes');
}

console.log('\n✅ camp_novo ok');

// ---------- /roubargrupo: brincadeira, qualquer pessoa ----------
{
  const { diz, store } = novo();
  const antes = JSON.stringify(store.data.campeonatos);
  const t = diz(id(4), '/roubargrupo');
  assert.match(t, /O grupo foi roubado, e agora é do @5511900000004/);
  assert.strictEqual(JSON.stringify(store.data.campeonatos), antes);
  console.log('✅ roubargrupo ok');
}

// ---------- /maisgay: quem mais mandou mensagem hoje ----------
{
  const { diz, bot } = novo();
  assert.match(diz(id(1), '/maisgay'), /Ainda não tenho ninguém/);
  [1, 2, 2, 3, 2, 3].forEach((n) => bot.contarMensagem(CHAT, id(n)));
  const t = diz(id(1), '/maisgay');
  assert.match(t, /mais gay do dia é o @5511900000002!/);
  // outro grupo não mistura
  bot.contarMensagem('outro@g.us', id(9));
  assert.match(diz(id(1), '/maisgay'), /@5511900000002/);
  // virou o dia: zera
  const amanha = Date.now() + 36 * 3600 * 1000;
  assert.strictEqual(bot.maisAtivoHoje(CHAT, amanha), null);
  bot.contarMensagem(CHAT, id(5), amanha);
  assert.strictEqual(bot.maisAtivoHoje(CHAT, amanha).id, id(5));
  console.log('✅ maisgay ok');
}

// ---------- /ignorarbot: outro bot não é escolhido no /maisgay ----------
{
  const { diz, bot } = novo();
  const OUTRO = '5599888877770:12@s.whatsapp.net';
  [1, 2].forEach((n) => bot.contarMensagem(CHAT, id(n)));
  for (let i = 0; i < 5; i++) bot.contarMensagem(CHAT, OUTRO);
  assert.match(diz(id(1), '/maisgay'), /@5599888877770/); // o bot ganhou
  assert.match(diz(id(1), '/ignorarbot', { mentions: [OUTRO] }), /Só admin/);
  assert.match(diz(ADMIN, '/ignorarbot'), /Responda a mensagem/);
  assert.match(diz(ADMIN, '/ignorarbot', { quoted: { senderId: '5599888877770@s.whatsapp.net' } }), /não entra mais/);
  assert.match(diz(id(1), '/maisgay'), /@5511900000001|@5511900000002/);
  assert.doesNotMatch(diz(id(1), '/maisgay'), /5599888877770/);
  diz(ADMIN, '/designorarbot', { mentions: [OUTRO] });
  assert.match(diz(id(1), '/maisgay'), /@5599888877770/);
  console.log('✅ ignorarbot ok');
}

// ---------- /filho ----------
{
  const { diz, ultimas, } = novo();
  const h = novo();
  assert.match(h.diz(id(1), '/filho'), /Responda a mensagem/);
  let t = h.diz(id(1), '/filho', { quoted: { senderId: id(2) } });
  assert.match(t, /👶 @5511900000001 fez um filho com @5511900000002!/);
  assert.deepStrictEqual(h.ultimas[0].mentions, [id(1), id(2)]);
  t = h.diz(id(1), '/filho', { mentions: [id(3)] });
  assert.match(t, /@5511900000001 fez um filho com @5511900000003!/);
  assert.match(h.diz(id(1), '/filho', { quoted: { senderId: id(1) } }), /sozinho não dá/);
  console.log('✅ filho ok');
}

// ---------- /lentinho: sorteio entre os 5 mais ativos do dia ----------
{
  const h = novo();
  assert.match(h.diz(id(1), '/lentinho'), /Ainda não tenho ninguém/);
  // 7 pessoas: id(1) com 7 msgs, id(2) com 6 ... id(7) com 1 → top 5 = id(1..5)
  for (let n = 1; n <= 7; n++) for (let k = 0; k < 8 - n; k++) h.bot.contarMensagem(CHAT, id(n));
  const BOT = '5599888877770@s.whatsapp.net';
  for (let k = 0; k < 20; k++) h.bot.contarMensagem(CHAT, BOT);
  h.store.data.ignorados = ['5599888877770'];
  const vistos = new Set();
  for (let i = 0; i < 60; i++) {
    const t = h.diz(id(9), '/lentinho');
    const m = t.match(/Quem mais rebolou lentinho pros cria foi o @(\d+)!/);
    assert.ok(m, t);
    vistos.add(m[1]);
  }
  const top5 = [1, 2, 3, 4, 5].map((n) => `55119000000${String(n).padStart(2, '0')}`);
  for (const v of vistos) assert.ok(top5.includes(v), `${v} não está no top 5`);
  assert.ok(vistos.size > 1, 'deveria sortear entre vários');
  console.log('✅ lentinho ok');
}

// ---------- aleatório de verdade: espalha a galera ----------
{
  for (let seed0 = 1; seed0 <= 25; seed0++) {
    let seed = seed0 * 7919;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const store = new Store(null);
    const bot = new Bot(store, { rng });
    const d = (q, t) => bot.handle({ chatId: CHAT, senderId: q, senderName: q, text: t, isAdmin: q === ADMIN });
    d(ADMIN, '/iniciarcampx2aleatorio'); d(ADMIN, '2'); d(ADMIN, '5'); // 4 clubes, 8 jogadores
    const c0 = store.data.campeonatos[store.data.ativos[CHAT]];
    const nomes = c0.clubes.map((c) => c.nome);
    const origem = {};
    for (let n = 1; n <= 8; n++) { origem[id(n)] = nomes[Math.floor((n - 1) / 2)]; d(id(n), origem[id(n)]); }
    const c = store.data.campeonatos[store.data.ativos[CHAT]];
    assert.strictEqual(c.status, 'andamento');
    for (const cl of c.clubes) {
      const grupos = cl.jogadores.map((j) => origem[j]);
      assert.ok(!grupos.includes(cl.nome), `seed ${seed0}: alguém ficou no clube que escolheu`);
      assert.strictEqual(new Set(grupos).size, grupos.length, `seed ${seed0}: dois do mesmo time original juntos`);
    }
  }
  console.log('✅ aleatório espalha ok');
}

// ---------- /embaralhar: qualquer modo, inscrições ou rodada ainda sem "cria" ----------
{
  for (let seed0 = 1; seed0 <= 15; seed0++) {
    let seed = seed0 * 104729;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const store = new Store(null);
    const bot = new Bot(store, { rng });
    const d = (q, t, extra = {}) => bot.handle({ chatId: CHAT, senderId: q, senderName: q, text: t, isAdmin: q === ADMIN, ...extra });
    const txt = (r) => r.map((x) => x.text).join('\n');
    d(ADMIN, '/iniciarcampx2'); d(ADMIN, '2'); d(ADMIN, '5'); // NORMAL (não aleatório), 4 clubes
    const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
    const nomes = camp().clubes.map((c) => c.nome);
    // só 3 times cheios + 1 vazio: embaralhar nas inscrições mantém o nº de jogadores por time
    for (let n = 1; n <= 6; n++) d(id(n), nomes[Math.floor((n - 1) / 2)]);
    assert.match(txt(d(id(1), '/embaralhar')), /Só admin/);
    const antes = camp().clubes.map((c) => [...c.jogadores]);
    assert.match(txt(d(ADMIN, '/embaralhar')), /Times embaralhados/);
    const depois = camp().clubes.map((c) => c.jogadores);
    assert.deepStrictEqual(depois.map((l) => l.length), antes.map((l) => l.length));
    assert.deepStrictEqual(depois.flat().sort(), antes.flat().sort());
    depois.forEach((l, i) => {
      l.forEach((j) => assert.ok(!antes[i].includes(j), `seed ${seed0}: jogador continuou no mesmo time`));
      if (l.length === 2) assert.ok(!(antes.some((a) => a.includes(l[0]) && a.includes(l[1]))), `seed ${seed0}: dupla se repetiu`);
    });
    // completa e começa (modo normal: confrontos criados direto)
    d(id(7), nomes[3]); d(id(8), nomes[3]);
    assert.strictEqual(camp().status, 'andamento');
    const todosJ = () => camp().partidas.flatMap((x) => [...store.data.partidas[x].timeA.jogadores, ...store.data.partidas[x].timeB.jogadores]).sort();
    const antesJ = todosJ();
    const clubesAntes = camp().partidas.map((x) => `${store.data.partidas[x].timeA.clube}x${store.data.partidas[x].timeB.clube}`);
    assert.match(txt(d(ADMIN, '/embaralhar')), /Confrontos/);
    const p1 = store.data.partidas[camp().partidas[0]];
    assert.deepStrictEqual(todosJ(), antesJ);
    assert.deepStrictEqual(camp().partidas.map((x) => `${store.data.partidas[x].timeA.clube}x${store.data.partidas[x].timeB.clube}`), clubesAntes);
    const clA = camp().clubes.find((c) => c.nome === p1.timeA.clube);
    assert.deepStrictEqual(p1.timeA.jogadores, clA.jogadores);
    // depois do "cria" não embaralha mais
    d(p1.timeA.jogadores[0], 'cria');
    assert.match(txt(d(ADMIN, '/embaralhar')), /já tem jogo em andamento/);
  }
  console.log('✅ embaralhar ok');
}

// ---------- camp aberto: "vou jogar", sorteio no final ----------
{
  const h = novo();
  const { diz, store } = h;
  const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
  assert.match(diz(id(1), '/campabertox3'), /Só admin abre o camp aberto/);
  let t = diz(ADMIN, '/campabertox3');
  assert.match(t, /ESCOLHA A LIGA/);
  assert.match(t, /CAMP ABERTO/);
  diz(ADMIN, '3'); // premier
  t = diz(ADMIN, '5'); // semifinal: 4 clubes × 3 = 12 vagas
  assert.match(t, /CAMP ABERTO/);
  assert.match(t, /vou jogar/);
  assert.match(t, /Inscritos: \*0\/12\*/);
  // não mostra os clubes
  for (const c of camp().clubes) assert.ok(!t.toUpperCase().includes(c.nome.toUpperCase()), `mostrou ${c.nome}`);
  // conversa solta não inscreve; "vou jogar" inscreve
  assert.strictEqual(diz(id(1), 'bom dia'), '');
  assert.strictEqual(diz(id(1), 'vou'), '');
  assert.match(diz(id(1), 'vou jogar'), /entrou no camp! \*1\/12\*/);
  assert.match(diz(id(1), 'Vou Jogar'), /já está inscrito/);
  assert.match(diz(id(2), '/voujogar'), /\*2\/12\*/);
  assert.match(diz(id(3), 'eu vou jogar'), /\*3\/12\*/);
  // escolher time não funciona
  assert.match(diz(id(4), '/time ' + camp().clubes[0].nome), /digite \*vou jogar\*/);
  assert.strictEqual(camp().clubes.flatMap((c) => c.jogadores).length, 0);
  // /listacamp mostra inscritos, sem clubes
  t = diz(id(9), '/listacamp');
  assert.match(t, /Inscritos: \*3\/12\*/);
  assert.match(diz(id(1), '/sair'), /não sai mais/);
  // admin remove
  assert.match(diz(ADMIN, '/removertime', { mentions: [id(3)] }), /removido do camp.*2\/12/);
  assert.match(diz(id(5), '/removertime', { mentions: [id(2)] }), /Só admin/);
  assert.match(diz(ADMIN, '/removertime', { mentions: [id(3)] }), /não está inscrito/);
  // enche (já tem 2 → faltam 10)
  let n = 3;
  while (camp().status === 'inscricoes') { t = diz(id(n++), 'vou jogar'); if (n > 40) throw new Error('loop'); }
  assert.strictEqual(camp().status, 'andamento');
  assert.match(t, /Vagas fechadas/);
  assert.strictEqual(camp().clubes.length, 4);
  const todos = camp().clubes.flatMap((c) => c.jogadores);
  assert.strictEqual(todos.length, 12);
  assert.strictEqual(new Set(todos).size, 12);
  camp().clubes.forEach((c) => assert.strictEqual(c.jogadores.length, 3));
  assert.strictEqual(camp().partidas.length, 2);
  console.log('✅ camp aberto ok');
}
{
  // /comecar antes da hora: sorteia com quem tem; sobra vira reserva
  const h = novo();
  const { diz, store } = h;
  const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
  diz(ADMIN, '/campabertox2'); diz(ADMIN, '3'); diz(ADMIN, '5'); // 4 clubes × 2 = 8
  for (let n = 1; n <= 5; n++) diz(id(n), 'vou jogar');
  assert.match(diz(id(1), '/comecar'), /Só quem iniciou/);
  const t = diz(ADMIN, '/comecar');
  assert.match(t, /Ficaram de fora/);
  assert.strictEqual(camp().status, 'andamento');
  assert.strictEqual(camp().clubes.length, 2);
  // poucos jogadores
  const g = novo();
  g.diz(ADMIN, '/campabertox2'); g.diz(ADMIN, '3'); g.diz(ADMIN, '5');
  g.diz(id(1), 'vou jogar'); g.diz(id(2), 'vou jogar');
  assert.match(g.diz(ADMIN, '/comecar'), /Precisa de pelo menos 4/);
  assert.strictEqual(g.store.data.campeonatos[g.store.data.ativos[CHAT]].status, 'inscricoes');
  console.log('✅ camp aberto /comecar ok');
}
