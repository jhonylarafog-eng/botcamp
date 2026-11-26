// Jogos do grupo: Quiz de futebol, Cidade Dorme e Adivinha o Lugar.
// Cada função devolve uma lista de respostas { chatId, text, mentions, privadoPara?, falhaDM? }.
//  - privadoPara: id do jogador que deve receber a mensagem no PRIVADO (chatId é o grupo do jogo)
//  - falhaDM: o que avisar no grupo se o privado não conseguir ser enviado
// Prazos (timers) usam this.agendar(ms, fn), que o whatsapp.js define. O estado fica em store.data.jogos.

const { norm, levenshtein } = require('./text');
const { PERGUNTAS, INDICES } = require('./quiz_dados');
const { LUGARES } = require('./lugares_dados');

const chave = (id) => String(id).split('@')[0].split(':')[0];
const tag = (id) => `@${chave(id)}`;
const MEDALHAS = ['🥇', '🥈', '🥉'];
const SEP = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

const TEMPO_QUIZ = 30_000;
const TEMPO_NOITE = 90_000;
const TEMPO_DIA = 120_000;
const TEMPO_VEZ = 150_000;
const MAX = { cidade: 20, lugares: 12 };
const IDADE_MAX_JOGO = 4 * 3600_000; // jogo parado há mais que isso deixa de calar o atendente

const PAPEIS = {
  assassino: { nome: 'ASSASSINO', emoji: '🔪' },
  detetive: { nome: 'DETETIVE', emoji: '🕵️' },
  medico: { nome: 'MÉDICO', emoji: '💉' },
  cidadao: { nome: 'CIDADÃO', emoji: '🙂' },
};

// ---------- comparação de texto ----------
function tol(len) { return len <= 4 ? 0 : len <= 7 ? 1 : 2; }

// o texto (normalizado) contém a expressão `a` como palavras inteiras?
function contem(t, a) { return a.length > 0 && ` ${t} `.includes(` ${a} `); }

// acerto de quiz/lugar: contém a resposta (ou erra por pouco, nas palavras longas)
function bate(texto, aliases, { fuzzy = true, maxPalavras = 12 } = {}) {
  const t = norm(texto);
  if (!t) return false;
  const palavras = t.split(' ');
  if (maxPalavras && palavras.length > maxPalavras) return false;
  for (const bruto of aliases) {
    const a = norm(bruto);
    if (!a) continue;
    if (t === a || contem(t, a)) return true;
    if (fuzzy && !a.includes(' ') && a.length >= 5) {
      if (palavras.some((w) => Math.abs(w.length - a.length) <= 2 && levenshtein(w, a) <= tol(a.length))) return true;
    }
  }
  return false;
}

class Jogos {
  constructor(store, { rng = Math.random, agora = () => Date.now() } = {}) {
    this.store = store;
    this.rng = rng;
    this.agora = agora;
    this.agendar = () => {}; // o whatsapp.js troca por setTimeout
    this.seq = 0;
  }

  // ---------- utilidades ----------
  todos() { return (this.store.data.jogos = this.store.data.jogos || {}); }
  get(chatId) { return this.todos()[chatId] || null; }
  apagar(chatId) { delete this.todos()[chatId]; }
  say(chatId, text, mentions = []) { return { chatId, text, mentions }; }
  // aviso que marca todo mundo do grupo (o conector junta os participantes)
  sayTodos(chatId, text) { return { chatId, text, mentions: [], todos: true }; }
  dm(chatId, id, text, falhaDM) {
    return { chatId, privadoPara: id, text, mentions: [], falhaDM };
  }
  nome(id) { return (this.store.data.jogadores[id] && this.store.data.jogadores[id].nome) || tag(id); }
  ehJogador(g, id) { return (g.jogadores || []).find((p) => chave(p.id || p) === chave(id)); }

  embaralhar(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // prazo: depois de `ms`, chama vencer(chatId, token) — se o jogo ainda estiver na mesma fase
  prazo(chatId, g, ms) {
    g.token = `${this.agora()}:${++this.seq}`;
    g.fim = this.agora() + ms;
    const t = g.token;
    this.agendar(ms, () => this.vencer(chatId, t));
  }

  vencer(chatId, token) {
    const g = this.get(chatId);
    if (!g || g.token !== token) return [];
    let rs = [];
    try {
      if (g.tipo === 'quiz') rs = this.quizTempo(chatId, g);
      else if (g.tipo === 'cidade') rs = g.fase === 'noite' ? this.amanhecer(chatId, g) : g.fase === 'dia' ? this.apurar(chatId, g) : [];
      else if (g.tipo === 'lugares') rs = this.lugarTempo(chatId, g);
    } catch (e) {
      console.error('Erro no prazo do jogo:', e);
    }
    this.store.salvar();
    return rs;
  }

  // depois de reiniciar o bot: reagenda os prazos que estavam correndo
  rearmar() {
    for (const [chatId, g] of Object.entries(this.todos())) {
      if (!g.token || !g.fim) continue;
      const t = g.token;
      this.agendar(Math.max(1000, g.fim - this.agora()), () => this.vencer(chatId, t));
    }
  }

  // chats com jogo em que os jogadores podem mandar comandos no privado
  // (só jogos que já começaram e não estão velhos demais)
  chatsComPrivado() {
    const t = this.agora();
    return Object.entries(this.todos())
      .filter(([, g]) => g.tipo !== 'quiz' && g.fase !== 'inscricoes' && t - (g.inicio || t) < IDADE_MAX_JOGO)
      .map(([chatId]) => chatId);
  }

  // este participante (formas = ids equivalentes dele no grupo) está jogando agora? Vale pra vivo e morto.
  estaJogando(chatId, formas) {
    if (!this.chatsComPrivado().includes(chatId)) return false;
    const g = this.get(chatId);
    const f = new Set((formas || []).map(chave));
    return (g.jogadores || []).some((p) => f.has(chave(p.id || p)));
  }

  ranking(g, titulo) {
    const itens = Object.entries(g.pontos || {}).sort((a, b) => b[1] - a[1]);
    const ids = itens.map(([id]) => id);
    if (!itens.length) return { text: `${titulo}\n${SEP}\nNinguém pontuou desta vez. 😅`, mentions: [] };
    const linhas = itens.map(([id, n], i) => `${MEDALHAS[i] || `${i + 1}º`} ${tag(id)} — ${n} ponto${n === 1 ? '' : 's'}`);
    const topo = itens.filter(([, n]) => n === itens[0][1]);
    const fim = topo.length > 1 ? `🤝 Empate no topo: ${topo.map(([id]) => tag(id)).join(' ')}!` : `🏆 *${tag(itens[0][0])} venceu!*`;
    return { text: `${titulo}\n${SEP}\n${linhas.join('\n')}\n\n${fim}`, mentions: ids };
  }

  // ---------- entrada pelos comandos do grupo ----------
  comando(ctx, cmd, args) {
    const { msg } = ctx;
    const chatId = msg.chatId;
    const quem = msg.senderId;
    const admin = msg.isAdmin;
    const push = (rs) => ctx.push(rs);
    const say = (t, m = []) => push([this.say(chatId, t, m)]);
    const g = this.get(chatId);
    const soAdmin = () => { say('Só admin faz isso.'); return true; };

    switch (cmd) {
      case 'quiz': {
        if (!admin) return soAdmin();
        if (g) { say(this.jaTemJogo(g)); return true; }
        const nivel = /facil|fácil/i.test(args) ? 'facil' : /misto/i.test(args) ? 'misto' : 'dificil';
        const n = parseInt((String(args).match(/\d+/) || [])[0], 10);
        push(this.iniciarQuiz(chatId, quem, n, nivel));
        return true;
      }
      case 'cidadedorme': case 'lugares': {
        if (!admin) return soAdmin();
        if (g) { say(this.jaTemJogo(g)); return true; }
        push(this.abrirLobby(chatId, cmd === 'lugares' ? 'lugares' : 'cidade', quem));
        return true;
      }
      case 'entrar': {
        if (!g || g.fase !== 'inscricoes') { say('Não tem jogo com inscrições abertas agora.'); return true; }
        push(this.entrarLobby(chatId, g, quem));
        return true;
      }
      case 'sairjogo': {
        if (!g || g.fase !== 'inscricoes') { say('Só dá pra sair enquanto as inscrições estão abertas.'); return true; }
        push(this.sairLobby(chatId, g, quem));
        return true;
      }
      case 'iniciarjogo': {
        if (!admin) return soAdmin();
        if (!g || g.fase !== 'inscricoes') { say('Não tem jogo com inscrições abertas. Abra com /cidadedorme ou /lugares.'); return true; }
        push(g.tipo === 'cidade' ? this.comecarCidade(chatId, g) : this.comecarLugares(chatId, g));
        return true;
      }
      case 'cancelarjogo': case 'pararjogo': case 'pararquiz': {
        if (!admin) return soAdmin();
        if (!g) { say('Não tem jogo rolando.'); return true; }
        this.apagar(chatId);
        say('🛑 Jogo cancelado por um admin.');
        return true;
      }
      case 'votar': {
        // sem votação da Cidade Dorme, /votar é do Prêmio Puskas: deixa passar
        if (!g || g.tipo !== 'cidade' || g.fase !== 'dia') return false;
        push(this.votar(chatId, g, quem, msg, args));
        return true;
      }
      case 'apurar': {
        if (!g || g.tipo !== 'cidade' || g.fase !== 'dia') return false; // fora da Cidade Dorme, é do Puskas
        if (!admin) return soAdmin();
        push(this.apurar(chatId, g));
        return true;
      }
      case 'pular': case 'pularquiz': {
        if (!g) { say('Não tem jogo rolando.'); return true; }
        if (g.tipo === 'quiz') {
          if (!admin) return soAdmin();
          push(this.quizPular(chatId, g));
        } else if (g.tipo === 'lugares' && g.fase === 'jogando') {
          if (!admin && chave(g.ordem[g.vez]) !== chave(quem)) { say('Só quem está descrevendo (ou um admin) pula a vez.'); return true; }
          push(this.lugarPular(chatId, g));
        } else {
          say('Aqui não dá pra pular.');
        }
        return true;
      }
      default:
        return false;
    }
  }

  jaTemJogo(g) {
    const nomes = { quiz: 'o Quiz', cidade: 'a Cidade Dorme', lugares: 'o Adivinha o Lugar' };
    return `Já tem ${nomes[g.tipo]} rolando aqui. Um admin pode encerrar com /cancelarjogo.`;
  }

  // texto solto (sem "/"): resposta do quiz, palpite de lugar, "eu" nas inscrições. true = consumido
  antes(ctx, texto) {
    const { msg } = ctx;
    const chatId = msg.chatId;
    const g = this.get(chatId);
    if (!g) return false;
    const quem = msg.senderId;
    if (g.fase === 'inscricoes') {
      if (/^(eu|entrar|euquero|eujogo|euvou|voujogar|vouentrar|quero)$/.test(norm(texto).replace(/ /g, ''))) {
        ctx.push(this.entrarLobby(chatId, g, quem));
        return true;
      }
      return false;
    }
    if (g.tipo === 'quiz' && g.fase === 'jogando') {
      const q = PERGUNTAS[g.ordem[g.i]];
      if (bate(texto, q.r)) { ctx.push(this.quizAcerto(chatId, g, quem)); return true; }
      return false;
    }
    if (g.tipo === 'lugares' && g.fase === 'jogando') {
      const narrador = g.ordem[g.vez];
      const lugar = LUGARES[g.lugares[narrador]];
      if (chave(quem) === chave(narrador)) {
        // quem descreve não pode falar o nome
        if (bate(texto, lugar.aliases, { fuzzy: false, maxPalavras: 0 })) { ctx.push(this.lugarEscorregou(chatId, g)); return true; }
        return false;
      }
      if (this.ehJogador(g, quem) && bate(texto, lugar.aliases)) { ctx.push(this.lugarAcerto(chatId, g, quem)); return true; }
      return false;
    }
    return false;
  }

  // ---------- comandos no privado ----------
  // tentativas: [{ chatId, formas: [ids equivalentes do remetente nesse grupo] }]. Devolve respostas ou null (não é com a gente).
  privado({ tentativas, text }) {
    const m = String(text || '').trim().match(/^\/(\S+)\s*([\s\S]*)$/);
    if (!m) return null;
    const cmd = norm(m[1]).replace(/ /g, '');
    if (!['meupapel', 'meulugar', 'matar', 'salvar', 'investigar'].includes(cmd)) return null;
    for (const t of tentativas) {
      const g = this.get(t.chatId);
      if (!g || g.fase === 'inscricoes') continue;
      const formas = new Set((t.formas || []).map(chave));
      const p = (g.jogadores || []).find((x) => formas.has(chave(x.id || x)));
      if (!p) continue;
      const rs = this.privadoJogo(t.chatId, g, p, cmd, m[2].trim());
      this.store.salvar();
      return rs;
    }
    return null;
  }

  privadoJogo(chatId, g, p, cmd, arg) {
    const dm = (t) => [this.dm(chatId, p.id, t)];
    if (cmd === 'meupapel' || cmd === 'meulugar') {
      if (g.tipo === 'cidade' && cmd === 'meupapel') return dm(this.textoPapel(g, p));
      if (g.tipo === 'lugares' && cmd === 'meulugar') return dm(`🕵️ Seu lugar secreto é: *${LUGARES[g.lugares[p.id]].nome}*\nNão conte pra ninguém!`);
      return dm('Esse comando não vale para o jogo que está rolando.');
    }
    if (g.tipo !== 'cidade') return dm('Esse comando só vale na Cidade Dorme.');
    const esperado = { matar: 'assassino', salvar: 'medico', investigar: 'detetive' }[cmd];
    if (g.fase !== 'noite') return dm('Agora não é a noite. Espere o bot avisar no grupo.');
    if (!p.vivo) return dm('Você está morto(a) e não pode agir. 💀');
    if (p.papel !== esperado) return dm('Você não pode usar esse comando com o seu papel. Veja o seu papel com /meupapel.');
    const n = parseInt((String(arg).match(/\d+/) || [])[0], 10); // aceita "7", "n7", "nº 7"
    const alvo = g.jogadores[n - 1];
    if (!Number.isInteger(n) || !alvo || !alvo.vivo) return dm(`Número inválido. Use ${this.cmdNoite(esperado)} com o número de alguém vivo.\n\n${this.listaVivos(g, true)}`);
    if (cmd === 'matar' && alvo.papel === 'assassino') return dm('Esse é um parceiro seu! Escolha outro. 😅');
    const nt = g.noite;
    if (cmd === 'matar') nt.mata[p.id] = n - 1;
    if (cmd === 'salvar') nt.salva = n - 1;
    if (cmd === 'investigar') {
      if (nt.investiga !== null) return dm('Você já investigou essa noite.');
      nt.investiga = n - 1;
    }
    const rs = [];
    if (cmd === 'investigar') {
      rs.push(...dm(`🔎 ${this.nome(alvo.id)} ${alvo.papel === 'assassino' ? 'é ASSASSINO(A)! 🔪' : 'NÃO é assassino(a).'}`));
    } else {
      rs.push(...dm(`✅ Registrado: ${cmd === 'matar' ? 'atacar' : 'salvar'} *${n} ▸ ${this.nome(alvo.id)}*. (Dá pra mudar até a noite acabar.)`));
    }
    if (this.todosAgiram(g)) rs.push(...this.amanhecer(chatId, g));
    return rs;
  }

  cmdNoite(papel) { return { assassino: '/matar N', medico: '/salvar N', detetive: '/investigar N' }[papel]; }

  // ---------- lobby (Cidade Dorme e Adivinha o Lugar) ----------
  abrirLobby(chatId, tipo, dono) {
    const g = { tipo, fase: 'inscricoes', dono, jogadores: [] };
    this.todos()[chatId] = g;
    const texto = tipo === 'cidade'
      ? `🌙 *CIDADE DORME* 🌙\n${SEP}\n` +
        `Pessoal, vai começar a *Cidade Dorme*!\n` +
        `• Cada um recebe um papel *secreto no privado*: 🔪 assassino, 🕵️ detetive, 💉 médico ou 🙂 cidadão.\n` +
        `• De noite os assassinos matam alguém; de dia a gente discute e vota em quem acha que é assassino (/votar N).\n` +
        `• A cidade ganha se pegar todos os assassinos; eles ganham se sobrarem em número igual aos outros.\n` +
        `Mínimo ${5} jogadores.`
      : `🕵️ *ADIVINHA O LUGAR* 🕵️\n${SEP}\n` +
        `Pessoal, vai começar o *Adivinha o Lugar*!\n` +
        `• Cada um recebe um *lugar secreto no privado*.\n` +
        `• Na sua vez, descreva o lugar (o que acontece, quem tem lá...) *sem dizer o nome*.\n` +
        `• Os outros chutam aqui no grupo: quem acertar primeiro ganha 1 ponto. Quem tiver mais pontos no fim, vence!\n` +
        `Mínimo ${3} jogadores.`;
    return [this.sayTodos(chatId, `${texto}\n\n👉 Quer jogar? Digite *eu* (ou /entrar).\nO admin começa com */iniciarjogo*.`)];
  }

  entrarLobby(chatId, g, id) {
    if (this.ehJogador(g, id)) return [this.say(chatId, `${tag(id)} você já está dentro! (${g.jogadores.length} jogador${g.jogadores.length === 1 ? '' : 'es'})`, [id])];
    if (g.jogadores.length >= MAX[g.tipo]) return [this.say(chatId, `O jogo já está cheio (${MAX[g.tipo]}).`)];
    g.jogadores.push(g.tipo === 'cidade' ? { id, vivo: true, papel: null } : { id });
    return [this.say(chatId, `✅ ${tag(id)} entrou! *${g.jogadores.length}* jogador${g.jogadores.length === 1 ? '' : 'es'} na lista.`, [id])];
  }

  sairLobby(chatId, g, id) {
    const i = g.jogadores.findIndex((p) => chave(p.id) === chave(id));
    if (i < 0) return [this.say(chatId, 'Você não está na lista.')];
    g.jogadores.splice(i, 1);
    return [this.say(chatId, `👋 ${tag(id)} saiu. Agora são ${g.jogadores.length}.`, [id])];
  }

  // =====================================================================
  // QUIZ DE FUTEBOL
  // =====================================================================
  iniciarQuiz(chatId, dono, n, nivel = 'dificil') {
    const total = Math.min(30, Math.max(3, Number.isInteger(n) ? n : 10));
    const ordem = this.sortearPerguntas(chatId, INDICES[nivel] || INDICES.dificil, total);
    const g = { tipo: 'quiz', fase: 'jogando', dono, nivel, ordem, i: 0, pontos: {} };
    this.todos()[chatId] = g;
    return [
      this.sayTodos(chatId, `⚽ *QUIZ DE FUTEBOL* ⚽\n${SEP}\nPessoal, vai começar o *Quiz de Futebol*!\n• ${total} perguntas ${nivel === 'facil' ? 'fáceis' : nivel === 'misto' ? '(fáceis e difíceis)' : 'DIFÍCEIS'}, ${TEMPO_QUIZ / 1000}s cada.\n• É só *escrever a resposta* no grupo: o primeiro que acertar ganha 1 ponto.\n• Quem tiver mais pontos no fim, vence. Bora! 🔥`),
      ...this.perguntar(chatId, g),
    ];
  }

  // perguntas que este grupo já viu (guardadas no store, sobrevivem a reinícios)
  vistas(chatId) {
    const v = (this.store.data.quizVistas = this.store.data.quizVistas || {});
    return (v[chatId] = v[chatId] || []);
  }

  // sorteia `total` perguntas do `pool` priorizando as que o grupo ainda NÃO viu;
  // quando as novas acabam, completa com as já vistas e zera a memória desse pool
  sortearPerguntas(chatId, pool, total) {
    const vistas = new Set(this.vistas(chatId));
    const novas = this.embaralhar(pool.filter((i) => !vistas.has(PERGUNTAS[i].p)));
    if (novas.length >= total) return novas.slice(0, total);
    const velhas = this.embaralhar(pool.filter((i) => vistas.has(PERGUNTAS[i].p)));
    // zera a memória só das perguntas deste pool (mantém as de outros níveis)
    const doPool = new Set(pool.map((i) => PERGUNTAS[i].p));
    this.store.data.quizVistas[chatId] = this.vistas(chatId).filter((p) => !doPool.has(p));
    return [...novas, ...velhas].slice(0, total);
  }

  perguntar(chatId, g) {
    const q = PERGUNTAS[g.ordem[g.i]];
    const vistas = this.vistas(chatId);
    if (!vistas.includes(q.p)) vistas.push(q.p); // marca como já feita
    this.prazo(chatId, g, TEMPO_QUIZ);
    return [this.say(chatId, `❓ *Pergunta ${g.i + 1}/${g.ordem.length}*\n${q.p}`)];
  }

  quizAcerto(chatId, g, quem) {
    const q = PERGUNTAS[g.ordem[g.i]];
    g.pontos[quem] = (g.pontos[quem] || 0) + 1;
    return [this.say(chatId, `✅ ${tag(quem)} acertou! A resposta era *${q.r[0]}* (+1 ponto — ${g.pontos[quem]} no total)`, [quem]), ...this.quizAvancar(chatId, g)];
  }

  quizTempo(chatId, g) {
    const q = PERGUNTAS[g.ordem[g.i]];
    return [this.say(chatId, `⏰ Acabou o tempo! Ninguém acertou. A resposta era *${q.r[0]}*.`), ...this.quizAvancar(chatId, g)];
  }

  quizPular(chatId, g) {
    const q = PERGUNTAS[g.ordem[g.i]];
    return [this.say(chatId, `⏭️ Pergunta pulada. A resposta era *${q.r[0]}*.`), ...this.quizAvancar(chatId, g)];
  }

  quizAvancar(chatId, g) {
    g.i += 1;
    if (g.i >= g.ordem.length) {
      const r = this.ranking(g, '🏁 *FIM DO QUIZ!*');
      this.apagar(chatId);
      return [this.say(chatId, r.text, r.mentions)];
    }
    return this.perguntar(chatId, g);
  }

  // =====================================================================
  // CIDADE DORME
  // =====================================================================
  comecarCidade(chatId, g) {
    const n = g.jogadores.length;
    if (n < 5) return [this.say(chatId, `Precisa de pelo menos 5 jogadores (tem ${n}).`)];
    const assassinos = n <= 7 ? 1 : n <= 11 ? 2 : 3;
    const papeis = this.embaralhar([
      ...Array(assassinos).fill('assassino'), 'detetive', 'medico',
      ...Array(n - assassinos - 2).fill('cidadao'),
    ]);
    g.jogadores.forEach((p, i) => { p.papel = papeis[i]; p.vivo = true; });
    g.fase = 'noite';
    g.inicio = this.agora();
    g.rodada = 1;
    g.noite = { mata: {}, salva: null, investiga: null };
    g.votos = {};
    const rs = [this.say(chatId,
      `🌙 *CIDADE DORME — COMEÇOU!* 🌙\n${SEP}\n` +
      `Entre os ${n} jogadores: 🔪 ${assassinos} assassino${assassinos > 1 ? 's' : ''} · 🕵️ 1 detetive · 💉 1 médico · 🙂 ${n - assassinos - 2} cidadãos.\n` +
      `📩 *Cada um recebeu o seu papel no privado.* (Se não chegou, mande /meupapel pra mim no privado.)\n\n${this.listaVivos(g, false)}`,
      g.jogadores.map((p) => p.id))];
    for (const p of g.jogadores) {
      rs.push(this.dm(chatId, p.id, this.textoPapel(g, p),
        `⚠️ ${tag(p.id)} não consegui te mandar o papel no privado. Me chame no privado, mande /meupapel e eu te respondo.`));
    }
    rs.push(...this.noiteInicio(chatId, g));
    return rs;
  }

  textoPapel(g, p) {
    const info = PAPEIS[p.papel];
    let t = `${info.emoji} Você é *${info.nome}*!\n\n`;
    if (p.papel === 'assassino') {
      const parceiros = g.jogadores.filter((x) => x.papel === 'assassino' && x.id !== p.id).map((x) => this.nome(x.id));
      t += `Toda noite use */matar N* (N = número de um jogador vivo).` +
        (parceiros.length ? `\nSeus parceiros: ${parceiros.join(', ')}.` : '\nVocê joga sozinho(a).') +
        `\nVocês vencem quando os assassinos forem a metade (ou mais) dos vivos. De dia, finja ser inocente!`;
    } else if (p.papel === 'detetive') {
      t += `Toda noite use */investigar N* pra descobrir se alguém é assassino. Use a informação no dia, com cuidado: se descobrirem você, viram alvo!`;
    } else if (p.papel === 'medico') {
      t += `Toda noite use */salvar N* pra proteger alguém do ataque (pode ser você mesmo).`;
    } else {
      t += `Você não tem poderes. Observe, converse e vote no dia pra eliminar os assassinos!`;
    }
    return `${t}\n\n_Pra rever o seu papel, mande /meupapel._`;
  }

  listaVivos(g, comNome) {
    const linhas = g.jogadores.map((p, i) => `${p.vivo ? '🟢' : '💀'} ${i + 1} ▸ ${comNome ? this.nome(p.id) : tag(p.id)}`);
    return `*Jogadores:*\n${linhas.join('\n')}`;
  }

  noiteInicio(chatId, g) {
    const rs = [this.say(chatId, `🌙 *NOITE ${g.rodada}*\nA cidade dorme... 😴\nAssassinos, detetive e médico: olhem o *privado*! (${TEMPO_NOITE / 1000}s)`)];
    for (const p of g.jogadores) {
      if (!p.vivo || p.papel === 'cidadao') continue;
      const cmd = this.cmdNoite(p.papel);
      rs.push(this.dm(chatId, p.id, `🌙 *Noite ${g.rodada}* — hora de agir!\nUse *${cmd}*\n\n${this.listaVivos(g, true)}`,
        `⚠️ ${tag(p.id)} não consegui te chamar no privado. Me chame no privado e mande ${cmd}.`));
    }
    this.prazo(chatId, g, TEMPO_NOITE);
    return rs;
  }

  todosAgiram(g) {
    const vivos = g.jogadores.filter((p) => p.vivo);
    const assassinosOk = vivos.filter((p) => p.papel === 'assassino').every((p) => g.noite.mata[p.id] !== undefined);
    const medicoOk = vivos.filter((p) => p.papel === 'medico').every(() => g.noite.salva !== null);
    const detetiveOk = vivos.filter((p) => p.papel === 'detetive').every(() => g.noite.investiga !== null);
    return assassinosOk && medicoOk && detetiveOk;
  }

  amanhecer(chatId, g) {
    if (g.fase !== 'noite') return [];
    const nt = g.noite;
    // alvo mais escolhido pelos assassinos (empate: sorteia)
    const contagem = {};
    for (const idx of Object.values(nt.mata)) contagem[idx] = (contagem[idx] || 0) + 1;
    let alvo = null;
    const max = Math.max(0, ...Object.values(contagem));
    if (max > 0) {
      const topo = Object.keys(contagem).filter((k) => contagem[k] === max).map(Number);
      alvo = topo[Math.floor(this.rng() * topo.length)];
    }
    let txt = `☀️ *AMANHECEU — DIA ${g.rodada}*\n`;
    const mentions = [];
    if (alvo === null) {
      txt += `Os assassinos ficaram quietos. Ninguém morreu essa noite! 😮‍💨`;
    } else if (nt.salva === alvo) {
      txt += `Os assassinos atacaram, mas o *médico salvou* a vítima! Ninguém morreu! 💉✨`;
    } else {
      const v = g.jogadores[alvo];
      v.vivo = false;
      mentions.push(v.id);
      txt += `💀 ${tag(v.id)} foi encontrado(a) morto(a)! Era ${PAPEIS[v.papel].emoji} *${PAPEIS[v.papel].nome}*.`;
    }
    const rs = [this.say(chatId, txt, mentions)];
    const fim = this.checarFim(chatId, g);
    if (fim) return [...rs, ...fim];
    g.fase = 'dia';
    g.votos = {};
    rs.push(this.say(chatId,
      `🗣️ *DISCUSSÃO E VOTAÇÃO*\nConversem: quem é o assassino? Votem com */votar N* (número) ou */votar @fulano*.\n` +
      `A votação fecha quando todos votarem, em ${TEMPO_DIA / 1000}s ou quando um admin mandar /apurar.\n\n${this.listaVivos(g, false)}`,
      g.jogadores.filter((p) => p.vivo).map((p) => p.id)));
    this.prazo(chatId, g, TEMPO_DIA);
    return rs;
  }

  votar(chatId, g, quem, msg, args) {
    const eu = this.ehJogador(g, quem);
    if (!eu) return [this.say(chatId, 'Você não está nesse jogo.')];
    if (!eu.vivo) return [this.say(chatId, 'Quem morreu não vota. 💀')];
    let alvo = null;
    const alvoId = (msg.mentions || [])[0] || (msg.quoted && msg.quoted.senderId) || null;
    if (alvoId) alvo = g.jogadores.find((p) => chave(p.id) === chave(alvoId));
    else {
      const n = parseInt((String(args).match(/\d+/) || [])[0], 10);
      if (Number.isInteger(n)) alvo = g.jogadores[n - 1];
    }
    if (!alvo) return [this.say(chatId, 'Use */votar N* (número da lista) ou */votar @fulano*.')];
    if (!alvo.vivo) return [this.say(chatId, 'Esse jogador já morreu. 💀')];
    if (alvo.id === eu.id) return [this.say(chatId, 'Não vale votar em si mesmo(a)! 😅')];
    g.votos[eu.id] = alvo.id;
    const vivos = g.jogadores.filter((p) => p.vivo);
    const feitos = vivos.filter((p) => g.votos[p.id]).length;
    const rs = [this.say(chatId, `🗳️ ${tag(eu.id)} votou em ${tag(alvo.id)} (${feitos}/${vivos.length} votos)`, [eu.id, alvo.id])];
    if (feitos >= vivos.length) rs.push(...this.apurar(chatId, g));
    return rs;
  }

  apurar(chatId, g) {
    if (g.fase !== 'dia') return [];
    const contagem = {};
    for (const alvo of Object.values(g.votos)) contagem[alvo] = (contagem[alvo] || 0) + 1;
    const max = Math.max(0, ...Object.values(contagem));
    const topo = Object.keys(contagem).filter((k) => contagem[k] === max);
    const rs = [];
    if (max === 0) {
      rs.push(this.say(chatId, '🗳️ Ninguém votou. Ninguém foi eliminado.'));
    } else if (topo.length > 1) {
      rs.push(this.say(chatId, `🗳️ *Empate* entre ${topo.map(tag).join(' e ')}! Ninguém foi eliminado.`, topo));
    } else {
      const v = g.jogadores.find((p) => p.id === topo[0]);
      v.vivo = false;
      rs.push(this.say(chatId, `🗳️ A cidade decidiu: ${tag(v.id)} foi eliminado(a) com ${max} voto${max > 1 ? 's' : ''}!\nEra ${PAPEIS[v.papel].emoji} *${PAPEIS[v.papel].nome}*.`, [v.id]));
    }
    const fim = this.checarFim(chatId, g);
    if (fim) return [...rs, ...fim];
    g.rodada += 1;
    g.fase = 'noite';
    g.noite = { mata: {}, salva: null, investiga: null };
    g.votos = {};
    rs.push(...this.noiteInicio(chatId, g));
    return rs;
  }

  checarFim(chatId, g) {
    const vivos = g.jogadores.filter((p) => p.vivo);
    const ass = vivos.filter((p) => p.papel === 'assassino').length;
    const outros = vivos.length - ass;
    let venceu = null;
    if (ass === 0) venceu = 'cidade';
    else if (ass >= outros) venceu = 'assassinos';
    if (!venceu) return null;
    const papeis = g.jogadores.map((p) => `${PAPEIS[p.papel].emoji} ${tag(p.id)} — ${PAPEIS[p.papel].nome}${p.vivo ? '' : ' 💀'}`).join('\n');
    const titulo = venceu === 'cidade' ? '🏆 *A CIDADE VENCEU!* Todos os assassinos foram pegos! 🎉' : '🔪 *OS ASSASSINOS VENCERAM!* A cidade caiu... 😈';
    this.apagar(chatId);
    return [this.say(chatId, `${titulo}\n${SEP}\n*Quem era quem:*\n${papeis}`, g.jogadores.map((p) => p.id))];
  }

  // =====================================================================
  // ADIVINHA O LUGAR
  // =====================================================================
  comecarLugares(chatId, g) {
    const n = g.jogadores.length;
    if (n < 3) return [this.say(chatId, `Precisa de pelo menos 3 jogadores (tem ${n}).`)];
    const sorteados = this.embaralhar(LUGARES.map((_, i) => i)).slice(0, n);
    g.lugares = {};
    g.jogadores.forEach((p, i) => { g.lugares[p.id] = sorteados[i]; });
    g.ordem = this.embaralhar(g.jogadores.map((p) => p.id));
    g.vez = 0;
    g.pontos = {};
    g.fase = 'jogando';
    g.inicio = this.agora();
    const rs = [this.say(chatId,
      `🕵️ *ADIVINHA O LUGAR — COMEÇOU!* 🕵️\n${SEP}\n` +
      `📩 Cada um recebeu o seu *lugar secreto no privado* (se não chegou, mande /meulugar pra mim no privado).\n\n` +
      `*Como funciona:* na sua vez, descreva o seu lugar (o que acontece, quem tem lá, o que se vê...) *sem dizer o nome*. ` +
      `Os outros escrevem os palpites aqui no grupo — quem acertar primeiro ganha *1 ponto*. Falou o nome do lugar? Perde a vez!\n\n` +
      `*Ordem:*\n${g.ordem.map((id, i) => `${i + 1}º ${tag(id)}`).join('\n')}`,
      g.ordem)];
    for (const p of g.jogadores) {
      rs.push(this.dm(chatId, p.id, `🕵️ Seu lugar secreto é: *${LUGARES[g.lugares[p.id]].nome}*\nNão conte pra ninguém! Quando for a sua vez, descreva sem dizer o nome.`,
        `⚠️ ${tag(p.id)} não consegui te mandar o lugar no privado. Me chame no privado e mande /meulugar.`));
    }
    rs.push(...this.lugarVez(chatId, g));
    return rs;
  }

  lugarVez(chatId, g) {
    const id = g.ordem[g.vez];
    this.prazo(chatId, g, TEMPO_VEZ);
    return [
      this.say(chatId, `🎤 *Vez ${g.vez + 1}/${g.ordem.length}: ${tag(id)}*\nDescreva o seu lugar *sem dizer o nome*! Quem adivinhar primeiro ganha 1 ponto. ⏱️ ${TEMPO_VEZ / 1000}s`, [id]),
      this.dm(chatId, id, `🎤 É a sua vez! Seu lugar: *${LUGARES[g.lugares[id]].nome}*\nDescreva sem dizer o nome.`),
    ];
  }

  lugarAcerto(chatId, g, quem) {
    const id = g.ordem[g.vez];
    const lugar = LUGARES[g.lugares[id]];
    g.pontos[quem] = (g.pontos[quem] || 0) + 1;
    return [this.say(chatId, `✅ ${tag(quem)} acertou! O lugar de ${tag(id)} era *${lugar.nome}* (+1 ponto — ${g.pontos[quem]} no total)`, [quem, id]), ...this.lugarProxima(chatId, g)];
  }

  lugarEscorregou(chatId, g) {
    const id = g.ordem[g.vez];
    const lugar = LUGARES[g.lugares[id]];
    return [this.say(chatId, `🚫 ${tag(id)} falou o nome do lugar! Era *${lugar.nome}*. Vez anulada, ninguém pontua.`, [id]), ...this.lugarProxima(chatId, g)];
  }

  lugarTempo(chatId, g) {
    const id = g.ordem[g.vez];
    const lugar = LUGARES[g.lugares[id]];
    return [this.say(chatId, `⏰ Acabou o tempo! Ninguém adivinhou o lugar de ${tag(id)}: era *${lugar.nome}*.`, [id]), ...this.lugarProxima(chatId, g)];
  }

  lugarPular(chatId, g) {
    const id = g.ordem[g.vez];
    const lugar = LUGARES[g.lugares[id]];
    return [this.say(chatId, `⏭️ Vez pulada. O lugar de ${tag(id)} era *${lugar.nome}*.`, [id]), ...this.lugarProxima(chatId, g)];
  }

  lugarProxima(chatId, g) {
    g.vez += 1;
    if (g.vez >= g.ordem.length) {
      const r = this.ranking(g, '🏁 *FIM DO ADIVINHA O LUGAR!*');
      this.apagar(chatId);
      return [this.say(chatId, r.text, r.mentions)];
    }
    return this.lugarVez(chatId, g);
  }
}

module.exports = { Jogos, bate };
