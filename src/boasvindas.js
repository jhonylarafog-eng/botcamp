// Boas-vindas: quando entra gente nova no grupo, o bot manda a foto de perfil da pessoa
// (se ela deixar ver) com uma mensagem de boas-vindas marcando ela.
// Desliga com a variável BOAS_VINDAS=nao.

const MENSAGENS = [
  (t) => `👋 Bem-vindo(a) ao grupo, ${t}! 🎉\nFica à vontade, é só chegar e participar!`,
  (t) => `🎉 Chegou mais um! Bem-vindo(a) ao grupo, ${t}! 👋\nBora jogar!`,
  (t) => `👋 Seja bem-vindo(a), ${t}! 🔥\nO grupo agora tá mais completo.`,
];

const nomeDe = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || p?.phoneNumber || null);
const tag = (id) => `@${String(id).split('@')[0].split(':')[0]}`;
const chave = (id) => String(id).split('@')[0].split(':')[0];

function criarBoasVindas({
  lembrarEnviado = () => {},
  ligado = () => process.env.BOAS_VINDAS !== 'nao',
  buscar = (...a) => fetch(...a),
  esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  agora = () => Date.now(),
  sorteio = Math.random,
} = {}) {
  const recentes = new Map(); // chat|pessoa -> quando (evita boas-vindas duplicadas)

  async function foto(sock, jid) {
    try {
      const url = await sock.profilePictureUrl(jid, 'image');
      if (!url) return null;
      const r = await buscar(url);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length ? buf : null;
    } catch (e) {
      return null; // sem foto ou privacidade: manda só o texto
    }
  }

  async function receber(sock, { id: chatId, action, participants }) {
    if (action !== 'add' || !ligado() || !chatId || !chatId.endsWith('@g.us')) return;
    const eu = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(chave));
    const novos = (participants || []).map(nomeDe).filter(Boolean).filter((j) => !eu.has(chave(j)));
    for (const jid of novos) {
      const k = `${chatId}|${chave(jid)}`;
      if (recentes.has(k) && agora() - recentes.get(k) < 60_000) continue;
      recentes.set(k, agora());
      const texto = MENSAGENS[Math.floor(sorteio() * MENSAGENS.length)](tag(jid));
      try {
        const buf = await foto(sock, jid);
        const res = buf
          ? await sock.sendMessage(chatId, { image: buf, caption: texto, mentions: [jid] })
          : await sock.sendMessage(chatId, { text: texto, mentions: [jid] });
        lembrarEnviado(res);
      } catch (e) {
        console.error('Não consegui mandar as boas-vindas:', e.message);
      }
      if (novos.length > 1) await esperar(1500);
    }
  }

  return { receber };
}

module.exports = { criarBoasVindas, MENSAGENS };
