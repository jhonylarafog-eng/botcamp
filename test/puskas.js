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
  const t = r.map((x) => (x.video ? `[VÍDEO] ${x.text}` : x.text)).join('\n---\n');
  console.log(`\n[${quem.split('@')[0]}] ${texto}\n${t.split('\n').map((l) => '  ‹ ' + l).join('\n')}`);
  return { r, t };
}
const gol = (quem) => diz(quem, '/puskas', { video: novoVideo() });

// ---------- registro ----------
assert.match(diz(U(1), '/puskas').t, /Prêmio Puskas[\s\S]*0\/10/);
let { t } = gol(U(1));
assert.match(t, /Gol registrado.*gol #1 de hoje \(1\/10\)/);
gol(U(2));
// vídeo repetido
const rep = novoVideo();
diz(U(3), '/puskas', { video: rep });
assert.match(diz(U(4), '/puskas', { video: rep }).t, /já está na lista/);
// citado: o autor é o dono do vídeo
({ t } = diz(U(5), '/puskas', { video: novoVideo(U(6)) }));
assert.match(t, /@5511900000006/);
assert.match(diz(U(1), '/puskas lista').t, /Gols Puskas de hoje\* \(4\/10\)/);
// erro de download
assert.match(diz(U(1), '/puskas', { videoErro: 'Não consegui baixar esse vídeo.' }).t, /Não consegui baixar/);

// ---------- limite de 10 por dia ----------
for (let i = 7; i <= 12; i++) gol(U(i)); // chega a 10
assert.match(diz(U(1), '/puskas lista').t, /\(10\/10\)/);
const v11 = novoVideo();
({ t } = diz(U(13), '/puskas', { video: v11 }));
assert.match(t, /Hoje já chegaram 10 gols/);
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
assert.match(r[0].text, /Como funciona[\s\S]*reação[\s\S]*voto \*muda\*[\s\S]*mais bonito de verdade/);
assert.ok(r.indexOf(r[0]) < r.indexOf(videos[0]), 'a explicação vem antes dos vídeos');
assert.match(videos[9].text, /GOL 10\* de 10/);
assert.match(r[r.length - 1].text, /Votação aberta/);
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
assert.match(diz(U(1), '/puskas hall').t, /Hall do Puskas[\s\S]*17\/11/);

// ---------- no dia seguinte: empate, cancelar, poucos gols ----------
agora = new Date('2026-11-18T10:00:00-03:00').getTime();
assert.match(diz(ADMIN, '/iniciar puskas', {}, true).t, /pelo menos 2 gols pra votar \(hoje: 0\)/);
assert.match(diz(U(1), '/puskas lista').t, /Nenhum gol Puskas hoje/);
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

// ---------- limpeza de vídeos antigos ----------
const velho = novoVideo();
diz(U(70), '/puskas', { video: velho });
agora += 5 * 86_400_000;
gol(U(71)); // dispara a limpeza
assert.ok(!arquivoExiste(velho.arquivo), 'vídeo velho deveria ter sido apagado');

// os comandos antigos continuam separados do Puskas
assert.match(diz(ADMIN, '/encerrar', {}, true).t, /Não tem votação|votação/i);

console.log('\n✅ PUSKAS: TODOS OS TESTES PASSARAM');
