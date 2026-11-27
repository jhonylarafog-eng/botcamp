// Mute: um admin manda /mutar @fulano (ou responde a mensagem da pessoa com /mutar) e, daí em diante,
// o bot apaga automaticamente TUDO que essa pessoa mandar no grupo — mesmo que ela seja admin.
// Só um admin que NÃO esteja mutado consegue tirar o mute (/desmutar). Quem está mutado nem consegue
// usar comandos, porque as mensagens dele são apagadas antes de o bot lê-las.
// O núcleo só guarda quem está mutado; quem apaga as mensagens é o conector (whatsapp.js).

const { variantes, usuario } = require('./castigo');

const tag = (id) => `@${usuario(id)}`;

class Mute {
  constructor(store, { ehProtegido = () => false, agora = () => Date.now() } = {}) {
    this.store = store;
    this.ehProtegido = ehProtegido;
    this.agora = agora;
    store.data.mutados ||= {};
    this.versao = 0; // sobe a cada mudança (o conector usa pra saber se um "não mutado" guardado ainda vale)
  }

  doChat(chatId) { return (this.store.data.mutados[chatId] ||= {}); }

  temMutados(chatId) { return Object.keys(this.store.data.mutados[chatId] || {}).length > 0; }

  // a pessoa (qualquer um dos ids dela: número, LID...) está mutada neste grupo? devolve o registro
  daPessoa(chatId, ids) {
    const alvo = new Set((ids || []).flatMap((i) => variantes(usuario(i))));
    return Object.values(this.store.data.mutados[chatId] || {})
      .find((m) => m.ids.some((x) => variantes(usuario(x)).some((v) => alvo.has(v)))) || null;
  }

  // guarda outros ids (ex.: o LID) da mesma pessoa, pra reconhecer mais rápido da próxima vez
  aprender(chatId, registro, ids) {
    const tem = new Set(registro.ids.map(usuario));
    let mudou = false;
    for (const i of ids || []) if (!tem.has(usuario(i))) { registro.ids.push(i); tem.add(usuario(i)); mudou = true; }
    if (mudou) this.store.salvar();
  }

  lista(chatId) { return Object.values(this.store.data.mutados[chatId] || {}); }

  // ---------- comandos ----------
  alvos(msg) {
    const marcados = [...(msg.mentions || [])];
    const citado = msg.quoted && msg.quoted.senderId;
    if (!marcados.length && citado) marcados.push(citado);
    const vistos = new Set();
    return marcados.filter((i) => { const k = usuario(i); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }

  // todas as formas conhecidas do mesmo id (o conector manda em msg.formas, indexado pelo número)
  idsDe(msg, id) {
    return [id, ...((msg.formas && msg.formas[usuario(id)]) || [])];
  }

  comando(ctx, cmd) {
    if (!['mutar', 'desmutar', 'mutados'].includes(cmd)) return false;
    const { msg, say } = ctx;
    const chatId = msg.chatId;
    if (!msg.isAdmin) { say('Só admin usa isso.'); return true; }

    if (cmd === 'mutados') {
      const l = this.lista(chatId);
      if (!l.length) { say('🔊 Ninguém está mutado neste grupo.'); return true; }
      say(`🔇 *Mutados:*\n${l.map((m) => `• ${tag(m.ids[0])}`).join('\n')}\n\nPra liberar: /desmutar @fulano`, l.map((m) => m.ids[0]));
      return true;
    }

    const alvos = this.alvos(msg);
    if (!alvos.length) {
      say(`Marque quem você quer ${cmd === 'mutar' ? 'mutar' : 'liberar'} (ou responda a mensagem da pessoa): /${cmd} @fulano`);
      return true;
    }

    if (cmd === 'mutar') {
      const novos = []; const jaEstavam = []; const bloqueados = [];
      for (const id of alvos) {
        if (this.idsDe(msg, id).some((x) => usuario(x) === usuario(msg.senderId))) { say('Você não pode mutar a si mesmo. 😅'); return true; }
        const formas = this.idsDe(msg, id);
        if (this.ehProtegido(formas)) { bloqueados.push(id); continue; }
        if (this.daPessoa(chatId, formas)) { jaEstavam.push(id); continue; }
        this.doChat(chatId)[usuario(id)] = { ids: [...new Set(formas)], por: msg.senderId, em: this.agora() };
        novos.push(id);
      }
      if (novos.length) { this.versao++; this.store.salvar(); }
      const partes = [];
      if (novos.length) partes.push(`🔇 ${novos.map(tag).join(' ')} ${novos.length > 1 ? 'foram mutados' : 'foi mutado'}. Tudo que mandar no grupo será apagado automaticamente, mesmo sendo admin. Só outro admin (não mutado) libera com /desmutar.`);
      if (jaEstavam.length) partes.push(`${jaEstavam.map(tag).join(' ')} já ${jaEstavam.length > 1 ? 'estavam mutados' : 'estava mutado'}.`);
      if (bloqueados.length) partes.push(`🛡️ ${bloqueados.map(tag).join(' ')} é protegido e não pode ser mutado.`);
      say(partes.join('\n'), [...novos, ...jaEstavam, ...bloqueados]);
      return true;
    }

    // desmutar
    const livres = []; const naoEstavam = [];
    for (const id of alvos) {
      const r = this.daPessoa(chatId, this.idsDe(msg, id));
      if (!r) { naoEstavam.push(id); continue; }
      delete this.doChat(chatId)[Object.keys(this.doChat(chatId)).find((k) => this.doChat(chatId)[k] === r)];
      livres.push(id);
    }
    if (livres.length) { this.versao++; this.store.salvar(); }
    const partes = [];
    if (livres.length) partes.push(`🔊 ${livres.map(tag).join(' ')} ${livres.length > 1 ? 'podem' : 'pode'} falar de novo.`);
    if (naoEstavam.length) partes.push(`${naoEstavam.map(tag).join(' ')} não ${naoEstavam.length > 1 ? 'estavam mutados' : 'estava mutado'}.`);
    say(partes.join('\n'), [...livres, ...naoEstavam]);
    return true;
  }
}

module.exports = { Mute };
