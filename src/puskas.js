// Prêmio Puskas: o jogador manda o vídeo do gol com /puskas (máx. 10 por dia).
// O admin abre a votação com /iniciar puskas: o bot explica, reenvia os gols um a um (marcando o autor) e as pessoas
// votam REAGINDO ao vídeo do gol que acharam mais bonito (1 voto por pessoa; trocar a reação muda o voto).
// /encerrar puskas apura e anuncia o Gol Puskas do dia.
//
// O núcleo não conhece o WhatsApp: o conector baixa o vídeo (msg.video = { arquivo, id, autor })
// e envia os vídeos que o núcleo pedir (ctx.sayVideo), avisando o id de cada um (onSent) pra contar as reações.

const fs = require('fs');
const path = require('path');
const { norm } = require('./text');

const MAX_POR_DIA = 10;
const DIAS_GUARDAR_NAO_USADOS = 3;
const DIAS_GUARDAR_VENCEDORES = 30;
const FUSO = 'America/Sao_Paulo';

const tag = (id) => `@${id.split('@')[0]}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

class Puskas {
  constructor(store, { prefix = '/', dataDir = null, agora = () => Date.now() } = {}) {
    this.store = store;
    this.prefix = prefix;
    this.dataDir = dataDir;
    this.agora = agora;
    store.data.puskas ||= { gols: {}, rodadas: {} };
  }

  // ---------- util ----------
  get gols() { return this.store.data.puskas.gols; }
  get rodadas() { return this.store.data.puskas.rodadas; }

  diaDe(ts) {
    // "2026-11-17" no fuso de São Paulo
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(ts));
  }

  hoje() { return this.diaDe(this.agora()); }

  dataBonita(dia) { const [, m, d] = dia.split('-'); return `${d}/${m}`; }

  caminho(rel) { return this.dataDir ? path.join(this.dataDir, rel) : rel; }

  apagarArquivo(g) {
    if (!g.arquivo) return;
    try { fs.unlinkSync(this.caminho(g.arquivo)); } catch (e) { /* já não existe */ }
    g.arquivo = null;
  }

  golsDoDia(chatId, dia) {
    return Object.values(this.gols).filter((g) => g.chatId === chatId && g.dia === dia && !g.removido);
  }

  rodadaAberta(chatId) {
    return Object.values(this.rodadas).find((r) => r.chatId === chatId && r.status === 'aberta') || null;
  }

  exigeAdmin(ctx) {
    if (ctx.msg.isAdmin) return true;
    ctx.say('Só admin pode fazer isso.');
    return false;
  }

  // apaga vídeos antigos pra não encher o volume
  limpar() {
    const hoje = this.agora();
    for (const g of Object.values(this.gols)) {
      if (!g.arquivo) continue;
      const idadeDias = (hoje - g.em) / 86_400_000;
      const rodada = g.rodadaId ? this.rodadas[g.rodadaId] : null;
      const ehVencedor = rodada && rodada.status === 'encerrada' && (rodada.vencedores || []).includes(g.id);
      const emVotacao = rodada && rodada.status === 'aberta';
      if (emVotacao) continue;
      if (ehVencedor ? idadeDias > DIAS_GUARDAR_VENCEDORES : idadeDias > DIAS_GUARDAR_NAO_USADOS) this.apagarArquivo(g);
    }
  }

  // ---------- comando /puskas ----------
  comando(ctx, args) {
    const { msg, say } = ctx;
    const toks = String(args || '').trim().split(/\s+/).filter(Boolean);
    const sub = norm(toks[0] || '').replace(/ /g, '');
    const resto = toks.slice(1).join(' ');

    if (msg.video || msg.videoErro) return this.registrarGol(ctx); // vídeo anexado (ou citado): é um gol novo
    switch (sub) {
      case '': return this.ajuda(ctx);
      case 'lista': return this.lista(ctx);
      case 'remover': case 'remove': case 'apagar': return this.remover(ctx, resto);
      case 'iniciar': case 'abrir': return this.iniciar(ctx);
      case 'encerrar': case 'apurar': return this.encerrar(ctx);
      case 'cancelar': return this.cancelar(ctx);
      case 'hall': case 'ranking': case 'ganhadores': case 'vencedores': return this.hall(ctx);
      case 'votar': case 'voto': return this.votarTexto(ctx, resto);
      default: return say('Não entendi. Mande o *vídeo do gol* com a legenda */puskas* (ou responda ao vídeo com /puskas).');
    }
  }

  ajuda(ctx) {
    const n = this.golsDoDia(ctx.msg.chatId, this.hoje()).length;
    ctx.say(
      `🎯 *Prêmio Puskas*\n\n` +
      `Mande o *vídeo do seu gol* com a legenda */puskas* (ou responda ao vídeo com /puskas).\n` +
      `Hoje já entraram ${n}/${MAX_POR_DIA} gols.\n\n` +
      `/puskas lista — gols de hoje\n` +
      `/puskas remover N — tira um gol (o autor ou admin)\n` +
      `(admin) /iniciar puskas — mostra os gols e abre a votação\n` +
      `(admin) /encerrar puskas — apura o Gol Puskas do dia\n` +
      `/puskas hall — quem já ganhou Puskas`
    );
  }

  // ---------- registrar um gol ----------
  registrarGol(ctx) {
    const { msg, say } = ctx;
    if (msg.videoErro) return say(`⚠️ ${msg.videoErro}`);
    const v = msg.video;
    const dia = this.hoje();
    this.limpar();

    const repetido = Object.values(this.gols).find((g) => g.chatId === msg.chatId && g.videoId === v.id && !g.removido);
    if (repetido) return say(`Esse vídeo já está na lista (gol #${repetido.num} de hoje).`);

    const hojeGols = this.golsDoDia(msg.chatId, dia);
    if (hojeGols.length >= MAX_POR_DIA) {
      try { fs.unlinkSync(this.caminho(v.arquivo)); } catch (e) { /* ok */ }
      return say(`🚫 Hoje já chegaram ${MAX_POR_DIA} gols, a lista está cheia. Tente amanhã!`);
    }

    const autor = v.autor || msg.senderId;
    const todosDoDia = Object.values(this.gols).filter((g) => g.chatId === msg.chatId && g.dia === dia);
    const num = todosDoDia.reduce((m, g) => Math.max(m, g.num), 0) + 1;
    const id = this.store.novoId('puskasGol');
    this.gols[id] = {
      id, chatId: msg.chatId, dia, num, autor, videoId: v.id, arquivo: v.arquivo,
      em: this.agora(), rodadaId: null, removido: false,
    };
    say(
      `🎯 *Gol registrado!* ${tag(autor)} — gol #${num} de hoje (${hojeGols.length + 1}/${MAX_POR_DIA})`,
      [autor]
    );
  }

  lista(ctx) {
    const { msg, say } = ctx;
    const dia = this.hoje();
    const gols = this.golsDoDia(msg.chatId, dia).sort((a, b) => a.num - b.num);
    if (!gols.length) return say('Nenhum gol Puskas hoje ainda. Mande o vídeo com a legenda /puskas!');
    const linhas = gols.map((g) => {
      const r = g.rodadaId ? this.rodadas[g.rodadaId] : null;
      const sit = r ? (r.status === 'aberta' ? ' 🗳️ em votação' : r.status === 'encerrada' ? ' ✅ já votado' : '') : '';
      return `${g.num}) ${tag(g.autor)}${sit}`;
    });
    say(`🎯 *Gols Puskas de hoje* (${gols.length}/${MAX_POR_DIA})\n\n${linhas.join('\n')}`, gols.map((g) => g.autor));
  }

  remover(ctx, args) {
    const { msg, say } = ctx;
    const n = parseInt(args, 10);
    if (!Number.isInteger(n)) return say('Use: /puskas remover N (o número do gol em /puskas lista).');
    const g = this.golsDoDia(msg.chatId, this.hoje()).find((x) => x.num === n);
    if (!g) return say(`Não achei o gol #${n} de hoje.`);
    if (!msg.isAdmin && g.autor !== msg.senderId) return say('Só o autor do gol ou um admin pode remover.');
    if (g.rodadaId && this.rodadas[g.rodadaId]?.status === 'aberta') return say('Esse gol já está na votação.');
    g.removido = true;
    this.apagarArquivo(g);
    say(`🗑️ Gol #${n} removido da lista.`);
  }

  // ---------- abrir a votação ----------
  iniciar(ctx) {
    const { msg, say, sayVideo, grupo } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    if (this.rodadaAberta(msg.chatId)) return say('Já tem uma votação do Puskas aberta. Use /encerrar puskas pra apurar (ou /puskas cancelar).');
    this.limpar();
    const gols = this.golsDoDia(msg.chatId, this.hoje())
      .filter((g) => !g.rodadaId && g.arquivo && fs.existsSync(this.caminho(g.arquivo)))
      .sort((a, b) => a.num - b.num);
    if (gols.length < 2) {
      return say(`Precisa de pelo menos 2 gols pra votar (hoje: ${gols.length}). Mande o vídeo com a legenda /puskas.`);
    }
    const id = this.store.novoId('puskasRodada');
    const rodada = {
      id, chatId: msg.chatId, dia: this.hoje(), status: 'aberta', gols: gols.map((g) => g.id),
      porMsg: {}, votos: {}, criadoEm: this.agora(),
    };
    this.rodadas[id] = rodada;
    gols.forEach((g) => { g.rodadaId = id; });

    grupo('fechar'); // ninguém atrapalha enquanto os gols passam
    say(
      `🎯 *PRÊMIO PUSKAS — ${this.dataBonita(rodada.dia)}*\n\n` +
      `🔒 Vou *fechar o grupo* enquanto mando os gols, pra ninguém atrapalhar. Depois eu abro de novo pra vocês votarem.\n\n` +
      `Como funciona:\n` +
      `⚽ Vou mandar ${plural(gols.length, 'gol', 'gols')} de hoje, um de cada vez.\n` +
      `🗳️ A votação é por *reação*: reaja no gol que você achou o mais bonito.\n` +
      `🔁 Se você reagir em outro gol, o seu voto *muda* — então reaja só no gol certo, o que você achou mais bonito de verdade!\n` +
      `🚫 Não vale votar no próprio gol.\n\n` +
      `Já vou começar... 👀`
    );
    gols.forEach((g, i) => {
      sayVideo(
        this.caminho(g.arquivo),
        `⚽ *GOL ${i + 1}* de ${gols.length} — gol do ${tag(g.autor)}\n👆 Reaja nesse gol se você achou ele o mais bonito`,
        [g.autor],
        (waId) => { if (waId) rodada.porMsg[waId] = g.id; }
      );
    });
    grupo('abrir'); // reabre pra todo mundo poder reagir
    say(
      `🗳️ *Votação aberta!* Reaja no gol que você achou o mais bonito.\n` +
      `(Se a reação não funcionar: /puskas votar 2)\n\n` +
      `O admin encerra com /encerrar puskas`
    );
  }

  // ---------- votos ----------
  // posição (1..n) do gol dentro da rodada
  numeroNaRodada(rodada, golId) { return rodada.gols.indexOf(golId) + 1; }

  registrarVoto(rodada, votante, golId) {
    const g = this.gols[golId];
    if (g.autor === votante) return 'proprio';
    rodada.votos[votante] = golId;
    return 'ok';
  }

  // chamado pelo conector quando alguém reage a uma mensagem
  reacao({ chatId, senderId, msgId, emoji }) {
    const rodada = this.rodadaAberta(chatId);
    if (!rodada || !msgId) return;
    const golId = rodada.porMsg[msgId];
    if (!golId) return;
    if (!emoji) { // reação removida
      if (rodada.votos[senderId] === golId) delete rodada.votos[senderId];
      return;
    }
    this.registrarVoto(rodada, senderId, golId);
  }

  // /puskas votar N — alternativa se a reação falhar
  votarTexto(ctx, args) {
    const { msg, say } = ctx;
    const rodada = this.rodadaAberta(msg.chatId);
    if (!rodada) return say('Não tem votação do Puskas aberta.');
    const n = parseInt(args, 10);
    if (!Number.isInteger(n) || n < 1 || n > rodada.gols.length) {
      return say(`Use: /puskas votar N (de 1 a ${rodada.gols.length}).`);
    }
    const r = this.registrarVoto(rodada, msg.senderId, rodada.gols[n - 1]);
    say(r === 'proprio' ? 'Não vale votar no próprio gol 😉' : `✅ Voto registrado no gol ${n}.`);
  }

  placar(rodada) {
    const contagem = new Map(rodada.gols.map((id) => [id, 0]));
    for (const golId of Object.values(rodada.votos)) contagem.set(golId, (contagem.get(golId) || 0) + 1);
    return contagem;
  }

  // quantos Puskas cada pessoa já ganhou neste grupo: Map autor -> n (em ordem de quem ganhou primeiro)
  titulos(chatId) {
    const m = new Map();
    const rs = Object.values(this.rodadas)
      .filter((r) => r.chatId === chatId && r.status === 'encerrada')
      .sort((a, b) => a.encerradaEm - b.encerradaEm);
    for (const r of rs) for (const id of r.vencedores) { const a = this.gols[id].autor; m.set(a, (m.get(a) || 0) + 1); }
    return m;
  }

  // ---------- apuração ----------
  encerrar(ctx) {
    const { msg, say, sayVideo } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const rodada = this.rodadaAberta(msg.chatId);
    if (!rodada) return say('Não tem votação do Puskas aberta.');
    const contagem = this.placar(rodada);
    const max = Math.max(...contagem.values());
    if (max === 0) {
      return say('Ninguém votou ainda. Reaja no vídeo do gol que achou mais bonito (ou /puskas votar N). Use /puskas cancelar pra descartar.');
    }
    const vencedores = rodada.gols.filter((id) => contagem.get(id) === max);
    rodada.status = 'encerrada';
    rodada.vencedores = vencedores;
    rodada.encerradaEm = this.agora();
    const votantes = Object.keys(rodada.votos).length;

    const ordem = [...rodada.gols].sort((a, b) => contagem.get(b) - contagem.get(a) || rodada.gols.indexOf(a) - rodada.gols.indexOf(b));
    const linhas = ordem.map((id) => {
      const g = this.gols[id];
      const n = contagem.get(id);
      const ehV = vencedores.includes(id);
      return `${ehV ? '🏆' : '▫️'} Gol ${this.numeroNaRodada(rodada, id)} — ${tag(g.autor)} — ${plural(n, 'voto', 'votos')}`;
    });
    const cab = vencedores.length > 1 ? `🤝 *EMPATE NO PUSKAS!* (${this.dataBonita(rodada.dia)})` : `🏆 *GOL PUSKAS DO DIA!* (${this.dataBonita(rodada.dia)})`;
    const mencoes = [...new Set(rodada.gols.map((id) => this.gols[id].autor))];
    const totais = this.titulos(msg.chatId); // já inclui esta rodada
    const acumulado = vencedores.map((id) => {
      const a = this.gols[id].autor;
      return `🏅 ${tag(a)} agora tem ${plural(totais.get(a), 'Puskas', 'Puskas')}`;
    });
    say(
      `${cab}\n\n${linhas.join('\n')}\n\n👥 ${plural(votantes, 'pessoa votou', 'pessoas votaram')}.\n\n${acumulado.join('\n')}`,
      mencoes
    );

    for (const id of vencedores) {
      const g = this.gols[id];
      if (g.arquivo && fs.existsSync(this.caminho(g.arquivo))) {
        sayVideo(this.caminho(g.arquivo), `🏆 *GOL PUSKAS DO DIA* — ${tag(g.autor)}\n${plural(contagem.get(id), 'voto', 'votos')} 👏`, [g.autor]);
      }
    }
    // os perdedores não precisam mais do vídeo
    rodada.gols.filter((id) => !vencedores.includes(id)).forEach((id) => this.apagarArquivo(this.gols[id]));
  }

  cancelar(ctx) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const rodada = this.rodadaAberta(msg.chatId);
    if (!rodada) return say('Não tem votação do Puskas aberta.');
    rodada.status = 'cancelada';
    rodada.gols.forEach((id) => { this.gols[id].rodadaId = null; }); // voltam pra lista de hoje
    say('🛑 Votação do Puskas cancelada. Os gols continuam na lista; use /iniciar puskas pra abrir de novo.');
  }

  // lista de quem já ganhou Puskas (todos, com a contagem) + últimos vencedores
  hall(ctx) {
    const { msg, say } = ctx;
    const rs = Object.values(this.rodadas)
      .filter((r) => r.chatId === msg.chatId && r.status === 'encerrada')
      .sort((a, b) => a.encerradaEm - b.encerradaEm);
    if (!rs.length) return say('Ainda não teve nenhum Gol Puskas do dia. Use /iniciar puskas (admin) pra abrir a votação.');
    const titulos = [...this.titulos(msg.chatId).entries()].sort((a, b) => b[1] - a[1]); // empate: quem ganhou primeiro fica na frente
    const lista = titulos.map(([a, n], i) => `${i + 1}. ${tag(a)} — ${plural(n, 'Puskas', 'Puskas')}`);
    const ultimos = rs.slice(-5).reverse().map((r) => {
      const nomes = r.vencedores.map((id) => tag(this.gols[id].autor)).join(' e ');
      return `${this.dataBonita(r.dia)} — ${nomes}`;
    });
    say(
      `🏆 *Hall do Puskas*\n\n*Quem já ganhou*\n${lista.join('\n')}\n\n*Últimos vencedores*\n${ultimos.join('\n')}`,
      titulos.map(([a]) => a)
    );
  }
}

module.exports = { Puskas, MAX_POR_DIA };
