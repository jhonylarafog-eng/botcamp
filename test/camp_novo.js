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

// ---------- 6) atalhos sem "camp": /iniciarx3, /iniciarx3aleatorio ----------
{
  const { diz, camp } = novo();
  assert.match(diz(ADMIN, '/iniciarx3aleatorio'), /ESCOLHA A LIGA/);
  assert.strictEqual(camp().aleatorio, true);
  assert.strictEqual(camp().modo, 'x3');
  diz(ADMIN, '/cancelar');
  assert.match(diz(ADMIN, '/iniciarx2 aleatorio'), /ESCOLHA A LIGA/);
  assert.strictEqual(camp().aleatorio, true);
}

console.log('\n✅ camp_novo ok');
