// Parte do castigo que conversa com o WhatsApp: tira o admin e vigia promoções.
// Separado do whatsapp.js pra poder ser testado com um "socket" de mentira.

const idsDe = (p) => [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean);
const usuarioDe = (id) => String(id || '').split('@')[0].split(':')[0];

function criarVigia({ bot, store, lembrarEnviado = () => {} }) {
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
    } catch (e) {
      console.error('Falha ao aplicar o castigo:', e.message);
      await falhar('⚠️ Não consegui tirar o admin. O bot precisa ser admin do grupo.');
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

  return { aplicarCastigo, varrerCastigos, varrerTodos };
}

module.exports = { criarVigia };
