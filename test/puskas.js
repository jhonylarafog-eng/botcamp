// Prêmio Puskas. Rode com: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { Bot } = require('../src/game');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puskas-'));
fs.mkdirSync(path.join(dir, 'puskas'));
const CHAT = 'grupo@g.us';
const U = (n) => `55119${String(n).padStart(8, '0')}@s.whatsapp.net`;
const ADMIN = 'admin@s.whatsapp.net';

let agora = new Date('2026-11-17T15:00:00-03:00').getTime();
const store = new Store(null);
const bot = new Bot(store, { dataDir: dir, agora: () => agora });
let seq = 0;

const arquivoExiste = (rel) => fs.existsSync(path.join(dir, rel));
function novoVideo(autor) {
  const id = `VID${++seq}`;
  const rel = `puskas/${id}.mp4`;
  fs.writeFileSync(path.join(dir, rel), 'video-falso');
  return { arquivo: rel, id, autor: autor || null };
}
function diz(quem, texto, extra = {}, isAdmin = false) {
  const r = bot.handle({ chatId: CHAT, senderId: quem, senderName: quem.split('@')[0], text: texto, isAdmin, ...extra });
  const t = r.map((x) => (x.grupo ? `[GRUPO: ${x.grupo}]` : x.video ? `[VÍDEO] ${x.text}` : x.text)).join('\n---\n');
  console.log(`\n[${quem.split('@')[0]}] ${texto}\n${t.split('\n').map((l) => '  ‹ ' + l).join('\n')}`);
  return { r, t };
}
const gol = (quem) => diz(quem, '/puskas', { video: novoVideo() });

// ---------- registro ----------
assert.match(diz(U(1), '/puskas').t, /Prêmio Puskas[\s\S]*0\/10/);
let { t } = gol(U(1));
assert.match(t, /Gol registrado.*gol #1 \(1\/10\)/);
gol(U(2));
// vídeo repetido
const rep = novoVideo();
diz(U(3), '/puskas', { video: rep });
assert.match(diz(U(4), '/puskas', { video: rep }).t, /já está na lista/);
// citado: o autor é o dono do vídeo
({ t } = diz(U(5), '/puskas', { video: novoVideo(U(6)) }));
assert.match(t, /@5511900000006/);
assert.match(diz(U(1), '/puskas lista').t, /Gols esperando votação\* \(4\/10\)/);
// erro de download
assert.match(diz(U(1), '/puskas', { videoErro: 'Não consegui baixar esse vídeo.' }).t, /Não consegui baixar/);

// ---------- limite de 10 esperando votação ----------
for (let i = 7; i <= 12; i++) gol(U(i)); // chega a 10
assert.match(diz(U(1), '/puskas lista').t, /\(10\/10\)/);
const v11 = novoVideo();
({ t } = diz(U(13), '/puskas', { video: v11 }));
assert.match(t, /lista está cheia \(10 gols esperando votação\)/);
assert.ok(!arquivoExiste(v11.arquivo), 'vídeo recusado deve ser apagado');
assert.strictEqual(store.data.puskas.gols && Object.values(store.data.puskas.gols).filter((g) => !g.removido).length, 10);

// remover libera vaga
assert.match(diz(U(9), '/puskas remover 1').t, /Só o autor/);
assert.match(diz(U(1), '/puskas remover 1').t, /removido/);
gol(U(14)); // agora cabe (vira o gol #11 numerado, mas conta 10 ativos)
assert.match(diz(U(1), '/puskas lista').t, /\(10\/10\)/);

// ---------- abrir a votação ----------
assert.match(diz(U(1), '/iniciar puskas').t, /Só admin/);
let { r } = diz(ADMIN, '/iniciar puskas', {}, true);
const videos = r.filter((x) => x.video);
assert.strictEqual(videos.length, 10);
assert.match(videos[0].text, /GOL 1\* de 10 — gol do @\d+/);
assert.match(videos[0].text, /Reaja nesse gol se você achou ele o mais bonito/);
assert.strictEqual(videos[0].mentions.length, 1); // marca o autor
assert.deepStrictEqual(r.filter((x) => x.grupo).map((x) => x.grupo), ['fechar', 'abrir']);
const expl = r.find((x) => x.text);
assert.match(expl.text, /fechar o grupo/);
assert.match(expl.text, /Como funciona[\s\S]*reação[\s\S]*voto \*muda\*[\s\S]*mais bonito de verdade/);
assert.ok(r.indexOf(expl) < r.indexOf(videos[0]), 'a explicação vem antes dos vídeos');
assert.strictEqual(r[0].grupo, 'fechar', 'fecha o grupo antes de tudo');
assert.ok(r.indexOf(videos[9]) < r.findIndex((x) => x.grupo === 'abrir'), 'reabre depois do último vídeo');
assert.match(videos[9].text, /GOL 10\* de 10/);
assert.match(r[r.length - 1].text, /Votação aberta/);
assert.strictEqual(r[r.length - 2].grupo, 'abrir');
assert.ok(r.indexOf(videos[0]) < r.indexOf(r[r.length - 1]));
videos.forEach((v, i) => v.onSent(`BOT${i + 1}`)); // o conector avisa o id de cada vídeo enviado
assert.match(diz(ADMIN, '/iniciar puskas', {}, true).t, /Já tem uma votação/);

// ---------- votos por reação ----------
const autorDoGol = (n) => store.data.puskas.gols[store.data.puskas.rodadas[1].gols[n - 1]].autor;
const reage = (quem, msgId, emoji = '🔥') => bot.reacao({ chatId: CHAT, senderId: quem, msgId, emoji });
reage(U(50), 'BOT3');
reage(U(51), 'BOT3');
reage(U(52), 'BOT4');
reage(U(53), 'BOT4', '👏');
reage(U(54), 'BOT4');
reage(U(52), 'BOT5');                 // trocou o voto: sai do 4 e vai pro 5
reage(U(55), 'BOT3');
reage(U(55), 'BOT3', '');             // tirou a reação: voto some
reage(autorDoGol(6), 'BOT6');         // votar no próprio gol não vale
reage(U(56), 'MENSAGEM-QUALQUER');    // reação em outra mensagem: ignorada
const rodada = store.data.puskas.rodadas[1];
assert.strictEqual(Object.keys(rodada.votos).length, 5);
// fallback por texto
assert.match(diz(U(57), '/puskas votar 3').t, /Voto registrado no gol 3/);
assert.match(diz(U(57), '/puskas votar 99').t, /de 1 a 10/);
// tudo junto, sem espaço
assert.match(diz(U(57), '/puskasvotar4').t, /Voto registrado no gol 4/);
assert.match(diz(U(57), '/votarpuskas5').t, /Voto registrado no gol 5/);
assert.match(diz(U(57), '/puskasvotar 3').t, /Voto registrado no gol 3/);
assert.match(diz(U(57), '/puskaslista').t, /Gols esperando votação/);
assert.match(diz(U(57), '/puskasvotar99').t, /de 1 a 10/);
assert.match(diz(U(1), '/puskashall').t, /Hall do Puskas|Ainda não|Nenhum/);
assert.match(diz(U(57), '/puskas votar 3').t, /Voto registrado no gol 3/); // volta pro voto original
assert.match(diz(autorDoGol(2), '/votarpuskas 2').t, /próprio gol/);

// ---------- apuração ----------
assert.match(diz(U(1), '/encerrar puskas').t, /Só admin/);
({ r, t } = diz(ADMIN, '/encerrar puskas', {}, true));
assert.match(t, /GOL PUSKAS DO DIA/);
assert.match(t, /🏆 Gol 3 — @\d+ — 3 votos/);   // 50, 51 e 57
assert.match(t, /Gol 4 — @\d+ — 2 votos/);
assert.match(t, /6 pessoas votaram/);
assert.strictEqual(r.filter((x) => x.video).length, 1);
assert.match(r.find((x) => x.video).text, /GOL PUSKAS DO DIA/);
// só o vídeo vencedor fica guardado
const gols = Object.values(store.data.puskas.gols);
assert.strictEqual(gols.filter((g) => g.arquivo).length, 1);
assert.match(diz(ADMIN, '/encerrar puskas', {}, true).t, /Não tem votação/);
assert.match(t, /agora tem 1 Puskas/);
assert.match(diz(U(1), '/puskas hall').t, /Hall do Puskas[\s\S]*Quem já ganhou\*\n1\. @5511900000006 — 1 Puskas[\s\S]*17\/11/);

// ---------- no dia seguinte: empate, cancelar, poucos gols ----------
agora = new Date('2026-11-18T10:00:00-03:00').getTime();
assert.match(diz(ADMIN, '/iniciar puskas', {}, true).t, /pelo menos 2 gols pra votar \(na lista: 0\)/);
assert.match(diz(U(1), '/puskas lista').t, /Nenhum gol esperando votação/);
gol(U(21)); gol(U(22));
({ r } = diz(ADMIN, '/iniciar puskas', {}, true));
r.filter((x) => x.video).forEach((v, i) => v.onSent(`B2-${i + 1}`));
assert.match(diz(ADMIN, '/encerrar puskas', {}, true).t, /Ninguém votou/);
reage(U(60), 'B2-1');
reage(U(61), 'B2-2');
({ t } = diz(ADMIN, '/encerrar puskas', {}, true));
assert.match(t, /EMPATE NO PUSKAS/);
// cancelar devolve os gols
gol(U(31)); gol(U(32));
({ r } = diz(ADMIN, '/iniciar puskas', {}, true));
assert.match(diz(ADMIN, '/puskas cancelar', {}, true).t, /cancelada/);
assert.strictEqual(diz(ADMIN, '/iniciar puskas', {}, true).r.filter((x) => x.video).length, 2);
diz(ADMIN, '/puskas cancelar', {}, true);
// os 2 gols cancelados continuam na lista (não somem na virada do dia); aqui tiramos pra seguir o teste
diz(ADMIN, '/puskas remover 1', {}, true);
diz(ADMIN, '/puskas remover 2', {}, true);

// ---------- ranking de campeões: quem ganha de novo soma ----------
agora += 86_400_000; // dia 3
gol(U(21)); gol(U(40));
({ r } = diz(ADMIN, '/iniciar puskas', {}, true));
r.filter((x) => x.video).forEach((v, i) => v.onSent(`B3-${i + 1}`));
const primeiro = Object.values(store.data.puskas.rodadas).find((x) => x.status === 'aberta');
const autor1 = store.data.puskas.gols[primeiro.gols[0]].autor;
reage(U(80), 'B3-1');
({ t } = diz(ADMIN, '/encerrar puskas', {}, true));
assert.strictEqual(autor1, U(21));
assert.match(t, /@5511900000021 agora tem 2 Puskas/);
t = diz(U(1), '/puskas ranking').t;
assert.match(t, /1\. @5511900000021 — 2 Puskas/);
assert.match(t, /2\. @5511900000006 — 1 Puskas/);
assert.match(t, /@5511900000022 — 1 Puskas/);
// o ranking fica salvo no arquivo de dados (JSON), não só na memória
const salvo = JSON.parse(JSON.stringify(store.data));
const bot2 = new Bot(Object.assign(new Store(null), { data: salvo }), { dataDir: dir, agora: () => agora });
const h2 = bot2.handle({ chatId: CHAT, senderId: U(1), senderName: 'x', text: '/puskas hall', isAdmin: false });
assert.match(h2[0].text, /@5511900000021 — 2 Puskas/);

// ---------- os gols NÃO somem na virada do dia: ficam até uma votação ----------
const velho = novoVideo();
diz(U(70), '/puskas', { video: velho });
agora += 5 * 86_400_000; // 5 dias depois
gol(U(71)); // dispara a limpeza
assert.ok(arquivoExiste(velho.arquivo), 'gol que ainda não foi votado deve continuar guardado');
assert.match(diz(U(1), '/puskas lista').t, /Gols esperando votação\* \(2\/10\)/);
({ r } = diz(ADMIN, '/iniciar puskas', {}, true));
assert.strictEqual(r.filter((x) => x.video).length, 2, 'a votação usa os gols guardados de dias anteriores');
r.filter((x) => x.video).forEach((v, i) => v.onSent(`B4-${i + 1}`));
reage(U(90), 'B4-1');
diz(ADMIN, '/encerrar puskas', {}, true);
assert.match(diz(U(1), '/puskas lista').t, /Nenhum gol esperando votação/); // depois de votado, a lista zera

// ---------- vencedores: o vídeo nunca some sozinho; só o admin apaga (/limparpuskas) ----------
assert.ok(arquivoExiste(velho.arquivo), 'o vídeo do vencedor fica guardado');
assert.match(diz(ADMIN, '/limparpuskas', {}, true).t, /Nada pra limpar/); // ainda é recente
agora += 70 * 86_400_000; // ~2 meses e meio depois
gol(U(95)); // dispara a limpeza automática: não pode apagar vídeo de vencedor
assert.ok(arquivoExiste(velho.arquivo), 'vídeo de vencedor não é apagado automaticamente');
assert.match(diz(U(1), '/limparpuskas').t, /Só admin/);
const prev = diz(ADMIN, '/limparpuskas', {}, true).t;
assert.match(prev, /Dá pra apagar \d+ vídeos? de vencedores com mais de 60 dias[\s\S]*\/limparpuskas confirmar/);
assert.ok(arquivoExiste(velho.arquivo), 'sem confirmar, nada é apagado');
assert.match(diz(ADMIN, '/limparpuskasconfirmar', {}, true).t, /apagados?/);
assert.ok(!arquivoExiste(velho.arquivo), 'depois de confirmar o vídeo é apagado');
assert.match(diz(U(1), '/puskas hall').t, /Quem já ganhou/); // o hall continua intacto
assert.match(diz(ADMIN, '/puskas limpar', {}, true).t, /Nada pra limpar/);

// a Bola de Ouro foi removida: /encerrar sozinho e os comandos dela não fazem nada
for (const c of ['/encerrar', '/bolaouro Temporada 1', '/votar @a @b @c', '/votos', '/hall', '/cancelarvotacao']) {
  assert.strictEqual(diz(ADMIN, c, {}, true).t, '', `${c} deveria ser ignorado`);
}

console.log('\n✅ PUSKAS: TODOS OS TESTES PASSARAM');
