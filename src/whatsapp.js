// Conector do WhatsApp (biblioteca Baileys) + página web de status/pareamento.
//
// Variáveis de ambiente:
//   BOT_NUMBER  número do WhatsApp do bot, só dígitos com DDI. Ex.: 5511999998888
//   ADMIN_KEY   senha da página de pareamento (abra  https://SEU-SITE/?key=SENHA )
//   DATA_DIR    pasta onde ficam login e dados (use um volume!). Padrão: ./dados
//   PORT        porta da página web. Padrão: 3000
//   PREFIX      prefixo dos comandos. Padrão: /

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidNormalizedUser } = baileys;

const { Store } = require('./store');
const { Bot } = require('./game');

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
const bot = new Bot(store, { prefix: PREFIX });
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

async function processar(sock, m) {
  if (!m.message) return;
  if (m.key.fromMe && enviados.has(m.key.id)) return;
  const chatId = m.key.remoteJid;
  if (!chatId || !chatId.endsWith('@g.us')) return; // só funciona em grupos
  const meuId = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const senderId = m.key.participant || m.participant || (m.key.fromMe ? meuId : null);
  if (!senderId) return;

  const msg = m.message;
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    '';
  if (!text) return;

  const comando = text.trim().startsWith(PREFIX);
  // o dono da conta (quando ele mesmo digita) sempre é admin do bot
  const isAdmin = m.key.fromMe ? true : comando ? await ehAdmin(sock, chatId, senderId) : false;
  const respostas = bot.handle({ chatId, senderId, senderName: m.pushName, text, isAdmin });
  for (const r of respostas) {
    const res = await sock.sendMessage(r.chatId, { text: r.text, mentions: r.mentions });
    lembrarEnviado(res);
  }
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

process.on('SIGTERM', () => { store.salvar(); process.exit(0); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
