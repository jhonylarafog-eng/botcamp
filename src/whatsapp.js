// Conector do WhatsApp (biblioteca Baileys) + página web de status/pareamento.
//
// Variáveis de ambiente:
//   BOT_NUMBER  número do WhatsApp do bot, só dígitos com DDI. Ex.: 5511999998888
//   ADMIN_KEY   senha da página de pareamento (abra  https://SEU-SITE/?key=SENHA )
//   DATA_DIR    pasta onde ficam login e dados (use um volume!). Padrão: ./dados
//   PORT        porta da página web. Padrão: 3000
//   PREFIX      prefixo dos comandos. Padrão: /
//   PROTEGIDOS  números blindados do /castigo, separados por vírgula. Ex.: 5511999998888,5511988887777

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidNormalizedUser, downloadMediaMessage } = baileys;

const { Store } = require('./store');
const { Bot } = require('./game');
const { criarVigia } = require('./castigo_wa');
const { criarBoasVindas } = require('./boasvindas');
const { criarVendas } = require('./vendas/vendas');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'dados');
const PORT = parseInt(process.env.PORT || '3000', 10);
const PREFIX = process.env.PREFIX || '/';
const BOT_NUMBER = (process.env.BOT_NUMBER || '').replace(/\D/g, '');
let ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  ADMIN_KEY = crypto.randomBytes(6).toString('hex');
  console.log(`ADMIN_KEY não definida. Usando uma temporária: ${ADMIN_KEY}`);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const store = new Store(path.join(DATA_DIR, 'campeonatos.json'));
const PROTEGIDOS = (process.env.PROTEGIDOS || '').split(/[,\s]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean);
const bot = new Bot(store, { prefix: PREFIX, dataDir: DATA_DIR, protegidos: PROTEGIDOS });
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

const estado = { conectado: false, codigo: null, codigoEm: 0, qr: null, aviso: 'Iniciando...' };
let sockAtual = null;
let reconectando = false;

// ---------- admin de grupo (com cache) ----------
const cacheAdmins = new Map(); // chatId -> { em, admins:Set }
async function ehAdmin(sock, chatId, senderId) {
  try {
    let c = cacheAdmins.get(chatId);
    if (!c || Date.now() - c.em > 60_000) {
      const meta = await sock.groupMetadata(chatId);
      const admins = new Set();
      for (const p of meta.participants) {
        if (p.admin) [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean).forEach((x) => admins.add(x));
      }
      c = { em: Date.now(), admins };
      cacheAdmins.set(chatId, c);
    }
    return c.admins.has(senderId);
  } catch (e) {
    return false;
  }
}

// ids (para marcar) de todos os admins do grupo, sem o próprio bot
async function listarAdmins(sock, chatId) {
  try {
    const meta = await sock.groupMetadata(chatId);
    const eu = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map((x) => x.split(':')[0].split('@')[0]));
    return meta.participants
      .filter((p) => p.admin && !eu.has(String(p.id).split(':')[0].split('@')[0]))
      .map((p) => p.id);
  } catch (e) {
    return [];
  }
}

// ---------- processamento em fila (garante a ordem das mensagens) ----------
let fila = Promise.resolve();

// Se o bot roda no WhatsApp pessoal do dono, as mensagens que ELE digita também chegam
// como "fromMe". Ignoramos só as que o próprio bot enviou (guardamos os ids).
const enviados = new Set();
function lembrarEnviado(res) {
  const id = res?.key?.id;
  if (!id) return;
  enviados.add(id);
  if (enviados.size > 500) enviados.delete(enviados.values().next().value);
}

// Abre os "embrulhos" do WhatsApp (mensagens temporárias, visualização única)
function desembrulhar(msg) {
  let atual = msg;
  for (let i = 0; i < 4 && atual; i++) {
    const dentro =
      atual.ephemeralMessage?.message ||
      atual.viewOnceMessage?.message ||
      atual.viewOnceMessageV2?.message ||
      atual.documentWithCaptionMessage?.message;
    if (!dentro) break;
    atual = dentro;
  }
  return atual || {};
}

const ehImagem = (msg) =>
  !!msg.imageMessage || (msg.documentMessage?.mimetype || '').startsWith('image/');

// Extrai do WhatsApp: texto, se tem imagem (print), menções (@fulano) e a mensagem citada.
function extrair(mensagem) {
  const msg = desembrulhar(mensagem);
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    '';
  const ctxInfo =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    null;
  const mentions = ctxInfo?.mentionedJid || [];
  let quoted = null;
  if (ctxInfo?.stanzaId) {
    quoted = {
      id: ctxInfo.stanzaId,
      senderId: ctxInfo.participant || null,
      temImagem: ctxInfo.quotedMessage ? ehImagem(desembrulhar(ctxInfo.quotedMessage)) : false,
    };
  }
  return { text, temImagem: ehImagem(msg), mentions, quoted };
}


// ---------- vídeo do gol (Puskas) ----------
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const numero = (x) => (x && typeof x.toNumber === 'function' ? x.toNumber() : Number(x) || 0);

// Acha o vídeo na própria mensagem (legenda "/puskas") ou na mensagem citada (respondeu ao vídeo)
function acharVideo(m, chatId) {
  const msg = desembrulhar(m.message);
  if (msg.videoMessage) {
    return { waMsg: m, id: m.key.id, autor: null, tamanho: numero(msg.videoMessage.fileLength) };
  }
  const ci = msg.extendedTextMessage?.contextInfo || null;
  const q = ci?.quotedMessage ? desembrulhar(ci.quotedMessage) : null;
  if (q?.videoMessage && ci.stanzaId) {
    return {
      waMsg: { key: { remoteJid: chatId, id: ci.stanzaId, participant: ci.participant, fromMe: false }, message: ci.quotedMessage },
      id: ci.stanzaId, autor: ci.participant || null, tamanho: numero(q.videoMessage.fileLength),
    };
  }
  return null;
}

// Baixa o vídeo do gol pra pasta de dados. Retorna { video } ou { erro }.
async function baixarVideoDoGol(sock, m, chatId) {
  const v = acharVideo(m, chatId);
  if (!v) return {};
  if (v.tamanho > MAX_VIDEO_BYTES) return { erro: 'Esse vídeo é grande demais (máx. 40 MB). Mande um menor.' };
  try {
    const buffer = await downloadMediaMessage(v.waMsg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    const rel = path.join('puskas', `${v.id.replace(/[^\w-]/g, '')}.mp4`);
    fs.mkdirSync(path.join(DATA_DIR, 'puskas'), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, rel), buffer);
    return { video: { arquivo: rel, id: v.id, autor: v.autor } };
  } catch (e) {
    console.error('Falha ao baixar o vídeo do gol:', e.message);
    return { erro: 'Não consegui baixar esse vídeo. Tente mandar de novo.' };
  }
}

// Fecha (só admins falam) ou abre o grupo. O bot precisa ser admin do grupo.
async function mudarGrupo(sock, chatId, acao, estadoGrupo) {
  if (acao === 'fechar') {
    try {
      const meta = await sock.groupMetadata(chatId);
      if (meta.announce) return; // já estava fechado: não mexe (e não reabre depois)
      await sock.groupSettingUpdate(chatId, 'announcement');
      estadoGrupo.fechadoPorMim = true;
    } catch (e) {
      console.error('Não consegui fechar o grupo:', e.message);
      const res = await sock.sendMessage(chatId, { text: '⚠️ Não consegui fechar o grupo (o bot precisa ser admin do grupo). Sigo mesmo assim.' });
      lembrarEnviado(res);
    }
  } else if (estadoGrupo.fechadoPorMim) {
    try {
      await sock.groupSettingUpdate(chatId, 'not_announcement');
      estadoGrupo.fechadoPorMim = false;
    } catch (e) {
      console.error('Não consegui reabrir o grupo:', e.message);
    }
  }
}

// ---------- jogos no privado (Cidade Dorme, Adivinha o Lugar) ----------
// formas (ids equivalentes: @lid, @s.whatsapp.net...) de um participante do grupo que bate com `id`
async function participanteDe(sock, chatId, id) {
  try {
    const meta = await sock.groupMetadata(chatId);
    const alvo = String(id).split('@')[0].split(':')[0];
    for (const p of meta.participants) {
      const formas = [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean);
      if (formas.some((f) => String(f).split('@')[0].split(':')[0] === alvo)) return formas;
    }
  } catch (e) { /* segue com o id que tem */ }
  return [id];
}

// jid onde mandar a mensagem privada: prefere o número de telefone
async function jidPrivado(sock, chatId, id) {
  const formas = await participanteDe(sock, chatId, id);
  const tel = formas.find((f) => String(f).endsWith('@s.whatsapp.net'));
  return String(tel || id).replace(/:\d+@/, '@');
}

async function enviarRespostas(sock, respostas) {
  const estadoGrupo = { fechadoPorMim: false };
  const chatId = respostas[0]?.chatId;
  try {
    for (const r of respostas) {
      if (r.grupo) { await mudarGrupo(sock, r.chatId, r.grupo, estadoGrupo); continue; }
      if (r.castigo) { await aplicarCastigo(sock, r.chatId, r.castigo); continue; }
      if (r.privadoPara) {
        // mensagem no privado de um jogador; se não conseguir, avisa no grupo
        try {
          const alvo = await jidPrivado(sock, r.chatId, r.privadoPara);
          lembrarEnviado(await sock.sendMessage(alvo, { text: r.text }));
          await new Promise((ok) => setTimeout(ok, 700)); // sem rajada de privados
        } catch (e) {
          console.error('Não consegui mandar no privado:', e.message);
          if (r.falhaDM) lembrarEnviado(await sock.sendMessage(r.chatId, { text: r.falhaDM, mentions: [r.privadoPara] }));
        }
        continue;
      }
      if (r.admins) {
        const adm = await listarAdmins(sock, r.chatId);
        if (adm.length) {
          r.text += `\n\n👮 ${adm.map((x) => '@' + x.split('@')[0].split(':')[0]).join(' ')}`;
          r.mentions = [...(r.mentions || []), ...adm];
        }
      }
      if (r.todos) {
        // marca todo mundo do grupo sem poluir o texto (todos recebem a notificação)
        try {
          const meta = await sock.groupMetadata(r.chatId);
          const meu = sock.user?.id ? jidNormalizedUser(sock.user.id).split('@')[0] : '';
          const ids = meta.participants.map((p) => p.id).filter((id) => id.split('@')[0].split(':')[0] !== meu);
          r.mentions = [...new Set([...(r.mentions || []), ...ids])];
        } catch (e) { /* sem a lista, segue só com as marcações que já tem */ }
      }
      let res;
      if (r.video) {
        const buffer = fs.readFileSync(r.video.arquivo);
        res = await sock.sendMessage(r.chatId, { video: buffer, caption: r.text, mentions: r.mentions, mimetype: 'video/mp4' });
        await new Promise((ok) => setTimeout(ok, 1500)); // um de cada vez, sem atropelar
      } else {
        res = await sock.sendMessage(r.chatId, { text: r.text, mentions: r.mentions });
      }
      lembrarEnviado(res);
      if (r.onSent) { r.onSent(res?.key?.id); store.salvar(); }
    }
  } finally {
    // se deu erro no meio do caminho, não deixa o grupo fechado
    if (estadoGrupo.fechadoPorMim && chatId) await mudarGrupo(sock, chatId, 'abrir', estadoGrupo);
  }
}

// atendente de vendas do Estúdio Digital (só conversas privadas; desligado se VENDAS_ATIVO != sim)
const vendas = criarVendas({
  dataDir: DATA_DIR,
  lembrarEnviado,
  gerarId: () => (baileys.generateMessageIDV2 || baileys.generateMessageID)(sockAtual?.user?.id),
  baixar: (m, sock) => downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }),
  obterSock: () => (estado.conectado ? sockAtual : null),
});
vendas.iniciarLembretes();

const boasVindas = criarBoasVindas({ lembrarEnviado });
// prazos dos jogos (quiz, cidade dorme, lugares): passado o tempo, o jogo avança sozinho
bot.jogos.agendar = (ms, fn) => {
  setTimeout(async () => {
    try {
      const rs = fn();
      if (rs && rs.length && estado.conectado && sockAtual) await enviarRespostas(sockAtual, rs);
    } catch (e) {
      console.error('[jogos] erro no prazo:', e.message);
    }
  }, ms);
};
let jogosRearmados = false;
const vigia = criarVigia({ bot, store, lembrarEnviado });
const { aplicarCastigo, varrerCastigos, varrerTodos, vigiarDarAdmin } = vigia;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function processar(sock, m) {
  if (!m.message) return;
  if (m.key.fromMe && enviados.has(m.key.id)) return;
  const chatId = m.key.remoteJid;
  // comando de jogo no privado (/matar, /salvar, /investigar, /meupapel, /meulugar) de quem está jogando: vai pro jogo, não pro atendente
  if (!m.key.fromMe && chatId && !chatId.endsWith('@g.us') && !chatId.endsWith('@broadcast')) {
    try {
      const texto = (extrair(m.message).text || '').trim();
      const chats = texto.startsWith(PREFIX) ? bot.jogos.chatsComPrivado() : [];
      if (chats.length) {
        const tentativas = [];
        for (const c of chats) tentativas.push({ chatId: c, formas: await participanteDe(sock, c, chatId) });
        const rs = bot.privado({ tentativas, text: '/' + texto.slice(PREFIX.length) }); // o jogo sempre lê com "/"
        if (rs) { await enviarRespostas(sock, rs); return; }
      }
    } catch (e) {
      console.error('[jogos] erro no privado:', e.message);
    }
  }
  // conversa privada: só o atendente de vendas (se ligado com VENDAS_ATIVO=sim). Grupos não passam por aqui.
  if (vendas.ativo && vendas.ehPrivado(chatId)) {
    vendas.receber(sock, m).catch((e) => console.error('[vendas] erro:', e.message));
    return;
  }
  if (!chatId || !chatId.endsWith('@g.us')) return; // o bot do campeonato só funciona em grupos
  const meuId = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const senderId = m.key.participant || m.participant || (m.key.fromMe ? meuId : null);
  if (!senderId) return;

  // reação (emoji) a uma mensagem: conta como voto na votação do Puskas
  const reacao = desembrulhar(m.message).reactionMessage;
  if (reacao) {
    const msgId = reacao.key?.id;
    console.log(`Reação recebida: "${reacao.text || '(removida)'}" na mensagem ${msgId}`);
    bot.reacao({ chatId, senderId, msgId, emoji: reacao.text || '' });
    return;
  }

  // conta as mensagens do dia (texto, imagem, áudio, figurinha...) pro /maisgay
  const corpo = desembrulhar(m.message);
  if (['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'contactMessage', 'locationMessage', 'pollCreationMessage'].some((k) => corpo[k])) {
    bot.contarMensagem(chatId, senderId);
  }

  const { text, temImagem, mentions, quoted } = extrair(m.message);
  if (!text && !temImagem) return;

  // castigo: se alguém mandar o comando do outro bot pra dar admin a quem está de castigo, a gente tira de volta
  vigiarDarAdmin(sock, { chatId, text, mentions, quoted });

  const comando = text.trim().startsWith(PREFIX);
  // o dono da conta (quando ele mesmo digita) sempre é admin do bot
  const isAdmin = m.key.fromMe ? true : comando ? await ehAdmin(sock, chatId, senderId) : false;
  // /puskas com vídeo (na legenda ou respondendo a um vídeo): baixa antes de passar pro bot
  let video = null;
  let videoErro = null;
  if (comando && text.trim().toLowerCase().startsWith(PREFIX + 'puskas')) {
    const r = await baixarVideoDoGol(sock, m, chatId);
    video = r.video || null;
    videoErro = r.erro || null;
  }
  const respostas = bot.handle({
    chatId, senderId, senderName: m.pushName, text, isAdmin,
    id: m.key.id, temImagem, mentions, quoted, video, videoErro,
  });
  await enviarRespostas(sock, respostas);
}

// ---------- conexão ----------
async function conectar() {
  const authDir = path.join(DATA_DIR, 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) { /* usa a versão padrão da biblioteca */ }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sockAtual = sock;
  let codigoPedido = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr && !sock.authState.creds.registered) {
      if (BOT_NUMBER && !codigoPedido) {
        codigoPedido = true;
        try {
          const codigo = await sock.requestPairingCode(BOT_NUMBER);
          estado.codigo = codigo;
          estado.codigoEm = Date.now();
          estado.aviso = 'Digite o código no WhatsApp do bot.';
          console.log(`\n>>> CÓDIGO DE PAREAMENTO: ${codigo}\n`);
        } catch (e) {
          estado.aviso = 'Falha ao gerar o código: ' + e.message;
          console.error(e);
        }
      } else if (!BOT_NUMBER) {
        estado.qr = qr;
        estado.aviso = 'Defina BOT_NUMBER pra parear por código (ou use o QR nos logs).';
        try { require('qrcode-terminal').generate(qr, { small: true }); } catch (e) { /* ok */ }
      }
    }

    if (connection === 'open') {
      estado.conectado = true;
      estado.codigo = null;
      estado.qr = null;
      estado.aviso = 'Conectado ✅';
      console.log('✅ Conectado ao WhatsApp.');
      varrerTodos(sock).catch(() => {}); // confere os castigos logo ao conectar
      if (!jogosRearmados) { jogosRearmados = true; bot.jogos.rearmar(); } // retoma os prazos de jogos que estavam rolando
    }

    if (connection === 'close') {
      estado.conectado = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Conexão fechada. Código:', code);
      if (code === DisconnectReason.loggedOut) {
        estado.aviso = 'Sessão encerrada no WhatsApp. Gerando novo pareamento...';
        fs.rmSync(authDir, { recursive: true, force: true });
      }
      agendarReconexao();
    }
  });

  // alguém foi promovido a admin: se estiver de castigo, tira de novo (vale pra qualquer um que promover, inclusive outro bot)
  sock.ev.on('group-participants.update', (ev) => {
    // gente nova no grupo: foto + boas-vindas
    boasVindas.receber(sock, ev).catch((e) => console.error('[boas-vindas] erro:', e.message));
  });
  sock.ev.on('group-participants.update', ({ id, action }) => {
    if (action !== 'promote') return;
    if (!bot.castigo.ativosDoChat(id).length) return;
    dormir(1500).then(() => varrerCastigos(sock, id, 'promoção')).catch(() => {});
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      fila = fila.then(() => processar(sock, m)).catch((e) => console.error('Erro na fila:', e));
    }
  });
}

function agendarReconexao() {
  if (reconectando) return;
  reconectando = true;
  setTimeout(async () => {
    reconectando = false;
    try { await conectar(); } catch (e) { console.error('Falha ao reconectar:', e); agendarReconexao(); }
  }, 3000);
}

// ---------- página web ----------
function pagina() {
  const codigo = estado.codigo
    ? `<p class="cod">${estado.codigo}</p>
       <ol>
         <li>Abra o WhatsApp do <b>número do bot</b></li>
         <li>Toque em <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b></li>
         <li>Escolha <b>Conectar com número de telefone</b></li>
         <li>Digite o código acima</li>
       </ol>
       <p><small>O código vale por pouco tempo. Se expirar, aguarde a página atualizar sozinha.</small></p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Bot de Campeonato</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;padding:0 16px;line-height:1.5}
 .cod{font-size:42px;letter-spacing:6px;font-weight:700;text-align:center;background:#f2f2f2;border-radius:12px;padding:16px}
 .ok{color:#0a7a2f}.no{color:#b3261e}
</style></head><body>
<h2>⚽ Bot de Campeonato</h2>
<p class="${estado.conectado ? 'ok' : 'no'}"><b>${estado.conectado ? 'Conectado ✅' : 'Desconectado'}</b></p>
<p>${estado.aviso}</p>
${codigo}
</body></html>`;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    if (url.searchParams.get('key') !== ADMIN_KEY) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pagina());
  })
  .listen(PORT, () => console.log(`Página de status na porta ${PORT}`));

conectar().catch((e) => {
  console.error('Erro ao iniciar:', e);
  agendarReconexao();
});

// a cada 2 minutos confere os castigos (rede de segurança, caso algum aviso do WhatsApp se perca)
setInterval(() => {
  if (sockAtual && estado.conectado) varrerTodos(sockAtual).catch(() => {});
}, 2 * 60_000).unref();

process.on('SIGTERM', () => { store.salvarAgora(); vendas.salvarAgora(); process.exit(0); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
