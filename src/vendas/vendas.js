// Atendente de vendas do Estúdio Digital, SÓ em conversa privada.
// Os grupos do campeonato nunca passam por aqui (ver o gancho em whatsapp.js).
//
// Fluxo: cliente escreve/manda áudio/foto → espera alguns segundos (juntando mensagens seguidas)
// → áudio vira texto (Groq/Whisper) → Claude responde seguindo prompt.js → resposta sai em
// mensagens curtas com "digitando…" → se o cliente pagou ou precisa do dono, avisa no Telegram
// e para de responder naquela conversa. Se o dono responder pelo celular, o atendente também para.
//
// Variáveis de ambiente (tudo opcional, exceto as duas primeiras pra ligar):
//   VENDAS_ATIVO=sim        liga o atendente (qualquer outro valor = desligado)
//   ANTHROPIC_API_KEY       chave da API do Claude (pago, precisa de cartão)
//   GEMINI_API_KEY          chave do Gemini (plano grátis, sem cartão; também ouve áudio e lê imagem)
//   VENDAS_PROVEDOR         claude ou gemini. Se vazio: claude quando houver ANTHROPIC_API_KEY, senão gemini
//   VENDAS_MODELO_GEMINI    modelo do Gemini (padrão: gemini-flash-latest)
//   GROQ_API_KEY            chave do Groq (transcrever áudio). Sem ela, usa o Gemini; sem nenhum, o cliente é convidado a escrever
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   avisos pro dono
//   PIX_CHAVE, PIX_NOME     chave Pix que o atendente manda ao cliente
//   VENDAS_MODELO           modelo do Claude (padrão: claude-haiku-5-5)
//   VENDAS_IGNORAR          números (só dígitos, com DDI) que o atendente nunca atende, separados por vírgula
//   VENDAS_ESPERA_MS        quanto esperar por mais mensagens antes de responder (padrão 7000)
//   VENDAS_LIMITE_DIA       máximo de respostas por dia no total (padrão 400)
//   VENDAS_LIMITE_CHAT_DIA  máximo de respostas por dia por cliente (padrão 80)
//   VENDAS_LEMBRETES=nao    desliga os lembretes pra quem sumiu (padrão: ligados)
//   VENDAS_LEMBRETE1_HORAS  quanto esperar antes do 1º lembrete (padrão 3)
//   VENDAS_LEMBRETE2_HORAS  quanto esperar depois do 1º pro 2º lembrete (padrão 24)
//   VENDAS_LEMBRETE_MAX     máximo de lembretes por cliente (padrão 2)
//   VENDAS_LEMBRETES_DIA    máximo de lembretes por dia no total (padrão 30)

const fs = require('fs');
const path = require('path');
const { montarPrompt } = require('./prompt');

const API_CLAUDE = 'https://api.anthropic.com/v1/messages';
const API_GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions';
const API_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_HISTORICO = 40;
const MAX_IMAGEM_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_SEG = 300;
const TAGS = /\[\[(PAGAMENTO|HUMANO)(?:\|([\s\S]*?))?\]\]/g;

const PARAR = /\b(n[aã]o quero|n[aã]o tenho interesse|sem interesse|n[aã]o preciso|pare\b|para de (me )?(mandar|enviar|chamar)|me (tira|tire|remove|remova)|n[aã]o me (chame|mande|envie)|desisti|cancela)/i;

// Textos dos lembretes (só pra quem já conversou e sumiu). {n} = primeiro nome, quando dá pra usar.
const LEMBRETES = [
  [
    'Opa{, n}! Seu pedido tá te aguardando por aqui 😊 Vamos dar continuidade?',
    '{N}, tudo certo? Ainda dá pra fazer o seu pedido. Se quiser seguir, é só me falar que eu já organizo tudo por aqui!',
  ],
  [
    '{N}, passando só pra avisar que o seu pedido continua de pé por aqui. Se ainda tiver interesse, é só me chamar, tá? Se não for o momento, sem problema!',
    'Oi{ n}! Ainda consigo fazer o seu pedido. Se quiser seguir, me chama aqui. Se não for agora, tudo bem, qualquer coisa é só falar!',
  ],
];
const primeiroNome = (nome) => {
  const p = String(nome || '').trim().split(/\s+/)[0];
  return /^[\p{L}]{2,15}$/u.test(p) ? p : '';
};

const dormirPadrao = (ms) => new Promise((ok) => setTimeout(ok, ms));
const soDigitos = (x) => String(x || '').replace(/\D/g, '');

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

// Diz o que é a mensagem: { tipo: 'texto'|'audio'|'imagem'|'video'|'outro', texto } ou null (reação, aviso interno...)
function classificar(mensagem) {
  const msg = desembrulhar(mensagem);
  const texto = msg.conversation || msg.extendedTextMessage?.text || '';
  if (texto) return { tipo: 'texto', texto };
  if (msg.audioMessage) return { tipo: 'audio', texto: '', seg: Number(msg.audioMessage.seconds) || 0 };
  if (msg.imageMessage) return { tipo: 'imagem', texto: msg.imageMessage.caption || '', mime: msg.imageMessage.mimetype };
  if ((msg.documentMessage?.mimetype || '').startsWith('image/')) {
    return { tipo: 'imagem', texto: msg.documentMessage.caption || '', mime: msg.documentMessage.mimetype };
  }
  if (msg.videoMessage) return { tipo: 'video', texto: msg.videoMessage.caption || '' };
  if (msg.documentMessage || msg.stickerMessage || msg.locationMessage || msg.contactMessage) {
    return { tipo: 'outro', texto: msg.documentMessage?.caption || '' };
  }
  return null; // reação, mensagem de protocolo etc.
}

function tirarMarcacoes(texto) {
  const acoes = [];
  const limpo = texto.replace(TAGS, (_, tipo, motivo) => {
    acoes.push({ tipo, motivo: (motivo || '').trim() });
    return '';
  });
  return { texto: limpo.trim(), acoes };
}

// Quebra a resposta em até 3 mensagens (parágrafos), como uma pessoa mandaria.
function dividir(texto) {
  const partes = texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (partes.length <= 3) return partes;
  return [partes[0], partes[1], partes.slice(2).join('\n\n')];
}

function criarVendas(opcoes = {}) {
  const env = opcoes.env || process.env;
  const fetchImpl = opcoes.fetch || globalThis.fetch;
  const dormir = opcoes.dormir || dormirPadrao;
  const log = opcoes.log || console;
  const agora = opcoes.agora || (() => new Date());
  const dataDir = opcoes.dataDir || path.join(process.cwd(), 'dados');
  const baixar = opcoes.baixar; // async (m, sock) => Buffer
  const gerarId = opcoes.gerarId || (() => 'VND' + Math.random().toString(36).slice(2, 12).toUpperCase());

  const ativo = String(env.VENDAS_ATIVO || '').toLowerCase() === 'sim';
  const modelo = env.VENDAS_MODELO || 'claude-haiku-5-5';
  const modeloGemini = env.VENDAS_MODELO_GEMINI || 'gemini-flash-latest';
  const provedor = String(env.VENDAS_PROVEDOR || (env.ANTHROPIC_API_KEY ? 'claude' : env.GEMINI_API_KEY ? 'gemini' : 'claude')).toLowerCase();
  const nomeChave = provedor === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  const esperaMs = env.VENDAS_ESPERA_MS !== undefined ? Number(env.VENDAS_ESPERA_MS) : 7000;
  const limiteDia = Number(env.VENDAS_LIMITE_DIA || 400);
  const limiteChatDia = Number(env.VENDAS_LIMITE_CHAT_DIA || 80);
  const idadeMaxMs = Number(env.VENDAS_IDADE_MAX_MIN || 240) * 60_000;
  const lembretesOn = String(env.VENDAS_LEMBRETES || 'sim').toLowerCase() !== 'nao';
  const lem1Ms = Number(env.VENDAS_LEMBRETE1_HORAS || 3) * 3_600_000;
  const lem2Ms = Number(env.VENDAS_LEMBRETE2_HORAS || 24) * 3_600_000;
  const lemMax = Number(env.VENDAS_LEMBRETE_MAX || 2);
  const lemDia = Number(env.VENDAS_LEMBRETES_DIA || 30);
  const lemIdadeMaxMs = 4 * 24 * 3_600_000;
  const ignorar = new Set((env.VENDAS_IGNORAR || '').split(/[,\s]+/).map(soDigitos).filter(Boolean));

  const arquivo = path.join(dataDir, 'vendas.json');
  let estado = { chats: {}, dia: '', totalDia: 0 };
  try {
    if (fs.existsSync(arquivo)) estado = { ...estado, ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) };
  } catch (e) {
    log.error('[vendas] arquivo de conversas ilegível, começando vazio:', e.message);
  }

  let timerSalvar = null;
  function salvar() {
    if (timerSalvar) return;
    timerSalvar = setTimeout(() => { timerSalvar = null; salvarAgora(); }, 500);
    if (timerSalvar.unref) timerSalvar.unref();
  }
  function salvarAgora() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = arquivo + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(estado));
      fs.renameSync(tmp, arquivo);
    } catch (e) {
      log.error('[vendas] não consegui salvar:', e.message);
    }
  }

  const hoje = () => agora().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  function chatDe(jid) {
    const c = estado.chats[jid] || (estado.chats[jid] = { historico: [], pausado: false, motivo: '', nome: '', diaChat: '', respostasDia: 0, ultimoEnvio: 0 });
    return c;
  }
  function virouODia() {
    const d = hoje();
    if (estado.dia !== d) {
      estado.dia = d;
      estado.totalDia = 0;
      estado.alertaLimite = false;
      estado.lembretesDia = 0;
      for (const c of Object.values(estado.chats)) { c.respostasDia = 0; }
    }
  }

  const meusIds = new Set();
  function lembrarId(id) {
    meusIds.add(id);
    if (meusIds.size > 500) meusIds.delete(meusIds.values().next().value);
  }

  // ---------- avisos pro dono ----------
  const avisosEnviados = {};
  async function avisarDono(texto, chave) {
    if (chave) {
      const ult = avisosEnviados[chave] || 0;
      if (agora().getTime() - ult < 30 * 60_000) return;
      avisosEnviados[chave] = agora().getTime();
    }
    const token = env.TELEGRAM_BOT_TOKEN;
    const chat = env.TELEGRAM_CHAT_ID;
    if (!token || !chat) {
      log.error('[vendas] Telegram não configurado; aviso perdido (sem conteúdo no log).');
      return;
    }
    try {
      const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
      });
      if (!r.ok) log.error('[vendas] Telegram respondeu', r.status);
    } catch (e) {
      log.error('[vendas] falha ao avisar no Telegram:', e.message);
    }
  }

  function contato(jid, nome) {
    const quem = nome ? `${nome}` : 'cliente';
    if (jid.endsWith('@s.whatsapp.net')) return `${quem}: https://wa.me/${soDigitos(jid.split('@')[0])}`;
    return `${quem} (abra a conversa dele no WhatsApp)`;
  }

  // ---------- Groq: áudio → texto ----------
  // ---------- Gemini: áudio → texto (usado quando não há chave do Groq) ----------
  async function transcreverGemini(buffer) {
    try {
      const texto = await chamarGemini({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'audio/ogg', data: buffer.toString('base64') } },
          { text: 'Transcreva fielmente, em português do Brasil, o que a pessoa fala neste áudio. Responda só com a transcrição, sem comentários.' },
        ] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0 },
      });
      return texto.trim() || null;
    } catch (e) {
      log.error('[vendas] falha ao transcrever áudio (Gemini):', e.message);
      return null;
    }
  }

  async function transcrever(buffer) {
    if (!env.GROQ_API_KEY) return env.GEMINI_API_KEY ? transcreverGemini(buffer) : null;
    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', 'pt');
      form.append('temperature', '0');
      form.append('response_format', 'json');
      form.append('prompt', 'Conversa sobre pedido de vídeo ou imagem feitos com IA, Estúdio Digital, Pix, Instagram, TikTok.');
      const r = await fetchImpl(API_GROQ, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form });
      if (!r.ok) throw new Error('Groq ' + r.status);
      const j = await r.json();
      return (j.text || '').trim() || null;
    } catch (e) {
      log.error('[vendas] falha ao transcrever áudio:', e.message);
      return null;
    }
  }

  // ---------- IA: Claude ou Gemini ----------
  const sistemaAtual = () => montarPrompt({
    pixChave: env.PIX_CHAVE,
    pixNome: env.PIX_NOME,
    agora: agora().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }),
  });

  // Uma chamada ao Gemini. Devolve o texto da resposta ou lança erro.
  async function chamarGemini(corpo) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const r = await fetchImpl(`${API_GEMINI}/${modeloGemini}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`Gemini ${r.status} ${txt.slice(0, 160)}`);
      }
      const j = await r.json();
      const cand = (j.candidates || [])[0];
      const texto = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('\n').trim();
      if (!texto) throw new Error('Gemini sem texto (' + ((cand && cand.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || 'vazio') + ')');
      return texto;
    } finally {
      clearTimeout(t);
    }
  }

  // Converte as mensagens (formato do Claude) pro formato do Gemini.
  function paraGemini(mensagens) {
    return mensagens.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: (Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]).map((b) =>
        b.type === 'image' ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: b.text }),
    }));
  }

  async function perguntarGemini(mensagens) {
    const corpo = {
      systemInstruction: { parts: [{ text: sistemaAtual() }] },
      contents: paraGemini(mensagens),
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    };
    let ultimoErro;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await chamarGemini(corpo);
      } catch (e) {
        ultimoErro = e;
        if (tentativa === 0) await dormir(2500);
      }
    }
    throw ultimoErro;
  }

  const perguntarIA = (mensagens) => (provedor === 'gemini' ? perguntarGemini(mensagens) : perguntarClaude(mensagens));

  async function perguntarClaude(mensagens) {
    const sistema = sistemaAtual();
    let ultimoErro;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45_000);
        const r = await fetchImpl(API_CLAUDE, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelo, max_tokens: 700, system: sistema, messages: mensagens }),
        });
        clearTimeout(t);
        if (!r.ok) {
          const corpo = await r.text().catch(() => '');
          throw new Error(`Claude ${r.status} ${corpo.slice(0, 160)}`);
        }
        const j = await r.json();
        return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      } catch (e) {
        ultimoErro = e;
        if (tentativa === 0) await dormir(2000);
      }
    }
    throw ultimoErro;
  }

  // ---------- envio "humanizado" ----------
  async function enviar(sock, jid, texto) {
    const chat = chatDe(jid);
    for (const parte of dividir(texto)) {
      try { await sock.sendPresenceUpdate('composing', jid); } catch (e) { /* ok */ }
      await dormir(Math.min(5000, Math.max(1200, 600 + parte.length * 35)));
      const id = gerarId();
      lembrarId(id);
      chat.ultimoEnvio = agora().getTime();
      const res = await sock.sendMessage(jid, { text: parte }, { messageId: id });
      if (opcoes.lembrarEnviado) opcoes.lembrarEnviado(res);
      chat.ultimoEnvio = agora().getTime();
    }
    try { await sock.sendPresenceUpdate('paused', jid); } catch (e) { /* ok */ }
  }

  // ---------- fila por conversa ----------
  const pendentes = new Map(); // jid -> [{ m, c }]
  const timers = new Map();
  const filas = new Map();

  function naFila(jid, tarefa) {
    const anterior = filas.get(jid) || Promise.resolve();
    const proxima = anterior.then(tarefa).catch((e) => log.error('[vendas] erro:', e.message));
    filas.set(jid, proxima);
    return proxima;
  }

  function ehPrivado(jid) {
    return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
  }

  // Chamado pelo whatsapp.js pra toda mensagem de conversa privada. Volta rápido (só enfileira).
  async function receber(sock, m) {
    if (!ativo || !m.message) return;
    const jid = m.key.remoteJid;
    const c = classificar(m.message);
    if (!c) return;

    // mensagem do próprio dono (digitada no celular do chip)
    if (m.key.fromMe) {
      if (meusIds.has(m.key.id)) return;
      const chat = chatDe(jid);
      if (agora().getTime() - (chat.ultimoEnvio || 0) < 8000) return; // eco de algo que o atendente acabou de mandar
      if (c.tipo === 'texto' && c.texto.trim().toLowerCase() === '/ia') {
        chat.pausado = false; chat.motivo = '';
        salvar();
        try { await sock.sendMessage(jid, { text: '🤖 Atendente automático ligado de novo nesta conversa.' }, { messageId: (() => { const id = gerarId(); lembrarId(id); return id; })() }); } catch (e) { /* ok */ }
        return;
      }
      if (!chat.pausado) {
        chat.pausado = true; chat.motivo = 'dono assumiu';
        salvar();
      }
      return;
    }

    // mensagem do cliente
    const numero = soDigitos(jid.split('@')[0]);
    if (jid.endsWith('@s.whatsapp.net') && ignorar.has(numero)) return;
    if (c.tipo === 'texto' && c.texto.trim().startsWith('/')) return; // comando de campeonato mandado no privado
    const ts = Number(m.messageTimestamp?.toNumber ? m.messageTimestamp.toNumber() : m.messageTimestamp) || 0;
    if (ts && agora().getTime() - ts * 1000 > idadeMaxMs) return; // mensagem velha (bot ficou fora do ar)

    const chat = chatDe(jid);
    if (m.pushName) chat.nome = m.pushName;
    chat.lembretes = 0; chat.ultimoLembrete = 0; // o cliente voltou a falar: zera a contagem
    if (c.tipo === 'texto') chat.parar = PARAR.test(c.texto);
    if (chat.pausado) return;

    const lista = pendentes.get(jid) || [];
    lista.push({ m, c });
    pendentes.set(jid, lista);
    clearTimeout(timers.get(jid));
    const t = setTimeout(() => {
      timers.delete(jid);
      const itens = pendentes.get(jid) || [];
      pendentes.delete(jid);
      if (itens.length) naFila(jid, () => responder(sock, jid, itens));
    }, esperaMs);
    if (t.unref) t.unref();
    timers.set(jid, t);
  }

  async function responder(sock, jid, itens) {
    const chat = chatDe(jid);
    if (chat.pausado) return;
    virouODia();

    if (!env[nomeChave]) {
      await avisarDono(`⚠️ Atendente de vendas ligado, mas falta a ${nomeChave} na Railway.`, 'sem-chave');
      return;
    }
    if (estado.totalDia >= limiteDia || chat.respostasDia >= limiteChatDia) {
      await avisarDono(`⚠️ Limite diário de respostas do atendente atingido (${estado.totalDia} no total). Parei de responder até amanhã.`, 'limite');
      return;
    }

    try { await sock.readMessages(itens.map((i) => i.m.key)); } catch (e) { /* ok */ }

    // monta o que o cliente mandou: texto/transcrição + imagens
    const blocos = [];
    const linhasHistorico = [];
    for (const { m, c } of itens) {
      let linha = '';
      if (c.tipo === 'texto') {
        linha = c.texto;
      } else if (c.tipo === 'audio') {
        let t = null;
        if (baixar && c.seg <= MAX_AUDIO_SEG) {
          try { t = await transcrever(await baixar(m, sock)); } catch (e) { log.error('[vendas] falha ao baixar áudio:', e.message); }
        }
        linha = t ? `[áudio do cliente] ${t}` : '[áudio do cliente que não foi possível ouvir]';
        if (t) chat.parar = PARAR.test(t);
      } else if (c.tipo === 'imagem') {
        linha = `[comprovante/imagem do cliente]${c.texto ? ' ' + c.texto : ''}`;
        try {
          const buf = baixar ? await baixar(m, sock) : null;
          const mime = /^image\/(jpeg|png|gif|webp)$/.test(c.mime || '') ? c.mime : 'image/jpeg';
          if (buf && buf.length <= MAX_IMAGEM_BYTES) {
            blocos.push({ type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } });
          }
        } catch (e) { log.error('[vendas] falha ao baixar imagem:', e.message); }
      } else if (c.tipo === 'video') {
        linha = `[cliente enviou um vídeo]${c.texto ? ' ' + c.texto : ''}`;
      } else {
        linha = `[cliente enviou um arquivo ou figurinha]${c.texto ? ' ' + c.texto : ''}`;
      }
      linhasHistorico.push(linha);
    }
    const textoNovo = linhasHistorico.join('\n');

    // histórico + mensagem nova (junta com a anterior se o cliente falou duas vezes seguidas sem resposta)
    const hist = chat.historico.slice();
    let textoCompleto = textoNovo;
    if (hist.length && hist[hist.length - 1].role === 'user') {
      textoCompleto = hist.pop().content + '\n' + textoNovo;
    }
    const mensagens = hist.map((h) => ({ role: h.role, content: h.content }));
    mensagens.push({ role: 'user', content: blocos.length ? [...blocos, { type: 'text', text: textoCompleto }] : textoCompleto });

    // guarda a fala do cliente já (imagens viram texto no histórico pra não pesar)
    chat.historico = [...hist, { role: 'user', content: textoCompleto }];
    salvar();

    let resposta;
    try {
      resposta = await perguntarIA(mensagens);
    } catch (e) {
      log.error(`[vendas] ${provedor} falhou:`, e.message);
      await avisarDono(`⚠️ O atendente não conseguiu responder um cliente (${contato(jid, chat.nome)}). Pode ser limite de uso ou crédito da API acabando. Responda você por enquanto.`, 'falha-ia');
      return;
    }

    const { texto, acoes } = tirarMarcacoes(resposta);
    chat.historico.push({ role: 'assistant', content: resposta });
    if (chat.historico.length > MAX_HISTORICO) {
      chat.historico = chat.historico.slice(-MAX_HISTORICO);
      while (chat.historico.length && chat.historico[0].role !== 'user') chat.historico.shift();
    }
    estado.totalDia += 1;
    chat.respostasDia += 1;
    salvar();

    if (texto) {
      try {
        await enviar(sock, jid, texto);
        chat.ultimaRespostaBot = agora().getTime();
        salvar();
      } catch (e) { log.error('[vendas] falha ao enviar:', e.message); }
    }

    for (const a of acoes) {
      chat.pausado = true;
      chat.motivo = a.tipo === 'PAGAMENTO' ? 'cliente disse que pagou' : 'precisa do dono';
      salvar();
      const quem = contato(jid, chat.nome);
      if (a.tipo === 'PAGAMENTO') {
        await avisarDono(`💰 Cliente diz que PAGOU\n${quem}\n\n${a.motivo || '(sem resumo)'}\n\nConfira no banco e assuma a conversa. O atendente já parou de responder ali.`);
      } else {
        await avisarDono(`🙋 Cliente precisa de você\n${quem}\n\nMotivo: ${a.motivo || '(não informado)'}\n\nO atendente já parou de responder ali. Para religar, escreva /ia nessa conversa.`);
      }
    }
  }

  // ---------- lembretes pra quem sumiu ----------
  // Só pra quem JÁ conversou com o atendente, não fechou, não foi passado pro dono e não pediu pra parar.
  // No máximo 2 lembretes por pessoa, só entre 9h e 20h (Brasília), poucos por vez.
  const horaSP = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(agora()));

  function elegivelLembrete(jid, chat) {
    if (!ehPrivado(jid) || chat.pausado || chat.parar) return false;
    if (jid.endsWith('@s.whatsapp.net') && ignorar.has(soDigitos(jid.split('@')[0]))) return false;
    if (pendentes.has(jid) || timers.has(jid)) return false;
    const h = chat.historico || [];
    if (!h.length || h[h.length - 1].role !== 'assistant' || !h.some((x) => x.role === 'user')) return false;
    const n = chat.lembretes || 0;
    if (n >= lemMax || !chat.ultimaRespostaBot) return false;
    const t = agora().getTime();
    if (t - chat.ultimaRespostaBot > lemIdadeMaxMs) return false;
    return n === 0 ? t - chat.ultimaRespostaBot >= lem1Ms : t - (chat.ultimoLembrete || 0) >= lem2Ms;
  }

  function textoLembrete(jid, chat, n) {
    const variantes = LEMBRETES[Math.min(n, LEMBRETES.length) - 1];
    const base = variantes[soDigitos(jid).length % variantes.length];
    const nome = primeiroNome(chat.nome);
    return base
      .replace('{, n}', nome ? `, ${nome}` : '')
      .replace('{ n}', nome ? ` ${nome}` : '')
      .replace('{N}', nome || 'Oi');
  }

  // Chamado a cada 10 minutos (e nos testes). Devolve quantos lembretes saíram.
  async function verificarLembretes() {
    const sock = opcoes.obterSock && opcoes.obterSock();
    if (!ativo || !lembretesOn || !sock) return 0;
    const h = horaSP();
    if (h < 9 || h >= 20) return 0;
    virouODia();
    let enviados = 0;
    for (const [jid, chat] of Object.entries(estado.chats)) {
      if (enviados >= 5 || (estado.lembretesDia || 0) >= lemDia) break;
      if (!elegivelLembrete(jid, chat)) continue;
      let saiu = false;
      await naFila(jid, async () => {
        if (!elegivelLembrete(jid, chat)) return;
        const n = (chat.lembretes || 0) + 1;
        const texto = textoLembrete(jid, chat, n);
        await enviar(sock, jid, texto);
        saiu = true;
        chat.lembretes = n;
        chat.ultimoLembrete = agora().getTime();
        chat.ultimaRespostaBot = agora().getTime();
        const ult = chat.historico[chat.historico.length - 1];
        ult.content = `${ult.content}\n\n[lembrete automático enviado: ${texto}]`;
        estado.lembretesDia = (estado.lembretesDia || 0) + 1;
        salvar();
      });
      if (saiu) {
        enviados += 1;
        await dormir(15_000 + Math.floor(Math.random() * 25_000)); // não manda tudo de uma vez
      }
    }
    return enviados;
  }

  function iniciarLembretes() {
    if (!ativo || !lembretesOn) return null;
    const t = setInterval(() => verificarLembretes().catch((e) => log.error('[vendas] lembretes:', e.message)), 10 * 60_000);
    if (t.unref) t.unref();
    return t;
  }

  return { ativo, provedor, ehPrivado, receber, salvarAgora, verificarLembretes, iniciarLembretes, _estado: () => estado };
}

module.exports = { criarVendas, classificar, tirarMarcacoes, dividir };
