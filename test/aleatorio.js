// Modo aleatório (/x3aleatorio). Rode com: npm test
const assert = require('assert');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const CHAT = 'grupo@g.us';
const id = (n) => `55119000000${String(n).padStart(2, '0')}@s.whatsapp.net`;
const ADMIN = 'admin@s.whatsapp.net';

function novo() {
  let seed = 7;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const store = new Store(null);
  const bot = new Bot(store, { rng });
  let ultimas = [];
  const diz = (quem, texto, isAdmin = false) => {
    ultimas = bot.handle({ chatId: CHAT, senderId: quem, senderName: quem.split('@')[0], text: texto, isAdmin });
    const t = ultimas.map((x) => x.text).join('\n---\n');
    console.log(`\n[${quem.split('@')[0]}] ${texto}\n${t.split('\n').map((l) => '  ‹ ' + l).join('\n')}`);
    return t;
  };
  const camp = () => store.data.campeonatos[store.data.ativos[CHAT]];
  return { store, bot, diz, camp, get ultimas() { return ultimas; } };
}

// ---------- 1) X2 aleatório, semifinal, 4 times x 2 = 8 jogadores ----------
{
  const { store, diz, camp } = novo();
  assert.match(diz(id(1), '/x2aleatorio'), /Só admin/);
  let t = diz(ADMIN, '/x2aleatorio', true);
  assert.match(t, /Modo aleatório X2/);
  assert.match(t, /\/final[\s\S]*\/semi[\s\S]*\/quartas[\s\S]*\/oitavas/);
  assert.match(t, /\(8 jogadores\)/); // quartas no X2 = 16, semi = 8
  assert.match(diz(id(1), '/semi'), /Só admin/);
  t = diz(ADMIN, '/semi', true);
  assert.match(t, /Modo aleatório/);
  assert.strictEqual(camp().clubes.length, 4);

  const nomes = camp().clubes.map((c) => c.nome);
  const escolhas = {};
  for (let n = 1; n <= 8; n++) {
    const clube = nomes[(n - 1) % 4];
    escolhas[id(n)] = clube;
    t = diz(id(n), clube);
  }
  // encheu → sorteio automático
  assert.match(t, /Sorteio feito/);
  assert.strictEqual(camp().status, 'andamento');
  assert.strictEqual(camp().clubes.length, 4);
  const todos = camp().clubes.flatMap((c) => c.jogadores);
  assert.strictEqual(new Set(todos).size, 8);
  assert.deepStrictEqual([...todos].sort(), Object.keys(escolhas).sort());
  camp().clubes.forEach((c) => assert.strictEqual(c.jogadores.length, 2));
  // o embaralhamento mexeu em alguém (não ficou cada um no clube que escolheu)
  const mudou = camp().clubes.some((c) => c.jogadores.some((j) => escolhas[j] !== c.nome));
  assert.ok(mudou, 'jogadores deveriam ter sido embaralhados');
  // 2 confrontos de semifinal
  const partidas = camp().partidas.map((p) => store.data.partidas[p]);
  assert.strictEqual(partidas.length, 2);
  assert.strictEqual(camp().nomeRodada, 'Semifinal');
}

// ---------- 2) atalho com fase, sorteio parcial com /comecar, jogador sobrando ----------
{
  const { diz, camp } = novo();
  let t = diz(ADMIN, '/x2aleatorio libertadores quartas', true);
  assert.strictEqual(camp().competicao, 'libertadores');
  assert.strictEqual(camp().clubes.length, 8);
  assert.match(t, /Modo aleatório/);
  const nomes = camp().clubes.map((c) => c.nome);
  for (let n = 1; n <= 5; n++) diz(id(n), nomes[n - 1]);
  assert.match(diz(id(1), '/comecar'), /só admin|Só quem/i);
  t = diz(ADMIN, '/comecar', true);
  assert.match(t, /Sorteio feito/);
  assert.match(t, /Ficaram de fora/);
  assert.strictEqual(camp().clubes.length, 2);
  assert.strictEqual(camp().partidas.length, 1);
}

// ---------- 3) poucos jogadores, e /x3 aleatorio como alternativa ----------
{
  const { diz, camp } = novo();
  diz(ADMIN, '/x3 aleatorio final', true);
  assert.strictEqual(camp().modo, 'x3');
  assert.strictEqual(camp().clubes.length, 2);
  const nomes = camp().clubes.map((c) => c.nome);
  for (let n = 1; n <= 3; n++) diz(id(n), nomes[0]);
  diz(id(4), nomes[0]); // clube cheio: recusa
  assert.strictEqual(camp().clubes[0].jogadores.length, 3);
  diz(id(4), nomes[1]);
  diz(id(5), nomes[1]);
  assert.match(diz(ADMIN, '/comecar', true), /pelo menos 6 jogadores pra sortear \(tem 5\)/);
  assert.strictEqual(camp().status, 'inscricoes');
  diz(id(6), nomes[1]);
  assert.strictEqual(camp().status, 'andamento'); // a final começou sozinha
  diz(ADMIN, '/cancelar', true);
  // fase grande demais para a competição
  diz(ADMIN, '/x1aleatorio', true);
  assert.match(diz(ADMIN, '/final', true), /Modo aleatório/);
}

// ---------- 4) times mostrados ao entrar e /lista ----------
{
  const { diz, camp } = novo();
  const A = id(1), B = id(2), C = id(3);
  diz(ADMIN, '/x2aleatorio final', true);
  const [c1, c2] = camp().clubes.map((c) => c.nome);
  let t = diz(A, c1);
  assert.match(t, new RegExp(`\\*${c1}\\* \\(1/2\\)`));
  assert.match(t, /@5511900000001/);
  assert.match(t, /vaga livre/);
  diz(B, c1);
  assert.match(t = diz(C, c2), new RegExp(`\\*${c2}\\* \\(1/2\\)`));
  // /lista mostra completos e com vagas
  t = diz(A, '/lista');
  assert.match(t, /Completos[\s\S]*Com vagas/);
  assert.match(t, new RegExp(`✅ \\*${c1}\\* \\(2/2\\)`));
  assert.match(t, new RegExp(`⚪ \\*${c2}\\* \\(1/2\\)`));
  // trocar de clube mostra os dois
  t = diz(A, c2);
  assert.match(t, /saiu do .* e entrou no time/);
  // /lista geral continua sendo a contagem
  assert.doesNotMatch(diz(A, '/lista geral'), /Completos/);
}

console.log('\n✅ MODO ALEATÓRIO: TODOS OS TESTES PASSARAM');
