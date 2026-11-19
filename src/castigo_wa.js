// Parte do castigo que conversa com o WhatsApp: tira o admin e vigia promoções.
// Separado do whatsapp.js pra poder ser testado com um "socket" de mentira.

const idsDe = (p) => [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean);
const usuarioDe = (id) => String(id || '').split('@')[0].split(':')[0];

// O outro bot (o que puxa campeonato) tem a lista de admins dele. Pra tirar a pessoa de lá, mandamos no grupo o
// mesmo comando que um admin usaria. Dá pra trocar por variável de ambiente se o outro bot mudar os comandos.
const CMD_TIRAR_ADMIN = process.env.CMD_TIRAR_ADMIN_OUTRO_BOT || '/removeadmin';
const CMD_DAR_ADMIN = process.env.CMD_DAR_ADMIN_OUTRO_BOT || '/addadmin';
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reDarAdmin = new RegExp(`^\\s*${escapar(CMD_DAR_ADMIN)}(?![\\w])`, 'i');

function criarVigia({ bot, store, lembrarEnviado = () => {}, esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  async function aplicarCastigo(sock, chatId, d) {
    const enviar = async (text, mentions = []) => lembrarEnviado(await sock.sendMessage(chatId, { text, mentions }));
    const falhar = async (msg) => { bot.castigo.remover(d.castigoId); store.salvar(); await enviar(msg); };
    try {
      const meta = await sock.groupMetadata(chatId);
      const alvo = usuarioDe(d.alvo);
      const p = meta.participants.find((x) => idsDe(x).some((i) => usuarioDe(i) === alvo));
      if (!p) return await falhar('⚠️ Não achei essa pessoa no grupo.');
      const meu = sock.user?.id ? usuarioDe(sock.user.id) : null;
      if (meu && idsDe(p).some((i) => usuarioDe(i) === meu)) return await falhar('😅 Eu não posso me castigar.');
      if (bot.castigo.ehProtegido([d.alvo, ...idsDe(p)])) return await falhar('🛡️ Essa pessoa é protegida e não pode ser castigada.');
      if (p.admin === 'superadmin') return await falhar('⚠️ Essa pessoa é a dona (criadora) do grupo e o WhatsApp não deixa rebaixar.');
      bot.castigo.guardarAliases(d.castigoId, [d.alvo, ...idsDe(p)]);
      store.salvar();
      if (p.admin === 'admin') await sock.groupParticipantsUpdate(chatId, [p.id], 'demote');
      await enviar(d.texto, d.mentions);
      await tirarAdminDoOutroBot(sock, chatId, d.alvo);
    } catch (e) {
      console.error('Falha ao aplicar o castigo:', e.message);
      await falhar('⚠️ Não consegui tirar o admin. O bot precisa ser admin do grupo.');
    }
  }

  // manda o comando do outro bot que tira a pessoa da lista de admins dele
  async function tirarAdminDoOutroBot(sock, chatId, alvo) {
    try {
      lembrarEnviado(await sock.sendMessage(chatId, { text: `${CMD_TIRAR_ADMIN} @${usuarioDe(alvo)}`, mentions: [alvo] }));
    } catch (e) {
      console.error('Não consegui mandar o comando de tirar admin do outro bot:', e.message);
    }
  }

  // Alguém mandou o comando de DAR admin (do outro bot) pra uma pessoa de castigo? Espera o outro bot
  // processar e manda o comando de tirar de volta. Vale pra marcação, resposta a uma mensagem ou @número no texto.
  const recentes = new Map(); // chatId:usuario -> hora da última correção (evita repetir em rajada)
  async function vigiarDarAdmin(sock, { chatId, text, mentions = [], quoted = null }) {
    try {
      if (!reDarAdmin.test(String(text || ''))) return;
      if (!bot.castigo.ativosDoChat(chatId).length) return;
      const candidatos = new Set([...mentions, quoted?.senderId].filter(Boolean));
      for (const m of String(text).matchAll(/@(\d{5,})/g)) candidatos.add(`${m[1]}@s.whatsapp.net`);
      for (const alvo of candidatos) {
        const c = bot.castigo.daPessoa(chatId, [alvo]);
        if (!c) continue;
        const chave = `${chatId}:${usuarioDe(alvo)}`;
        if (Date.now() - (recentes.get(chave) || 0) < 5000) continue;
        recentes.set(chave, Date.now());
        await esperar(3000); // dá tempo do outro bot dar o admin antes de a gente tirar
        await tirarAdminDoOutroBot(sock, chatId, alvo);
        lembrarEnviado(await sock.sendMessage(chatId, {
          text: `🚫 @${usuarioDe(alvo)} está de castigo até *${bot.castigo.quando(c.ate)}* e não pode ser admin. Tirei o admin de novo.`,
          mentions: [alvo],
        }));
      }
    } catch (e) {
      console.error('Erro ao vigiar comando de dar admin:', e.message);
    }
  }

  // Confere o grupo: quem está de castigo e virou admin perde o admin de novo.
  const varrendo = new Set();
  async function varrerCastigos(sock, chatId) {
    if (varrendo.has(chatId)) return;
    varrendo.add(chatId);
    try {
      if (!bot.castigo.ativosDoChat(chatId).length) return;
      const meta = await sock.groupMetadata(chatId);
      for (const p of meta.participants) {
        if (p.admin !== 'admin') continue; // só admin comum; a dona do grupo não dá pra rebaixar
        const c = bot.castigo.daPessoa(chatId, idsDe(p));
        if (!c) continue;
        try {
          await sock.groupParticipantsUpdate(chatId, [p.id], 'demote');
          lembrarEnviado(await sock.sendMessage(chatId, {
            text: `🚫 @${usuarioDe(p.id)} está de castigo até *${bot.castigo.quando(c.ate)}* e não pode ser admin. Tirei o admin de novo.`,
            mentions: [p.id],
          }));
        } catch (e) {
          console.error('Não consegui tirar o admin de quem está de castigo:', e.message);
        }
      }
    } catch (e) {
      console.error('Erro ao vigiar castigos:', e.message);
    } finally {
      varrendo.delete(chatId);
    }
  }

  async function varrerTodos(sock) {
    for (const chatId of bot.castigo.chatsComCastigo()) await varrerCastigos(sock, chatId);
    store.salvar();
  }

  return { aplicarCastigo, varrerCastigos, varrerTodos, vigiarDarAdmin };
}

module.exports = { criarVigia };
