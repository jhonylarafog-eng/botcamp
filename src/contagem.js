// Contagem de partidas, gols e assistências com print obrigatório e confirmação de admin.
//
// Fluxo:
//  1) O jogador manda o PRINT do fim da partida e escreve algo como "fiz 2 gols, dei 1 assistência"
//     (na legenda do print, ou antes/depois dele). O bot anota um pedido pendente.
//  2) Um admin responde (cita) o print com /ok pra confirmar, ou corrige com
//     /reg @fulano 2 gols 1 assistência.  O /reg SÓ vale se citar um print.
//  3) Cada registro conta 1 partida jogada + os gols e assistências.
//  4) Um mesmo print não pode ser contado duas vezes.

const { norm } = require('./text');

const PALAVRAS = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const JANELA_MS = 15 * 60 * 1000; // print e texto precisam vir com até 15 min de diferença
const MAXIMO = 30;

const paraNumero = (s) => (/^\d+$/.test(s) ? parseInt(s, 10) : PALAVRAS[s]);
const tag = (id) => `@${id.split('@')[0]}`;
const txtGols = (n) => (n === 1 ? '1 gol' : `${n} gols`);
const txtAssist = (n) => (n === 1 ? '1 assistência' : `${n} assistências`);

// Lê "2 gols", "1 assistência", "gols 2", "fiz dois gols"... Retorna null se não achar nada.
function rotulos(texto) {
  const t = norm(String(texto || '').replace(/@\S+/g, ' ')); // tira as menções (@número)
  const toks = t.split(' ').filter(Boolean);
  const usado = new Set();
  const numeroEm = (i) => {
    if (i < 0 || i >= toks.length || usado.has(i)) return null;
    const n = /^(\d{1,3}|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)$/.test(toks[i])
      ? paraNumero(toks[i]) : null;
    return n === null || n === undefined ? null : n;
  };
  // procura o número colado no rótulo: antes ("2 gols") ou depois ("gols 2")
  const acharPara = (ehRotulo) => {
    for (let i = 0; i < toks.length; i++) {
      if (!ehRotulo(toks[i])) continue;
      let j = i - 1;
      if (toks[j] === 'e' && numeroEm(j - 1) !== null) j--; // "2 e 1 assistência"
      let n = numeroEm(j);
      if (n !== null) { usado.add(j); return n; }
      n = numeroEm(i + 1);
      if (n !== null) { usado.add(i + 1); return n; }
    }
    return null;
  };
  const gols = acharPara((x) => /^gol(s|os)?$/.test(x));
  const assist = acharPara((x) => /^assist\w*$/.test(x));
  const jogos = acharPara((x) => /^(jogos?|partidas?)$/.test(x));
  return { gols, assist, jogos };
}

// Pedido de jogador / /reg: só gols e assistências (0 a 30).
function lerStats(texto) {
  const { gols, assist } = rotulos(texto);
  if (gols === null && assist === null) return null;
  const g = gols ?? 0;
  const a = assist ?? 0;
  if (g > MAXIMO || a > MAXIMO) return { invalido: true };
  return { gols: g, assist: a };
}

// Adição manual do admin (/add): gols, assistências e, se quiser, jogos (0 a 200).
const MAXIMO_MANUAL = 200;
function lerManual(texto) {
  const { gols, assist, jogos } = rotulos(texto);
  if (gols === null && assist === null && jogos === null) return null;
  const r = { gols: gols ?? 0, assist: assist ?? 0, jogos: jogos ?? 0 };
  if (r.gols > MAXIMO_MANUAL || r.assist > MAXIMO_MANUAL || r.jogos > MAXIMO_MANUAL) return { invalido: true };
  return r;
}

const usuario = (id) => id.split('@')[0].split(':')[0];

class Contagem {
  constructor(store, { prefix = '/', agora = () => Date.now() } = {}) {
    this.store = store;
    this.prefix = prefix;
    this.agora = agora;
    this.ultimoPrint = new Map(); // "chat|jogador" -> { id, em }
    this.aguardando = new Map();  // "chat|jogador" -> { gols, assist, em }  (texto veio antes do print)
    store.data.registros ||= {};
    store.data.pendentes ||= {};
  }

  // ---------- util ----------
  get registros() { return this.store.data.registros; }
  get pendentesMap() { return this.store.data.pendentes; }

  nome(id) {
    const j = this.store.data.jogadores[id];
    return j ? j.nome : id.split('@')[0];
  }

  ativos(chatId) {
    return Object.values(this.registros).filter((r) => r.chatId === chatId && !r.desfeito);
  }

  totais(chatId) {
    const mapa = new Map();
    for (const r of this.ativos(chatId)) {
      const t = mapa.get(r.jogador) || { id: r.jogador, jogos: 0, gols: 0, assist: 0 };
      t.jogos += r.jogos ?? 1; // registros antigos/por print contam 1 partida; /add conta só o que o admin informar
      t.gols += r.gols;
      t.assist += r.assist;
      mapa.set(r.jogador, t);
    }
    return mapa;
  }

  exigeAdmin(ctx) {
    if (ctx.msg.isAdmin) return true;
    ctx.say('Só admin pode fazer isso.');
    return false;
  }

  // ---------- passo 1: pedido do jogador (mensagens comuns, sem prefixo) ----------
  // Retorna true se a mensagem foi tratada aqui.
  antes(ctx) {
    const { msg, say } = ctx;
    const chave = `${msg.chatId}|${msg.senderId}`;
    const agora = this.agora();
    const texto = String(msg.text || '').trim();
    const ehComando = texto.startsWith(this.prefix) && texto.length > 1;

    if (msg.temImagem && msg.id) this.ultimoPrint.set(chave, { id: msg.id, em: agora });
    if (ehComando) return false;

    const st = texto ? lerStats(texto) : null;

    // print que chegou depois de um texto "fiz 2 gols"
    if (!st && msg.temImagem && msg.id) {
      const esp = this.aguardando.get(chave);
      if (esp && agora - esp.em <= JANELA_MS) {
        this.aguardando.delete(chave);
        this.criarPedido(ctx, msg.id, esp.gols, esp.assist);
        return true;
      }
      return false;
    }
    if (!st) return false;
    if (st.invalido) {
      say(`Esse número parece errado (máximo ${MAXIMO}). Confere e manda de novo.`);
      return true;
    }

    let printId = null;
    if (msg.temImagem) printId = msg.id;
    else if (msg.quoted && msg.quoted.temImagem) printId = msg.quoted.id;
    else {
      const up = this.ultimoPrint.get(chave);
      if (up && agora - up.em <= JANELA_MS) printId = up.id;
    }

    if (!printId) {
      this.aguardando.set(chave, { ...st, em: agora });
      say(
        `📸 ${msg.senderName || this.nome(msg.senderId)}, só conta com o *print* do final da partida. ` +
        `Manda o print aqui que eu anoto: ${txtGols(st.gols)} e ${txtAssist(st.assist)}.`
      );
      return true;
    }
    this.criarPedido(ctx, printId, st.gols, st.assist);
    return true;
  }

  criarPedido(ctx, printId, gols, assist) {
    const { msg, say } = ctx;
    const dup = Object.values(this.registros).find((r) => !r.desfeito && r.printId === printId);
    if (dup) return say(`Esse print já foi contado (#${dup.id}).`);
    this.pendentesMap[printId] = {
      printId, chatId: msg.chatId, jogador: msg.senderId, gols, assist, em: this.agora(),
    };
    say(
      `📸 *${this.nome(msg.senderId)}* pediu: ⚽ ${txtGols(gols)} · 🎯 ${txtAssist(assist)}\n\n` +
      `Admin: responda ao print com */ok* pra confirmar, ` +
      `ou corrija com */reg @fulano 2 gols 1 assistência*.`
    );
  }

  // ---------- passo 2: admin confirma ----------
  ok(ctx) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    let p = null;
    if (msg.quoted && msg.quoted.id) {
      p = this.pendentesMap[msg.quoted.id];
    } else {
      const lista = this.pendentesDoChat(msg.chatId);
      if (lista.length === 0) return say('Nenhum pedido pendente.');
      if (lista.length > 1) {
        return say(`Tem ${lista.length} pedidos pendentes. Responda ao print que quer confirmar com /ok (veja /pendentes).`);
      }
      p = lista[0];
    }
    if (!p || p.chatId !== msg.chatId) {
      return say('Não achei pedido pendente nesse print. Use */reg @fulano 2 gols 1 assistência* respondendo ao print.');
    }
    this.registrar(ctx, p.printId, p.jogador, p.gols, p.assist, p.jogador);
  }

  reg(ctx, args) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    if (!msg.quoted || !msg.quoted.temImagem) {
      return say('Só vale com print! Responda ao *print* do jogador com:\n/reg @fulano 2 gols 1 assistência');
    }
    const st = lerStats(args);
    if (!st) return say('Não entendi os números. Exemplo: /reg @fulano 2 gols 1 assistência');
    if (st.invalido) return say(`Número muito alto (máximo ${MAXIMO}).`);
    const jogador = (msg.mentions && msg.mentions[0]) || msg.quoted.senderId;
    if (!jogador) return say('Marque o jogador: /reg @fulano 2 gols 1 assistência');
    this.registrar(ctx, msg.quoted.id, jogador, st.gols, st.assist, msg.quoted.senderId);
  }

  registrar(ctx, printId, jogador, gols, assist, autorPrint) {
    const { msg, say } = ctx;
    const dup = Object.values(this.registros).find((r) => !r.desfeito && r.printId === printId);
    if (dup) {
      return say(`Esse print já foi contado (#${dup.id}). Se precisar corrigir: /desfazer ${dup.id}`);
    }
    const id = this.store.novoId('registro');
    this.registros[id] = {
      id, chatId: msg.chatId, jogador, gols, assist, printId, por: msg.senderId, em: this.agora(),
    };
    delete this.pendentesMap[printId];
    const t = this.totais(msg.chatId).get(jogador);
    let txt =
      `✅ *#${id}* registrado — ${tag(jogador)}\n` +
      `⚽ ${txtGols(gols)} · 🎯 ${txtAssist(assist)}\n\n` +
      `Total: ${t.jogos} ${t.jogos === 1 ? 'jogo' : 'jogos'} · ${txtGols(t.gols)} · ${txtAssist(t.assist)}`;
    if (autorPrint && autorPrint !== jogador) txt += `\n(print enviado por ${this.nome(autorPrint)})`;
    say(txt, [jogador]);
  }

  // /add @fulano 3 gols 2 assistências [4 jogos]  — soma direto, sem print. Vários jogadores: um por linha ou separados por ;
  adicionar(ctx, args) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const uso = 'Use assim:\n/add @fulano 3 gols 2 assistências\n(opcional: 4 jogos, pra contar partidas)\nVárias pessoas: uma por linha ou separadas por ;';
    const mentions = msg.mentions || [];
    const porNumero = new Map(mentions.map((j) => [usuario(j), j]));
    // um jogador por linha, por ";" ou simplesmente cada nova marcação @número
    const segmentos = String(args).split(/\n|;|(?=@\d{5,})/).map((s) => s.trim()).filter(Boolean);
    if (!segmentos.length) return say(uso);

    const itens = [];
    for (const seg of segmentos) {
      const m = seg.match(/@(\d{5,})/);
      const jogador = m ? porNumero.get(m[1]) : segmentos.length === 1 && mentions.length === 1 ? mentions[0] : null;
      if (!jogador) return say(`Marque o jogador com @ em: "${seg}"\n\n${uso}`);
      const st = lerManual(seg);
      if (!st) return say(`Não entendi os números em: "${seg}"\n\n${uso}`);
      if (st.invalido) return say(`Número muito alto em: "${seg}" (máximo ${MAXIMO_MANUAL}).`);
      itens.push({ jogador, ...st });
    }

    const linhas = [];
    for (const it of itens) {
      const id = this.store.novoId('registro');
      this.registros[id] = {
        id, chatId: msg.chatId, jogador: it.jogador, gols: it.gols, assist: it.assist, jogos: it.jogos,
        manual: true, printId: null, por: msg.senderId, em: this.agora(),
      };
      const t = this.totais(msg.chatId).get(it.jogador);
      const partes = [];
      if (it.gols) partes.push(`+${txtGols(it.gols)}`);
      if (it.assist) partes.push(`+${txtAssist(it.assist)}`);
      if (it.jogos) partes.push(`+${it.jogos} ${it.jogos === 1 ? 'jogo' : 'jogos'}`);
      linhas.push(
        `✅ *#${id}* ${tag(it.jogador)}: ${partes.join(' · ') || 'sem alteração'}\n` +
        `    Total: ${t.jogos} ${t.jogos === 1 ? 'jogo' : 'jogos'} · ${txtGols(t.gols)} · ${txtAssist(t.assist)}`
      );
    }
    say(`➕ *Adicionado manualmente*\n\n${linhas.join('\n')}`, itens.map((i) => i.jogador));
  }

  desfazer(ctx, args) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const n = parseInt(args, 10);
    const r = Number.isInteger(n) ? this.registros[n] : null;
    if (!r || r.chatId !== msg.chatId || r.desfeito) return say('Use /desfazer N, com o número do registro (ex.: /desfazer 12).');
    r.desfeito = true;
    say(`↩️ Registro *#${r.id}* desfeito (${this.nome(r.jogador)}: ${txtGols(r.gols)}, ${txtAssist(r.assist)}). ${r.printId ? 'O print pode ser registrado de novo.' : 'Adição manual removida.'}`);
  }

  // ---------- consultas ----------
  pendentesDoChat(chatId) {
    return Object.values(this.pendentesMap).filter((p) => p.chatId === chatId);
  }

  pendentes(ctx) {
    const lista = this.pendentesDoChat(ctx.msg.chatId);
    if (!lista.length) return ctx.say('Nenhum pedido pendente. ✅');
    ctx.say(
      `⏳ *Pedidos pendentes* (${lista.length})\n\n` +
      lista.map((p) => `• ${this.nome(p.jogador)} — ⚽ ${txtGols(p.gols)} · 🎯 ${txtAssist(p.assist)}`).join('\n') +
      `\n\nAdmin: responda ao print com /ok.`
    );
  }

  lista(ctx) {
    const todos = [...this.totais(ctx.msg.chatId).values()].sort(
      (a, b) => b.gols - a.gols || b.assist - a.assist || a.jogos - b.jogos
    );
    if (!todos.length) return ctx.say('Nenhuma partida registrada ainda.');
    const linhas = todos.slice(0, 40).map(
      (t, i) => `${i + 1}. ${this.nome(t.id)} — ${t.jogos} ${t.jogos === 1 ? 'jogo' : 'jogos'} · ⚽ ${t.gols} · 🎯 ${t.assist}`
    );
    ctx.say(`📊 *Lista geral* (${todos.length} jogadores)\n\n${linhas.join('\n')}`);
  }

  top(ctx, campo) {
    const medalha = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const itens = [...this.totais(ctx.msg.chatId).values()]
      .filter((t) => t[campo] > 0)
      .sort((a, b) => b[campo] - a[campo] || a.jogos - b.jogos)
      .slice(0, 10);
    const titulo = campo === 'gols' ? '⚽ *Artilheiros*' : '🎯 *Assistentes*';
    if (!itens.length) return ctx.say(`${titulo}\n\nNinguém registrou ainda.`);
    ctx.say(
      `${titulo}\n\n` +
      itens.map((t, i) => `${medalha(i)} ${this.nome(t.id)} — ${t[campo]} em ${t.jogos} ${t.jogos === 1 ? 'jogo' : 'jogos'}`).join('\n')
    );
  }
}

module.exports = { Contagem, lerStats, lerManual };
