// Lógica do bot de campeonato. Não depende do WhatsApp: recebe mensagens e devolve respostas.
//
// handle({ chatId, senderId, senderName, text, isAdmin }) -> [{ chatId, text, mentions }]

const { COMPETICOES, MENU_LIGAS, TAMANHOS, MODOS, NOME_MODO, poolMega } = require('./clubs');
const { norm, acharClube } = require('./text');
const rank = require('./rankings');
const { Contagem } = require('./contagem');
const { Puskas } = require('./puskas');
const { Castigo } = require('./castigo');
const { Jogos } = require('./jogos');

const AJUDA = `⚽ *Bot de Campeonato*

*Montar campeonato*
/iniciarcampx1 /iniciarcampx2 /iniciarcampx3 — começa o camp. O bot pergunta a *liga* e *quantos clubes entram*; responda com o número
(admin) /campabertox1 /campabertox2 /campabertox3 — *camp aberto*: ninguém escolhe time, é só digitar *vou jogar*. Quando fechar as vagas o bot sorteia os times, os clubes e os confrontos
(admin) coloque *aleatorio* no final (ex.: /iniciarcampx3 aleatorio) — todo mundo escolhe um time e, quando encher, o bot embaralha todo mundo e sorteia os confrontos
Depois é só *digitar o nome do time* pra entrar. Entrou, não sai mais
/listacamp — times livres e preenchidos (marca quem está em cada time)
(admin) /removertime @fulano — tira alguém do time (ou responda a mensagem da pessoa com /removertime)
(admin) /embaralhar — mistura os jogadores entre os times (qualquer modo, antes dos jogos começarem)
(admin) /comecar — começa só com os times completos
(admin) /cancelar — cancela o campeonato

*Jogos* 🎮
/quiz [N] [facil|misto] — (admin) quiz de futebol: o bot pergunta, o primeiro a acertar ganha ponto (padrão: 10 perguntas difíceis)
/cidadedorme — (admin; só se estiver ligado) abre a Cidade Dorme: *eu* pra entrar, /iniciarjogo pra começar. Papéis e ações da noite no privado (/matar N, /salvar N, /investigar N); de dia /votar N
/lugares — (admin; só se estiver ligado) Adivinha o Lugar: cada um recebe um lugar secreto no privado e descreve sem dizer o nome; quem adivinhar mais, vence
/ligarjogo e /desligarjogo [quiz|cidadedorme|lugares] — (admin) liga ou desliga um jogo (agora: só o quiz está ligado)
/entrar /sairjogo — entra ou sai da lista · /reenviar — reenvia no privado o seu papel/lugar (se não chegou) · /pular (quiz/lugares) · /apurar (admin, fecha a votação) · /cancelarjogo (admin)

*Zoeira*
/lentinho — sorteia quem mais rebolou lentinho pros cria (entre os mais ativos do dia)
/filho — responda a mensagem de alguém (ou marque) pra fazer um filho com a pessoa
/maisgay — escolhe o mais gay do dia (brincadeira)
(admin) /ignorarbot — responda a mensagem de um bot (ou marque ele) pra ele nunca ser escolhido · /designorarbot desfaz
/roubargrupo — rouba o grupo (é brincadeira, não acontece nada)

*Durante os jogos*
*cria* — o time ADVERSÁRIO vai criar a sala
/sala CÓDIGO — manda o código da sala
(admin) /vitoria eu — se você ganhou · /vitoria @fulano — marca quem ganhou
Quem ganhou pode falar *ganhei* ou /vitoria: o bot pergunta aos admins se está certo
(admin) /confirmar — confirma o pedido de vitória · /negar — nega
/gols 2 e /assist 1 — suas stats na última partida
/status — situação do campeonato

*Rankings*
/ranking /trofeus /artilharia
/derrotas /duplas /trios /perfil

*Contagem de gols e assistências*
Mande o *print* do fim da partida e escreva: _fiz 2 gols, dei 1 assistência_
(admin) responda ao print com /ok pra confirmar
(admin) ou corrija: /reg @fulano 2 gols 1 assistência
(admin) /add @fulano 3 gols 2 assistências — soma direto, sem print (opcional: 4 jogos)
(admin) /remover3gol @fulano — tira 3 gols (use /remover2assistencia @fulano pra assistências)
(admin) /resetartilharia — zera todos os gols e assistências (pede confirmação)
/artilheiros ou /assistencias — lista com todos, por participações
/pendentes

*Prêmio Puskas (gol mais bonito do dia)*
Mande o *vídeo do seu gol* com a legenda /puskas (máx. 10 esperando votação; ficam guardados até a votação)
(admin) /iniciar puskas — mostra os gols um a um; vote *reagindo* no vídeo
(admin) /encerrar puskas — apura o Gol Puskas do dia
(admin) /cancelarpuskas — cancela a votação mas mantém os gols (dá pra abrir de novo)
(admin) /limparpuskas — apaga só os vídeos de vencedores com mais de 60 dias (o hall nunca é apagado)
/puskas lista · /puskas hall (ou tudo junto: /puskaslista /puskashall /puskasremover2 /puskasvotar3)

*Castigo (admin)*
(admin) /castigo @fulano — tira o admin por 24h e ninguém consegue promover de novo (não dá pra desfazer)
/castigos — quem está de castigo`;

const ETAPAS = { final: 2, semi: 4, quartas: 8, oitavas: 16 };
const norma = (s) => norm(s).replace(/ /g, '');
const tag = (id) => `@${id.split('@')[0]}`;

class Bot {
  constructor(store, { prefix = '/', rng = Math.random, dataDir = null, agora = () => Date.now(), protegidos = [] } = {}) {
    this.store = store;
    this.prefix = prefix;
    this.rng = rng;
    this.puskas = new Puskas(store, { prefix, dataDir, agora });
    this.castigo = new Castigo(store, { agora, protegidos });
    this.contagem = new Contagem(store, { prefix });
    this.jogos = new Jogos(store, { rng, agora }); // Quiz, Cidade Dorme, Adivinha o Lugar
  }

  // comando recebido no PRIVADO de um jogador (Cidade Dorme / Adivinha o Lugar). Devolve respostas, ou null se não for com a gente.
  privado(dados) {
    try {
      const rs = this.jogos.privado(dados);
      this.store.salvar();
      return rs;
    } catch (e) {
      console.error('Erro no privado do jogo:', e);
      return null;
    }
  }

  // ---------- entrada ----------
  handle(msg) {
    const out = [];
    const say = (text, mentions = []) => out.push({ chatId: msg.chatId, text, mentions });
    // sayVideo: pede ao conector pra enviar um vídeo (arquivo) e avisar o id da mensagem enviada
    const sayVideo = (arquivo, text, mentions = [], onSent = null) =>
      out.push({ chatId: msg.chatId, text, mentions, video: { arquivo }, onSent });
    // grupo('fechar'|'abrir'): pede ao conector pra fechar (só admins falam) ou abrir o grupo
    const grupo = (acao) => out.push({ chatId: msg.chatId, grupo: acao });
    // castigo(dados): pede ao conector pra tirar o admin da pessoa e só então avisar o grupo
    const castigo = (dados) => out.push({ chatId: msg.chatId, castigo: dados });
    // sayAdmins: o conector acrescenta a marcação de todos os admins do grupo no fim da mensagem
    const sayAdmins = (text, mentions = []) => out.push({ chatId: msg.chatId, text, mentions, admins: true });
    const push = (rs) => rs.forEach((r) => out.push(r)); // respostas já prontas (jogos)
    const ctx = { msg, say, sayVideo, grupo, castigo, sayAdmins, push };
    try {
      this._handle(ctx);
    } catch (e) {
      console.error('Erro ao tratar mensagem:', e);
      say('⚠️ Deu um erro aqui. Tenta de novo.');
    }
    this.store.salvar();
    return out;
  }

  // reação (emoji) a uma mensagem do grupo: usada na votação do Puskas
  reacao(evt) {
    try {
      this.puskas.reacao(evt);
    } catch (e) {
      console.error('Erro ao tratar reação:', e);
    }
    this.store.salvar();
    return [];
  }

  _handle(ctx) {
    const { msg } = ctx;
    if (msg.senderName) this.store.jogador(msg.senderId, msg.senderName); // guarda o nome de quem fala
    if (this.contagem.antes(ctx)) return; // pedido de gols/assistências com print
    const text = String(msg.text || '').trim();
    if (!text) return;
    const camp = this.campAtivo(msg.chatId);
    // jogos (quiz, cidade dorme, lugares): respostas, palpites e "eu" nas inscrições
    if (!text.startsWith(this.prefix) && this.jogos.antes(ctx, text)) return;

    if (text.startsWith(this.prefix) && text.length > 1) {
      // separa o comando dos argumentos preservando as quebras de linha dos argumentos
      const m = text.slice(this.prefix.length).trim().match(/^(\S+)\s*([\s\S]*)$/);
      if (!m) return;
      return this.comando(ctx, norma(m[1]), m[2].trim(), camp);
    }
    if (!camp) return;
    if (camp.status === 'liga') return this.escolherLiga(ctx, camp, text);
    if (camp.status === 'tamanho') return this.escolherTamanho(ctx, camp, text);
    if (camp.status === 'inscricoes') {
      if (camp.aberto) {
        if (/^(eu)?(vou|quero)jogar(sim)?$/.test(norma(text))) return this.vouJogar(ctx, camp); // norma tira os espaços
        return;
      }
      return this.entrar(ctx, camp, text, false);
    }
    if (camp.status === 'andamento') {
      const n = norm(text);
      if (n === 'cria') return this.cria(ctx, camp);
      // jogador avisando que ganhou: o bot pergunta aos admins
      if (/^(eu |nos )?(ganhei|venci|ganhamos|vencemos|vitoria)( o jogo| a partida| essa)?$/.test(n)) return this.vitoria(ctx, camp, 'eu', true);
    }
  }

  comando(ctx, cmd, args, camp) {
    const { say, msg } = ctx;
    // Puskas tudo junto: /puskaslista, /puskashall, /puskasremover2, /puskasvotar3, /votarpuskas3
    const junto = cmd.match(/^puskas(lista|hall|ranking|ganhadores|vencedores|remover|remove|apagar|votar|voto|iniciar|abrir|encerrar|apurar|cancelar|limpar)(\d*)$/);
    if (junto) return this.puskas.comando(ctx, `${junto[1]} ${junto[2]} ${args}`.trim());
    const limparJunto = cmd.match(/^limparpuskas(confirmar)?$/);
    if (limparJunto) return this.puskas.limpar_vencedores(ctx, limparJunto[1] || args);
    const votarJunto = cmd.match(/^votarpuskas(\d+)$/);
    if (votarJunto) return this.puskas.votarTexto(ctx, votarJunto[1]);
    if (this.jogos.comando(ctx, cmd, args)) return; // /quiz, /cidadedorme, /lugares, /entrar, /votar...
    const mc = cmd.match(/^iniciarcamp(x[123])(aleatorio)?$/);
    if (mc) return this.iniciarCamp(ctx, camp, mc[1], `${mc[2] || ''} ${args}`);
    const ma = cmd.match(/^(?:iniciar)?campaberto(x[123])$/);
    if (ma) return this.iniciarCamp(ctx, camp, ma[1], args, true);
    switch (cmd) {
      case 'iniciarcamp': {
        const m = norm(args).match(/\b(x[123])\b/);
        if (!m) return say('Use assim: /iniciarcampx1, /iniciarcampx2 ou /iniciarcampx3 (admin: coloque *aleatorio* no final pro modo aleatório).');
        return this.iniciarCamp(ctx, camp, m[1], args);
      }
      case 'ignorarbot': case 'designorarbot': { // admin: tira (ou devolve) alguém da escolha do /maisgay — pra não cair em outro bot
        if (!msg.isAdmin) return say('Só admin usa isso.');
        const alvo = (msg.mentions || [])[0] || (msg.quoted && msg.quoted.senderId) || null;
        if (!alvo) return say(`Responda a mensagem do bot com /${cmd}, ou marque ele: /${cmd} @bot`);
        const d = this.store.data;
        d.ignorados = d.ignorados || [];
        const k = this.chaveId(alvo);
        const tem = d.ignorados.includes(k);
        if (cmd === 'ignorarbot') {
          if (!tem) d.ignorados.push(k);
          this.store.salvar();
          return say(`✅ ${tag(alvo)} não entra mais na escolha do /maisgay.`, [alvo]);
        }
        d.ignorados = d.ignorados.filter((x) => x !== k);
        this.store.salvar();
        return say(`✅ ${tag(alvo)} voltou a poder ser escolhido no /maisgay.`, [alvo]);
      }
      case 'maisgay': { // brincadeira: marca quem mais mandou mensagem hoje (a contagem começa quando o bot liga)
        const r = this.maisAtivoHoje(msg.chatId);
        if (!r) return say('🏳️‍🌈 Ainda não tenho ninguém pra escolher hoje. Conversem mais um pouco e tentem de novo!');
        return say(`🏳️‍🌈 O mais gay do dia é o ${tag(r.id)}!`, [r.id]);
      }
      case 'filho': { // brincadeira: responda a mensagem de alguém (ou marque) com /filho
        const alvo = (msg.mentions || [])[0] || (msg.quoted && msg.quoted.senderId) || null;
        if (!alvo) return say('Responda a mensagem de alguém com /filho (ou marque a pessoa: /filho @fulano).');
        if (this.chaveId(alvo) === this.chaveId(msg.senderId)) return say('👶 Filho sozinho não dá, né? Responda a mensagem de outra pessoa.');
        return say(`👶 ${tag(msg.senderId)} fez um filho com ${tag(alvo)}!`, [msg.senderId, alvo]);
      }
      case 'lentinho': { // brincadeira: sorteia entre os 5 mais ativos do dia
        const top = this.maisAtivosHoje(msg.chatId, 5);
        if (!top.length) return say('💃 Ainda não tenho ninguém pra escolher hoje. Conversem mais um pouco e tentem de novo!');
        const e = top[Math.floor(this.rng() * top.length)];
        return say(`💃 Quem mais rebolou lentinho pros cria foi o ${tag(e.id)}!`, [e.id]);
      }
      case 'embaralhar': return this.embaralharTimes(ctx, camp);
      case 'roubargrupo': // brincadeira: não muda nada no grupo, só manda a mensagem
        return say(`🏴‍☠️ O grupo foi roubado, e agora é do ${tag(msg.senderId)}!`, [msg.senderId]);
      case 'listacamp': return this.listaCamp(ctx, camp);
      case 'voujogar': return this.vouJogar(ctx, camp);
      case 'removertime': return this.removerTime(ctx, camp);
      case 'vitoria': return this.vitoria(ctx, camp, args);
      case 'negar': return this.negar(ctx, camp);
      case 'ajuda': case 'comandos': case 'help': case 'menu':
        return say(AJUDA);
      case 'iniciar':
        if (norma(args.split(/\s+/)[0]) === 'puskas') return this.puskas.iniciar(ctx);
        return this.iniciar(ctx, camp, args);
      case 'iniciarpuskas': return this.puskas.iniciar(ctx);
      case 'cancelarpuskas': return this.puskas.cancelar(ctx);
      case 'puskas': return this.puskas.comando(ctx, args);
      case 'castigo': case 'rebaixar': case 'tiraradm': case 'tiraradmin': return this.castigo.aplicar(ctx, args);
      case 'castigos': return this.castigo.lista(ctx);
      case 'votarpuskas': return this.puskas.votarTexto(ctx, args);
      case 'champions': case 'libertadores': case 'brasileirao':
        return this.escolherCompeticao(ctx, camp, cmd);
      case 'x1': case 'x2': case 'x3':
        if (norma(args).includes('aleatorio')) return this.iniciarAleatorio(ctx, camp, cmd, args);
        return this.escolherModo(ctx, camp, cmd);
      case 'x1aleatorio': case 'x2aleatorio': case 'x3aleatorio':
        return this.iniciarAleatorio(ctx, camp, cmd.slice(0, 2), args);
      case 'final': case 'semi': case 'semifinal': case 'semifinais':
      case 'quartas': case 'quartasdefinal': case 'oitavas': case 'oitavasdefinal':
        return this.escolherEtapa(ctx, camp, ETAPAS[cmd.replace(/definal$|finais?$/, '') || 'final'] || ETAPAS[cmd]);
      case 'times': return this.mudarTimes(ctx, camp, args);
      case 'time': return this.entrar(ctx, camp, args, true);
      case 'sair': return this.sair(ctx, camp);
      case 'cancelar': return this.cancelar(ctx, camp);
      case 'comecar': return this.comecar(ctx, camp);
      case 'status': case 'tabela': case 'jogos': return this.status(ctx, camp);
      case 'cria': return camp && camp.status === 'andamento' ? this.cria(ctx, camp) : undefined;
      case 'sala': return this.sala(ctx, camp, args);
      case 'placar': return this.placar(ctx, camp, args);
      case 'confirmar': return this.confirmar(ctx, camp);
      case 'forcar': return this.forcar(ctx, camp, args);
      case 'gols': case 'gol': return this.stat(ctx, 'gols', args);
      case 'assist': case 'assistencia': return this.stat(ctx, 'assist', args);
      case 'ranking': case 'elo': return say(rank.rankingElo(this.store, msg.chatId));
      case 'trofeus': return say(rank.trofeus(this.store, msg.chatId));
      case 'artilharia': return say(rank.artilharia(this.store, msg.chatId));
      case 'assistencias': return this.contagem.ranking(ctx); // mostra artilheiros e assistentes juntos
      case 'derrotas': return say(rank.derrotas(this.store, msg.chatId));
      case 'duplas': return say(rank.combos(this.store, msg.chatId, 2));
      case 'trios': return say(rank.combos(this.store, msg.chatId, 3));
      case 'perfil': return say(rank.perfil(this.store, msg.chatId, msg.senderId));
      // contagem de gols e assistências (com print)
      case 'reg': case 'registrar': return this.contagem.reg(ctx, args);
      case 'ok': return this.contagem.ok(ctx);
      case 'add': case 'adicionar': return this.contagem.adicionar(ctx, args);
      // /lista (sozinho) é ignorado de propósito: outro bot do grupo usa esse comando
      case 'listatimes':
        if (camp && camp.status === 'inscricoes') return camp.novo ? this.listaCamp(ctx, camp) : this.listaTimes(ctx, camp);
        return say('Não tem inscrições abertas agora. Use /iniciar ou /x3aleatorio (admin).');
      case 'artilheiros': return this.contagem.ranking(ctx);
      case 'resetartilharia': case 'resetarartilharia': case 'zerarartilharia': return this.contagem.resetar(ctx, args);
      case 'remover': { // forma com espaço: /remover 3 gols @fulano
        const m = norm(args).match(/^(\d{1,3}) ?(gols?|assistencias?)\b/);
        if (!m) return;
        return this.contagem.removerStats(ctx, parseInt(m[1], 10), m[2].startsWith('gol') ? 'gols' : 'assist');
      }
      case 'pendentes': return this.contagem.pendentes(ctx);
      case 'encerrar':
        if (norma(args) === 'puskas') return this.puskas.encerrar(ctx);
        return;
      case 'encerrarpuskas': return this.puskas.encerrar(ctx);
      default: {
        // /remover3gol @fulano  e  /remover5assistencia @fulano
        const m = cmd.match(/^remover(\d{1,3})(gols?|assistencias?)$/);
        if (m) return this.contagem.removerStats(ctx, parseInt(m[1], 10), m[2].startsWith('gol') ? 'gols' : 'assist');
        return; // comando desconhecido: ignora (pode ser de outro bot)
      }
    }
  }

  // ---------- util ----------
  campAtivo(chatId) {
    const id = this.store.data.ativos[chatId];
    return id ? this.store.data.campeonatos[id] : null;
  }

  ehOrg(ctx, camp) {
    return ctx.msg.isAdmin || camp.organizador === ctx.msg.senderId;
  }

  // ---------- mensagens do dia (para o /maisgay) ----------
  diaSP(ts = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts)); // AAAA-MM-DD
  }

  // chamado pelo conector a cada mensagem de pessoa no grupo
  contarMensagem(chatId, senderId, ts = Date.now()) {
    const d = this.store.data;
    d.msgsDia = d.msgsDia || {};
    const dia = this.diaSP(ts);
    let g = d.msgsDia[chatId];
    if (!g || g.dia !== dia) g = d.msgsDia[chatId] = { dia, n: {} }; // vira o dia: zera
    g.n[senderId] = (g.n[senderId] || 0) + 1;
    this.store.salvar();
  }

  // id sem @domínio e sem :dispositivo, pra comparar
  chaveId(id) { return String(id).split('@')[0].split(':')[0]; }

  // os N que mais mandaram mensagem hoje (sem os bots ignorados), do mais ativo pro menos
  maisAtivosHoje(chatId, n = 5, ts = Date.now()) {
    const g = (this.store.data.msgsDia || {})[chatId];
    if (!g || g.dia !== this.diaSP(ts)) return [];
    const ign = new Set(this.store.data.ignorados || []);
    return Object.entries(g.n)
      .filter(([id]) => !ign.has(this.chaveId(id)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, c]) => ({ id, n: c }));
  }

  maisAtivoHoje(chatId, ts = Date.now()) {
    const g = (this.store.data.msgsDia || {})[chatId];
    if (!g || g.dia !== this.diaSP(ts)) return null;
    let melhor = null;
    const ign = new Set(this.store.data.ignorados || []);
    for (const [id, n] of Object.entries(g.n)) {
      if (ign.has(this.chaveId(id))) continue;
      if (!melhor || n > melhor.n) melhor = { id, n };
    }
    return melhor;
  }

  registrar(ctx) {
    return this.store.jogador(ctx.msg.senderId, ctx.msg.senderName);
  }

  embaralhar(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  nome(id) { return rank.nomeDe(this.store, id); }

  partidasDaRodada(camp) {
    return (camp.partidas || []).map((id) => this.store.data.partidas[id]);
  }

  // partida da rodada atual em que o remetente joga
  minhaPartida(camp, id, estados) {
    return this.partidasDaRodada(camp).find(
      (p) =>
        (!estados || estados.includes(p.estado)) &&
        (p.timeA.jogadores.includes(id) || p.timeB.jogadores.includes(id))
    );
  }

  ladoDe(p, id) {
    return p.timeA.jogadores.includes(id) ? p.timeA : p.timeB;
  }

  outroLado(p, id) {
    return p.timeA.jogadores.includes(id) ? p.timeB : p.timeA;
  }

  // mostra um time: nome, jogadores e vagas livres. marcar=true menciona (marca) os jogadores
  blocoTime(camp, c, marcar = true) {
    if (camp.novo) return `${c.jogadores.length >= camp.tamanho ? '✅' : '🟡'} ${this.linhaTime(camp, c)}`;
    const cheio = c.jogadores.length >= camp.tamanho;
    const linhas = c.jogadores.map((id) => `   👤 ${marcar ? tag(id) : this.nome(id)}`);
    for (let i = c.jogadores.length; i < camp.tamanho; i++) linhas.push('   ▫️ _vaga livre_');
    return `${cheio ? '✅' : '⚪'} *${c.nome}* (${c.jogadores.length}/${camp.tamanho})\n${linhas.join('\n')}`;
  }

  // /listatimes durante as inscrições: times completos e times com vagas
  listaTimes(ctx, camp) {
    const completos = camp.clubes.filter((c) => c.jogadores.length >= camp.tamanho);
    const livres = camp.clubes.filter((c) => c.jogadores.length < camp.tamanho);
    const vagas = livres.reduce((n, c) => n + camp.tamanho - c.jogadores.length, 0);
    let txt = `📋 *Times — ${camp.modo.toUpperCase()}*`;
    if (camp.aleatorio) txt += ' 🎲';
    txt += `\n✅ ${completos.length} completo${completos.length === 1 ? '' : 's'} · 🟢 ${livres.length} com vaga · ${vagas} vaga${vagas === 1 ? '' : 's'} livre${vagas === 1 ? '' : 's'}`;
    if (completos.length) txt += `\n\n*Completos*\n` + completos.map((c) => this.blocoTime(camp, c, false)).join('\n\n');
    if (livres.length) txt += `\n\n*Com vagas*\n` + livres.map((c) => this.blocoTime(camp, c, false)).join('\n\n');
    txt += `\n\n👉 Digite o nome do clube pra entrar.`;
    ctx.say(txt);
  }

  formatClubes(camp) {
    return camp.clubes
      .map((c) => {
        const cheio = c.jogadores.length >= camp.tamanho;
        const nomes = c.jogadores.map((id) => this.nome(id)).join(', ');
        return `${cheio ? '✅' : '⚪'} ${c.nome} (${c.jogadores.length}/${camp.tamanho})${nomes ? ' — ' + nomes : ''}`;
      })
      .join('\n');
  }

  // ---------- novo fluxo: /iniciarcampx1|x2|x3 ----------
  menuLigas(camp) {
    return (
      `⚽ *ESCOLHA A LIGA* ⚽  _(${NOME_MODO[camp.modo]}${camp.aberto ? ' · CAMP ABERTO' : ''})_\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      MENU_LIGAS.map((k, i) => `${i + 1} ▸ ${COMPETICOES[k].emoji} ${COMPETICOES[k].nome.toUpperCase()}`).join('\n') +
      `\n\n👉 Manda o número aí!`
    );
  }

  menuTamanhos(camp) {
    return (
      `🎯 *QUANTOS CLUBES ENTRAM?* 🎯\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      TAMANHOS.map((t, i) => `${i + 1} ▸ ${t.emoji} ${t.nome} (${t.n})`).join('\n') +
      `\n\n_A opção 1 (MEGA TORNEIO) ignora a liga escolhida acima ▸ os 64 times saem misturados de várias ligas (sem seleção). ` +
      `Exceção: se você escolheu COPA DO MUNDO, os 64 times saem só de seleções._\n\n` +
      `▸ Manda o número aí!`
    );
  }

  // /iniciarcampx3 [aleatorio]
  iniciarCamp(ctx, camp, modo, args, aberto = false) {
    const { say, msg } = ctx;
    if (!MODOS[modo]) return;
    if (camp) return say('Já tem um campeonato rolando aqui. Use /status pra ver, ou /cancelar (admin) pra encerrar.');
    const aleatorio = aberto || norma(args).includes('aleatorio');
    if (aleatorio && !msg.isAdmin) return say(aberto ? 'Só admin abre o camp aberto.' : 'Só admin abre o modo aleatório.');
    this.registrar(ctx);
    const id = this.store.novoId('campeonato');
    const novo = {
      id, chatId: msg.chatId, organizador: msg.senderId, status: 'liga', novo: true, aleatorio, aberto, inscritos: [],
      competicao: null, modo, tamanho: MODOS[modo], clubes: [], rodada: 0,
      partidas: [], passaram: [], criadoEm: Date.now(),
    };
    this.store.data.campeonatos[id] = novo;
    this.store.data.ativos[msg.chatId] = id;
    say(this.menuLigas(novo));
  }

  // resposta do organizador (ou admin) com o número da liga
  escolherLiga(ctx, camp, texto) {
    const { say } = ctx;
    if (!this.ehOrg(ctx, camp)) return;
    const t = norm(texto);
    let chave = null;
    if (/^\d{1,2}$/.test(t)) {
      const i = parseInt(t, 10);
      if (i < 1 || i > MENU_LIGAS.length) return say(`Escolha um número de 1 a ${MENU_LIGAS.length}.`);
      chave = MENU_LIGAS[i - 1];
    } else if (t.length <= 24) {
      chave = MENU_LIGAS.find((k) => norm(COMPETICOES[k].nome) === t) || null;
    }
    if (!chave) return;
    camp.competicao = chave;
    camp.status = 'tamanho';
    say(this.menuTamanhos(camp));
  }

  // resposta do organizador (ou admin) com o número de clubes
  escolherTamanho(ctx, camp, texto) {
    const { say } = ctx;
    if (!this.ehOrg(ctx, camp)) return;
    const t = norm(texto);
    if (!/^\d{1,2}$/.test(t)) return;
    const i = parseInt(t, 10);
    if (i < 1 || i > TAMANHOS.length) return say(`Escolha um número de 1 a ${TAMANHOS.length}.`);
    const op = TAMANHOS[i - 1];
    camp.mega = op.n === 64;
    const pool = this.poolDe(camp).length;
    if (op.n > pool) {
      camp.mega = false;
      return say(`${COMPETICOES[camp.competicao].nome} só tem ${pool} clubes. Escolha outra opção (1 = mega torneio com clubes de várias ligas).`);
    }
    camp.etapaNome = op.nome;
    this.sortearClubes(camp, op.n);
    camp.status = 'inscricoes';
    say(this.textoCamp(camp), [camp.organizador]);
  }

  tituloCamp(camp) {
    if (camp.mega) return camp.competicao && COMPETICOES[camp.competicao].selecoes ? '🌍 MEGA COPA DE SELEÇÕES' : '🌍 MEGA TORNEIO';
    const comp = COMPETICOES[camp.competicao];
    return `${comp.emoji} ${comp.nome.toUpperCase()}`;
  }

  // mensagem de abertura das inscrições (fluxo novo)
  textoCamp(camp) {
    if (camp.aberto) return this.textoAberto(camp);
    const vagas = camp.tamanho;
    return (
      `${this.tituloCamp(camp)} ⚔️ *${NOME_MODO[camp.modo]}*${camp.aleatorio ? ' 🎲 *ALEATÓRIO*' : ''}\n` +
      `📍 *${camp.etapaNome}* (${camp.clubes.length} clubes)\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      camp.clubes.map((c) => `${c.cores || '⚪'} *${c.nome.toUpperCase()}* ▸ _(Livre)_`).join('\n') +
      `\n\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
      `✍️ _Time de ${vagas} ${vagas === 1 ? 'vaga' : 'vagas'} ▸ escreve o nome do time pra entrar, até completar!_\n` +
      (camp.aleatorio
        ? `🎲 _Modo aleatório: escolha um time. Quando encher, o bot embaralha todo mundo entre os times e sorteia os confrontos._\n`
        : '') +
      `🎙️ Organização: ${tag(camp.organizador)}`
    );
  }

  // ---------- camp aberto: ninguém escolhe time, só digita "vou jogar" ----------
  vagasAberto(camp) { return camp.clubes.length * camp.tamanho; }

  textoAberto(camp) {
    const total = this.vagasAberto(camp);
    const n = (camp.inscritos || []).length;
    return (
      `${this.tituloCamp(camp)} ⚔️ *${NOME_MODO[camp.modo]}* 🎟️ *CAMP ABERTO*\n` +
      `📍 *${camp.etapaNome}* (${camp.clubes.length} clubes)\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      `👉 Quer jogar? Digita *vou jogar* que o bot já te escreve!\n` +
      `🎲 Os times e os clubes saem *sorteados* quando fechar as vagas.\n\n` +
      `✅ Inscritos: *${n}/${total}*` +
      (n ? `\n${camp.inscritos.map(tag).join(' ')}` : '') +
      `\n\n🎙️ Organização: ${tag(camp.organizador)}`
    );
  }

  // "vou jogar" (ou /voujogar)
  vouJogar(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'inscricoes' || !camp.aberto) return;
    const id = msg.senderId;
    this.registrar(ctx);
    const mesmo = (a, b) => this.chaveId(a) === this.chaveId(b);
    if (camp.inscritos.some((x) => mesmo(x, id))) return say(`${tag(id)} você já está inscrito! Entrou, não sai mais. (${camp.inscritos.length}/${this.vagasAberto(camp)})`, [id]);
    camp.inscritos.push(id);
    const total = this.vagasAberto(camp);
    say(`✅ ${tag(id)} entrou no camp! *${camp.inscritos.length}/${total}*`, [id]);
    if (camp.inscritos.length >= total) this.comecarAberto(ctx, camp);
  }

  // fecha as vagas: embaralha todo mundo e sorteia os clubes
  comecarAberto(ctx, camp) {
    const { say } = ctx;
    const jogadores = camp.inscritos;
    const k = Math.min(Math.floor(jogadores.length / camp.tamanho), camp.clubes.length);
    if (k < 2) return say(`Precisa de pelo menos ${2 * camp.tamanho} jogadores pra sortear (tem ${jogadores.length}).`);
    const emb = this.embaralhar(jogadores);
    const clubes = this.embaralhar(camp.clubes).slice(0, k).map((c, i) => ({
      nome: c.nome, apelidos: c.apelidos, cores: c.cores,
      jogadores: emb.slice(i * camp.tamanho, (i + 1) * camp.tamanho),
    }));
    const reservas = emb.slice(k * camp.tamanho);
    camp.clubes = clubes;
    camp.numClubes = k;
    camp.status = 'andamento';
    let txt = `🎲 *Vagas fechadas! Sorteio feito!*\n\n` +
      clubes.map((c) => `${c.cores || '⚽'} *${c.nome.toUpperCase()}* — ${c.jogadores.map(tag).join(' ')}`).join('\n');
    if (reservas.length) txt += `\n\n🪑 Ficaram de fora (faltou gente pra completar): ${reservas.map(tag).join(' ')}`;
    say(txt, [...emb]);
    this.proximaRodada(ctx, camp, clubes.map((c) => c.nome));
  }

  // linha de um time: bolinhas, nome e quem está dentro (marcado) ou (Livre)
  linhaTime(camp, c) {
    const nomes = c.jogadores.map(tag);
    while (nomes.length < camp.tamanho) nomes.push('_(Livre)_');
    return `${c.cores || '⚪'} *${c.nome.toUpperCase()}* ▸ ${nomes.join(' & ')}`;
  }

  // /listacamp: times livres e preenchidos, marcando as pessoas
  listaCamp(ctx, camp) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return say('Não tem inscrições abertas agora. Use /iniciarcampx1, /iniciarcampx2 ou /iniciarcampx3.');
    if (camp.aberto) return say(this.textoAberto(camp), [...camp.inscritos, camp.organizador]);
    const cheios = camp.clubes.filter((c) => c.jogadores.length >= camp.tamanho);
    const livres = camp.clubes.filter((c) => c.jogadores.length < camp.tamanho);
    const vagas = livres.reduce((n, c) => n + camp.tamanho - c.jogadores.length, 0);
    let txt = `📋 *${this.tituloCamp(camp)} ⚔️ ${NOME_MODO[camp.modo]}*${camp.aleatorio ? ' 🎲' : ''}\n` +
      `✅ ${cheios.length} preenchido${cheios.length === 1 ? '' : 's'} · 🟡 ${livres.length} com vaga · ${vagas} vaga${vagas === 1 ? '' : 's'} livre${vagas === 1 ? '' : 's'}`;
    if (livres.length) txt += `\n\n🟡 *TIMES LIVRES*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` + livres.map((c) => this.linhaTime(camp, c)).join('\n');
    if (cheios.length) txt += `\n\n✅ *TIMES PREENCHIDOS*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` + cheios.map((c) => this.linhaTime(camp, c)).join('\n');
    say(txt, camp.clubes.flatMap((c) => c.jogadores));
  }

  // /removertime — só admin; respondendo a mensagem da pessoa ou marcando ela
  removerTime(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'inscricoes') return say('Não tem inscrições abertas agora.');
    if (!msg.isAdmin) return say('Só admin remove alguém do time.');
    const alvo = (msg.mentions || [])[0] || (msg.quoted && msg.quoted.senderId) || null;
    if (!alvo) return say('Responda a mensagem da pessoa com /removertime, ou marque ela: /removertime @fulano');
    const mesmo = (a, b) => a === b || a.split('@')[0].split(':')[0] === b.split('@')[0].split(':')[0];
    if (camp.aberto) {
      const i = camp.inscritos.findIndex((j) => mesmo(j, alvo));
      if (i < 0) return say(`${tag(alvo)} não está inscrito.`, [alvo]);
      const [saiu] = camp.inscritos.splice(i, 1);
      return say(`🗑️ ${tag(saiu)} foi removido do camp por um admin. *${camp.inscritos.length}/${this.vagasAberto(camp)}*`, [saiu]);
    }
    for (const c of camp.clubes) {
      const i = c.jogadores.findIndex((j) => mesmo(j, alvo));
      if (i >= 0) {
        const [saiu] = c.jogadores.splice(i, 1);
        return say(`🗑️ ${tag(saiu)} foi removido do *${c.nome}* por um admin.\n\n${this.blocoTime(camp, c, false)}`, [saiu]);
      }
    }
    say(`${tag(alvo)} não está em nenhum time.`, [alvo]);
  }

  // /vitoria eu · /vitoria @fulano (admin confirma na hora) · jogador pede e os admins confirmam
  vitoria(ctx, camp, args, natural = false) {
    const { say, sayAdmins, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    const id = msg.senderId;
    const t = norma(args);
    const marcado = (msg.mentions || [])[0] || (msg.quoted && msg.quoted.senderId) || null;
    const abertas = () => this.partidasDaRodada(camp).filter((x) => x.estado !== 'finalizada');
    // admin sem dizer quem: confirma o pedido pendente, se só tiver um
    if (!natural && msg.isAdmin && !marcado && t !== 'eu') {
      const pedidos = abertas().filter((x) => x.pedido);
      if (pedidos.length === 1 && !pedidos[0].disputa) return this.finalizar(ctx, camp, pedidos[0], pedidos[0].pedido.lado);
      return say('Use: */vitoria eu* (se você ganhou) ou */vitoria @quem ganhou*.');
    }
    const alvo = marcado || id;
    const p = abertas().find((x) => x.timeA.jogadores.includes(alvo) || x.timeB.jogadores.includes(alvo));
    if (!p) {
      if (natural) return; // conversa solta
      return say(marcado ? `${tag(alvo)} não está em nenhum jogo em aberto.` : 'Você não está em nenhum jogo em aberto.', marcado ? [alvo] : []);
    }
    this.registrar(ctx);
    const lado = p.timeA.jogadores.includes(alvo) ? 'A' : 'B';
    if (msg.isAdmin && !natural) return this.finalizar(ctx, camp, p, lado);
    // jogador pediu: só os admins confirmam
    if (p.pedido && p.pedido.lado === lado) return say('Já avisei os admins. Aguarde a confirmação.');
    if (p.pedido && p.pedido.lado !== lado) p.disputa = true;
    p.pedido = { por: id, lado, em: Date.now() };
    const venc = lado === 'A' ? p.timeA : p.timeB;
    sayAdmins(
      `🏆 ${tag(id)} pediu a vitória do *${venc.clube}* em *${p.timeA.clube} x ${p.timeB.clube}*.\n\n` +
      (p.disputa
        ? `⚠️ Os dois times pediram a vitória! Admins, marquem quem ganhou: */vitoria @fulano*`
        : `Admins, está certo? Confirmem com */confirmar* (ou */vitoria @fulano*). Se não, */negar*.`),
      [id]
    );
  }

  // /negar — admin nega os pedidos de vitória em aberto
  negar(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    if (!msg.isAdmin) return say('Só admin nega um pedido de vitória.');
    const pedidos = this.partidasDaRodada(camp).filter((x) => x.pedido && x.estado !== 'finalizada');
    if (!pedidos.length) return say('Nenhum pedido de vitória em aberto.');
    pedidos.forEach((x) => { x.pedido = null; x.disputa = false; });
    say(`❌ Pedido de vitória negado (${pedidos.map((x) => `${x.timeA.clube} x ${x.timeB.clube}`).join(', ')}). O jogo segue em aberto.`);
  }

  // ---------- criação do campeonato ----------
  iniciar(ctx, camp, args) {
    const { say, msg } = ctx;
    if (camp) {
      return say('Já tem um campeonato rolando aqui. Use /status pra ver, ou /cancelar (admin) pra encerrar.');
    }
    this.registrar(ctx);
    const id = this.store.novoId('campeonato');
    const novo = {
      id, chatId: msg.chatId, organizador: msg.senderId, status: 'competicao',
      competicao: null, modo: null, tamanho: 0, clubes: [], rodada: 0,
      partidas: [], passaram: [], criadoEm: Date.now(),
    };
    this.store.data.campeonatos[id] = novo;
    this.store.data.ativos[msg.chatId] = id;

    // atalho: /iniciar champions x3
    const toks = args.split(/\s+/).map(norma).filter(Boolean);
    const comp = toks.find((t) => COMPETICOES[t]);
    const modo = toks.find((t) => MODOS[t]);
    if (comp) {
      this.escolherCompeticao(ctx, novo, comp);
      if (modo) this.escolherModo(ctx, novo, modo);
      return;
    }
    say(
      `🏟️ *Novo campeonato!* Escolha a competição:\n\n` +
      ['champions', 'libertadores', 'brasileirao'].map((k) => `${COMPETICOES[k].emoji} /${k}`).join('\n')
    );
  }

  escolherCompeticao(ctx, camp, chave) {
    const { say } = ctx;
    if (!camp || camp.status !== 'competicao') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou o campeonato (ou um admin) escolhe a competição.');
    camp.competicao = chave;
    camp.status = 'modo';
    const comp = COMPETICOES[chave];
    say(`${comp.emoji} *${comp.nome}*! Agora o modo:\n\n/x1 — 1 contra 1\n/x2 — 2 contra 2\n/x3 — 3 contra 3`);
  }

  // clubes que podem entrar: da liga escolhida (ou misturados, no mega torneio)
  poolDe(camp) {
    return camp.mega ? poolMega(camp.competicao) : COMPETICOES[camp.competicao].clubes;
  }

  sortearClubes(camp, quantidade) {
    camp.clubes = this.embaralhar(this.poolDe(camp))
      .slice(0, quantidade)
      .map((c) => ({ nome: c.nome, apelidos: c.apelidos, cores: c.cores, jogadores: [] }));
    camp.numClubes = camp.clubes.length;
  }

  escolherModo(ctx, camp, modo) {
    const { say } = ctx;
    if (!camp || camp.status !== 'modo') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou o campeonato (ou um admin) escolhe o modo.');
    camp.modo = modo;
    camp.tamanho = MODOS[modo];
    const pool = this.poolDe(camp).length;
    this.sortearClubes(camp, Math.min(8, pool));
    camp.status = 'inscricoes';
    say(this.textoInscricoes(camp));
  }

  // ---------- modo aleatório ----------
  // /x3aleatorio [competição] [fase]  — admin abre; todos escolhem clube; o bot embaralha jogadores e confrontos
  iniciarAleatorio(ctx, camp, modo, args) {
    const { say, msg } = ctx;
    if (!msg.isAdmin) return say('Só admin abre o modo aleatório.');
    if (camp) return say('Já tem um campeonato rolando aqui. Use /status pra ver, ou /cancelar (admin) pra encerrar.');
    if (!MODOS[modo]) return;
    this.registrar(ctx);
    const toks = String(args || '').split(/\s+/).map(norma).filter(Boolean);
    const comp = toks.find((t) => COMPETICOES[t]) || 'champions';
    const fase = toks.find((t) => ETAPAS[t.replace(/definal$|finais?$/, '') || 'final']);
    const id = this.store.novoId('campeonato');
    const novo = {
      id, chatId: msg.chatId, organizador: msg.senderId, status: 'etapa', aleatorio: true,
      competicao: comp, modo, tamanho: MODOS[modo], clubes: [], rodada: 0,
      partidas: [], passaram: [], criadoEm: Date.now(),
    };
    this.store.data.campeonatos[id] = novo;
    this.store.data.ativos[msg.chatId] = id;
    if (fase) return this.escolherEtapa(ctx, novo, ETAPAS[fase.replace(/definal$|finais?$/, '') || 'final']);
    const t = novo.tamanho;
    const linha = (cmd, n) => `${cmd} — ${n} times (${n * t} jogadores)`;
    say(
      `🎲 *Modo aleatório ${modo.toUpperCase()}* — ${COMPETICOES[comp].nome}\n` +
      `Admin, escolha até onde vai o mata-mata:\n\n` +
      [['/final', 2], ['/semi', 4], ['/quartas', 8], ['/oitavas', 16]].map(([c, n]) => linha(c, n)).join('\n')
    );
  }

  escolherEtapa(ctx, camp, n) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'etapa' || !n) return;
    if (!msg.isAdmin) return say('Só admin escolhe a fase.');
    const pool = this.poolDe(camp).length;
    if (n > pool) return say(`Essa competição só tem ${pool} clubes. Escolha uma fase menor.`);
    this.sortearClubes(camp, n);
    camp.status = 'inscricoes';
    say(this.textoInscricoes(camp));
  }

  // embaralha todos os inscritos entre os clubes e começa o mata-mata (confrontos também sorteados)
  comecarAleatorio(ctx, camp) {
    const { say } = ctx;
    const jogadores = camp.clubes.flatMap((c) => c.jogadores);
    const k = Math.min(Math.floor(jogadores.length / camp.tamanho), camp.clubes.length);
    if (k < 2) {
      return say(`Precisa de pelo menos ${2 * camp.tamanho} jogadores pra sortear (tem ${jogadores.length}).`);
    }
    // Embaralha DE VERDADE: tenta várias vezes e fica com o sorteio que mais espalha a galera —
    // ninguém no clube que escolheu e ninguém junto de quem já era do mesmo time (quando dá).
    const origem = {}; // jogador -> clube que ele escolheu
    for (const c of camp.clubes) for (const j of c.jogadores) origem[j] = c.nome;
    let melhor = null;
    for (let t = 0; t < 3000; t++) {
      const emb = this.embaralhar(jogadores);
      const cls = this.embaralhar(camp.clubes).slice(0, k).map((c, i) => ({
        nome: c.nome, apelidos: c.apelidos, cores: c.cores,
        jogadores: emb.slice(i * camp.tamanho, (i + 1) * camp.tamanho),
      }));
      let nota = 0;
      for (const c of cls) {
        const cont = {};
        for (const j of c.jogadores) {
          if (origem[j] === c.nome) nota += 3; // ficou no clube que escolheu
          cont[origem[j]] = (cont[origem[j]] || 0) + 1;
        }
        for (const q of Object.values(cont)) nota += (q * (q - 1)) / 2; // pares que já eram do mesmo time
      }
      if (!melhor || nota < melhor.nota) melhor = { nota, cls, emb };
      if (nota === 0) break;
    }
    const clubes = melhor.cls;
    const reservas = melhor.emb.slice(k * camp.tamanho);
    camp.clubes = clubes;
    camp.numClubes = k;
    camp.status = 'andamento';

    let txt = `🎲 *Sorteio feito!* Jogadores embaralhados entre os times:\n\n` +
      clubes.map((c) => `⚽ *${c.nome}* — ${c.jogadores.map(tag).join(' ')}`).join('\n');
    if (reservas.length) txt += `\n\n🪑 Ficaram de fora (faltou gente pra completar): ${reservas.map(tag).join(' ')}`;
    say(txt, [...clubes.flatMap((c) => c.jogadores), ...reservas]);
    this.proximaRodada(ctx, camp, clubes.map((c) => c.nome));
  }

  // /embaralhar — admin/organizador: mistura os jogadores entre os times (qualquer modo).
  // Vale nas inscrições, ou na rodada que ainda não começou (ninguém pediu "cria" ainda). Os confrontos de clubes não mudam.
  embaralharTimes(ctx, camp) {
    const { say } = ctx;
    if (!camp || !['inscricoes', 'andamento'].includes(camp.status)) return say('Não tem campeonato com times pra embaralhar agora.');
    if (!this.ehOrg(ctx, camp)) return say('Só admin (ou quem iniciou o camp) embaralha os times.');
    if (camp.aberto && camp.status === 'inscricoes') return say('No camp aberto os times só saem quando fechar as vagas — aí o sorteio já é aleatório.');
    const partidas = camp.status === 'andamento' ? this.partidasDaRodada(camp) : [];
    if (partidas.some((p) => p.estado !== 'aguardando_cria' || p.pedido)) {
      return say('Não dá mais pra embaralhar: já tem jogo em andamento nessa rodada.');
    }
    const jogadores = camp.clubes.flatMap((c) => c.jogadores);
    const cheios = camp.clubes.filter((c) => c.jogadores.length > 0).length;
    if (cheios < 2 || jogadores.length < 2) return say('Precisa de jogadores em pelo menos 2 times pra embaralhar.');

    const origem = {};
    for (const c of camp.clubes) for (const j of c.jogadores) origem[j] = c.nome;
    const tamanhos = camp.clubes.map((c) => c.jogadores.length); // cada time mantém o mesmo número de vagas ocupadas
    let melhor = null;
    for (let t = 0; t < 3000; t++) {
      const emb = this.embaralhar(jogadores);
      let pos = 0;
      let nota = 0;
      const novo = camp.clubes.map((c, i) => {
        const lista = emb.slice(pos, pos + tamanhos[i]);
        pos += tamanhos[i];
        const cont = {};
        for (const j of lista) {
          if (origem[j] === c.nome) nota += 3; // ficou onde estava
          cont[origem[j]] = (cont[origem[j]] || 0) + 1;
        }
        for (const q of Object.values(cont)) nota += (q * (q - 1)) / 2; // pares que já eram do mesmo time
        return lista;
      });
      if (!melhor || nota < melhor.nota) melhor = { nota, novo };
      if (nota === 0) break;
    }
    camp.clubes.forEach((c, i) => { c.jogadores = melhor.novo[i]; });
    // atualiza os confrontos (mesmos clubes, jogadores novos)
    for (const p of partidas) {
      for (const lado of [p.timeA, p.timeB]) {
        const c = camp.clubes.find((x) => x.nome === lado.clube);
        if (c) lado.jogadores = [...c.jogadores];
      }
    }
    let txt = `🔀 *Times embaralhados!*\n\n` +
      camp.clubes.filter((c) => c.jogadores.length).map((c) => `${c.cores || '⚽'} *${c.nome}* — ${c.jogadores.map(tag).join(' ')}`).join('\n');
    if (partidas.length) {
      txt += `\n\n*Confrontos* (os mesmos de antes, com os jogadores novos):\n` +
        partidas.map((p) => `*${p.num})* ${p.timeA.clube} x ${p.timeB.clube}`).join('\n');
    }
    say(txt, jogadores);
  }

  textoInscricoes(camp) {
    const comp = COMPETICOES[camp.competicao];
    return (
      `${comp.emoji} *${comp.nome} — ${camp.modo.toUpperCase()}* (${camp.tamanho} contra ${camp.tamanho})\n` +
      `Mata-mata com ${camp.clubes.length} clubes.\n\n` +
      (camp.aleatorio
        ? `🎲 *Modo aleatório:* escolha um clube pra entrar. Quando encher, o bot *embaralha os jogadores entre os times* e sorteia os confrontos!\n\n👉 *Digite o nome do clube*\n\n`
        : `👉 *Digite o nome do clube* pra entrar no time!\n\n`) +
      this.formatClubes(camp) +
      `\n\nQuer outra quantidade de clubes? /times 4 (reinicia as inscrições)`
    );
  }

  mudarTimes(ctx, camp, args) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou o campeonato (ou um admin) muda isso.');
    if (camp.aberto) return say('No camp aberto a quantidade já foi escolhida. Cancele (/cancelar) e abra de novo se quiser mudar.');
    const n = parseInt(args, 10);
    const pool = this.poolDe(camp).length;
    if (!Number.isInteger(n) || n < 2 || n > pool) return say(`Use /times com um número de 2 a ${pool}.`);
    this.sortearClubes(camp, n);
    say('🔄 Clubes sorteados de novo, inscrições reiniciadas!\n\n' + this.textoInscricoes(camp));
  }

  // ---------- inscrições ----------
  entrar(ctx, camp, texto, explicito) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
    if (camp.aberto) return explicito ? say('No camp aberto não escolhe time: digite *vou jogar*.') : undefined;
    const clube = acharClube(texto, camp.clubes);
    if (!clube) {
      if (explicito) say('Não achei esse clube. Clubes disponíveis:\n\n' + this.formatClubes(camp));
      return;
    }
    const id = ctx.msg.senderId;
    this.registrar(ctx);
    if (camp.novo) {
      const atual = camp.clubes.find((c) => c.jogadores.includes(id));
      if (atual) return say(`Você já está no *${atual.nome}*. Entrou, não sai mais — só admin tira (/removertime).`);
    }
    if (clube.jogadores.includes(id)) return say(`Você já está no ${clube.nome}.`);
    if (clube.jogadores.length >= camp.tamanho) {
      return say(`O ${clube.nome} já está completo (${camp.tamanho}/${camp.tamanho}). Escolha outro clube!`);
    }
    let antigo = null;
    for (const c of camp.clubes) {
      const i = c.jogadores.indexOf(id);
      if (i >= 0) { c.jogadores.splice(i, 1); antigo = c; }
    }
    clube.jogadores.push(id);
    let txt = `✅ ${camp.novo ? tag(id) : this.nome(id)} ${antigo ? `saiu do ${antigo.nome} e ` : ''}entrou no time!\n\n${this.blocoTime(camp, clube)}`;
    if (antigo) txt += `\n\n_Como ficou o ${antigo.nome}:_\n${this.blocoTime(camp, antigo, false)}`;
    say(txt, [...clube.jogadores]);
    if (camp.clubes.every((c) => c.jogadores.length >= camp.tamanho)) {
      return camp.aleatorio ? this.comecarAleatorio(ctx, camp) : this.comecarMataMata(ctx, camp);
    }
  }

  sair(ctx, camp) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
    if (camp.novo) return say('Entrou, não sai mais. Só admin tira alguém do time (/removertime).');
    const id = ctx.msg.senderId;
    for (const c of camp.clubes) {
      const i = c.jogadores.indexOf(id);
      if (i >= 0) {
        c.jogadores.splice(i, 1);
        return say(`👋 ${this.nome(id)} saiu do time.\n\n${this.blocoTime(camp, c, false)}`);
      }
    }
    say('Você não está em nenhum clube.');
  }

  cancelar(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp) return say('Não tem campeonato rolando.');
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou (ou um admin) pode cancelar.');
    camp.status = 'cancelado';
    delete this.store.data.ativos[msg.chatId];
    say('🛑 Campeonato cancelado. Use /iniciar pra começar outro.');
  }

  comecar(ctx, camp) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou (ou um admin) pode começar antes da hora.');
    if (camp.aberto) return this.comecarAberto(ctx, camp);
    if (camp.aleatorio) return this.comecarAleatorio(ctx, camp);
    const completos = camp.clubes.filter((c) => c.jogadores.length >= camp.tamanho);
    if (completos.length < 2) return say('Precisa de pelo menos 2 clubes completos pra começar.');
    camp.clubes = completos;
    this.comecarMataMata(ctx, camp);
  }

  // ---------- mata-mata ----------
  comecarMataMata(ctx, camp) {
    camp.status = 'andamento';
    ctx.say('⚽ *Todos os times preenchidos!* Montando os confrontos...');
    this.proximaRodada(ctx, camp, camp.clubes.map((c) => c.nome));
  }

  nomeRodada(n) {
    if (n <= 2) return 'Final';
    if (n <= 4) return 'Semifinal';
    if (n <= 8) return 'Quartas de final';
    if (n <= 16) return 'Oitavas de final';
    if (n <= 32) return 'Fase de 32';
    return 'Fase de 64';
  }

  time(camp, nomeClube) {
    const c = camp.clubes.find((x) => x.nome === nomeClube);
    return { clube: c.nome, jogadores: [...c.jogadores] };
  }

  proximaRodada(ctx, camp, vivos) {
    camp.rodada++;
    const lista = this.embaralhar(vivos);
    const folga = lista.length % 2 ? lista.pop() : null;
    const nome = this.nomeRodada(vivos.length);
    camp.nomeRodada = nome;
    camp.partidas = [];
    camp.passaram = folga ? [folga] : [];

    const linhas = [];
    const mencoes = new Set();
    for (let i = 0; i < lista.length; i += 2) {
      const id = this.store.novoId('partida');
      const p = {
        id, num: i / 2 + 1, chatId: camp.chatId, campeonatoId: camp.id,
        rodada: camp.rodada, nomeRodada: nome,
        timeA: this.time(camp, lista[i]), timeB: this.time(camp, lista[i + 1]),
        estado: 'aguardando_cria', stats: {},
      };
      this.store.data.partidas[id] = p;
      camp.partidas.push(id);
      [...p.timeA.jogadores, ...p.timeB.jogadores].forEach((j) => mencoes.add(j));
      linhas.push(
        `*${p.num})* ${p.timeA.clube} x ${p.timeB.clube}\n    ${p.timeA.jogadores.map(tag).join(' ')}  ×  ${p.timeB.jogadores.map(tag).join(' ')}`
      );
    }
    let txt = `📋 *${nome}*\n\n${linhas.join('\n')}`;
    if (folga) txt += `\n\n😴 Folga (passa direto): *${folga}*`;
    txt +=
      `\n\n👉 Em cada jogo, alguém de um dos times manda *cria*. ` +
      `Quem mandar primeiro faz o time ADVERSÁRIO criar a sala no jogo.`;
    if (camp.novo) txt += `\n🏁 No fim: o admin manda */vitoria eu* ou */vitoria @quem ganhou*. Quem ganhou também pode falar *ganhei*.`;
    ctx.say(txt, [...mencoes]);
  }

  cria(ctx, camp) {
    const { say, msg } = ctx;
    const id = msg.senderId;
    const p = this.minhaPartida(camp, id);
    if (!p) return; // não está em nenhum jogo da rodada: ignora
    this.registrar(ctx);
    if (p.estado === 'aguardando_cria') {
      const meu = this.ladoDe(p, id);
      const outro = this.outroLado(p, id);
      p.estado = 'aguardando_sala';
      p.pediu = meu.clube;
      p.criador = outro.clube;
      return say(
        `⚡ ${tag(id)} (${meu.clube}) mandou primeiro!\n\n` +
        `O *${outro.clube}* cria a sala. ${outro.jogadores.map(tag).join(' ')} — ` +
        `alguém crie a sala no jogo e mande: */sala CÓDIGO*`,
        [id, ...outro.jogadores]
      );
    }
    if (p.estado === 'aguardando_sala') {
      return say(`O ${p.pediu} já pediu primeiro. Quem cria a sala é o *${p.criador}* (/sala CÓDIGO).`);
    }
  }

  sala(ctx, camp, args) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    const id = msg.senderId;
    const p = this.minhaPartida(camp, id, ['aguardando_sala', 'jogando']);
    if (!p) return;
    const meu = this.ladoDe(p, id);
    if (p.estado === 'aguardando_sala' && meu.clube !== p.criador) {
      return say(`Quem cria a sala é o *${p.criador}*, não o ${meu.clube}.`);
    }
    const codigo = args.trim().slice(0, 40);
    if (!codigo) return say('Manda o código assim: /sala 12345');
    this.registrar(ctx);
    if (!p.criador) p.criador = meu.clube;
    p.codigo = codigo;
    p.estado = 'jogando';
    const outro = p.criador === p.timeA.clube ? p.timeB : p.timeA;
    say(
      `🔑 Sala criada por ${tag(id)} (${meu.clube})!\n\n*Código: ${codigo}*\n\n` +
      `${outro.jogadores.map(tag).join(' ')} — podem entrar! Bom jogo!\n` +
      (camp.novo
        ? `Quando acabar: o admin manda /vitoria eu ou /vitoria @quem ganhou (quem ganhou também pode falar *ganhei*).`
        : `Quando acabar: /placar 3x1 (seu time primeiro)`),
      [id, ...outro.jogadores]
    );
  }

  // lê "3x1", "3-1" ou "2x2 pen 4x3"
  lerPlacar(args) {
    const t = args.toLowerCase().replace(/×/g, 'x').replace(/[–—-]/g, 'x');
    const m = t.match(/(\d+)\s*x\s*(\d+)(?:.*?p[eê]n\w*\s*(\d+)\s*x\s*(\d+))?/);
    if (!m) return null;
    const r = { a: +m[1], b: +m[2], pen: null };
    if (m[3] !== undefined) r.pen = { a: +m[3], b: +m[4] };
    return r;
  }

  placar(ctx, camp, args) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    const id = msg.senderId;
    const p = this.minhaPartida(camp, id, ['aguardando_cria', 'aguardando_sala', 'jogando', 'aguardando_confirmacao']);
    if (!p) return;
    if (p.estado === 'aguardando_cria' || p.estado === 'aguardando_sala') {
      return say('Antes do placar, a sala precisa ser criada. Mandem *cria* e depois /sala CÓDIGO.');
    }
    const r = this.lerPlacar(args);
    if (!r) return say('Use assim: /placar 3x1 (seu time primeiro). Se empatar: /placar 2x2 pen 4x3');
    if (r.a === r.b && (!r.pen || r.pen.a === r.pen.b)) {
      return say('Empate precisa de pênaltis: /placar 2x2 pen 4x3');
    }
    this.registrar(ctx);
    const souA = p.timeA.jogadores.includes(id);
    // guarda sempre do ponto de vista do timeA
    p.placar = souA ? { a: r.a, b: r.b } : { a: r.b, b: r.a };
    p.penaltis = r.pen ? (souA ? r.pen : { a: r.pen.b, b: r.pen.a }) : null;
    p.reportadoPor = id;
    p.reportadoClube = this.ladoDe(p, id).clube;
    p.estado = 'aguardando_confirmacao';
    const outro = this.outroLado(p, id);
    say(
      `📝 ${tag(id)} (${p.reportadoClube}) informou:\n*${this.textoPlacar(p)}*\n\n` +
      `${outro.jogadores.map(tag).join(' ')} — o *${outro.clube}* confirma com */confirmar*. ` +
      `Se estiver errado, mande o /placar certo.`,
      [id, ...outro.jogadores]
    );
  }

  textoPlacar(p) {
    if (!p.placar) return `${p.timeA.clube} x ${p.timeB.clube} — vitória do ${p.vencedor || '?'}`;
    let t = `${p.timeA.clube} ${p.placar.a} x ${p.placar.b} ${p.timeB.clube}`;
    if (p.penaltis) t += ` (pên. ${p.penaltis.a} x ${p.penaltis.b})`;
    return t;
  }

  confirmar(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    // admin confirmando um pedido de vitória
    const pedidos = this.partidasDaRodada(camp).filter((x) => x.pedido && x.estado !== 'finalizada');
    if (msg.isAdmin && pedidos.length) {
      if (pedidos.length > 1 || pedidos[0].disputa) return say('Tem mais de um pedido (ou os dois times pediram). Marque quem ganhou: /vitoria @fulano');
      return this.finalizar(ctx, camp, pedidos[0], pedidos[0].pedido.lado);
    }
    const p = this.minhaPartida(camp, msg.senderId, ['aguardando_confirmacao']);
    if (!p) return;
    if (this.ladoDe(p, msg.senderId).clube === p.reportadoClube) {
      return say('Quem confirma é o time adversário de quem informou o placar.');
    }
    this.finalizar(ctx, camp, p);
  }

  forcar(ctx, camp, args) {
    const { say } = ctx;
    if (!camp || camp.status !== 'andamento') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou (ou um admin) pode forçar um resultado.');
    const pend = this.partidasDaRodada(camp).filter((p) => p.estado === 'aguardando_confirmacao');
    if (!pend.length) return say('Nenhum placar esperando confirmação.');
    const n = parseInt(args, 10);
    const p = Number.isInteger(n) ? pend.find((x) => x.num === n) : pend.length === 1 ? pend[0] : null;
    if (!p) return say(`Qual jogo? Use /forcar N (jogos pendentes: ${pend.map((x) => x.num).join(', ')}).`);
    this.finalizar(ctx, camp, p);
  }

  finalizar(ctx, camp, p, lado = null) {
    const aGanhou = lado
      ? lado === 'A'
      : p.penaltis
        ? p.penaltis.a > p.penaltis.b
        : p.placar.a > p.placar.b;
    p.pedido = null;
    p.disputa = false;
    p.vencedor = aGanhou ? p.timeA.clube : p.timeB.clube;
    p.perdedor = aGanhou ? p.timeB.clube : p.timeA.clube;
    p.estado = 'finalizada';
    p.finalizadaEm = Date.now();
    const venc = aGanhou ? p.timeA : p.timeB;
    ctx.say(
      `✅ *FIM DE JOGO*\n${this.textoPlacar(p)}\n\n🎉 Avança: *${p.vencedor}*\n\n` +
      `Mandem suas stats: /gols N e /assist N`,
      venc.jogadores
    );
    camp.passaram.push(p.vencedor);

    const partidas = this.partidasDaRodada(camp);
    if (!partidas.every((x) => x.estado === 'finalizada')) {
      const faltam = partidas.filter((x) => x.estado !== 'finalizada').length;
      return ctx.say(`Faltam ${faltam} jogo(s) da fase.`);
    }
    if (camp.passaram.length === 1) return this.encerrar(ctx, camp, p);
    this.proximaRodada(ctx, camp, camp.passaram);
  }

  encerrar(ctx, camp, final) {
    const camp_ = this.store.data.campeonatos[camp.id];
    const campeao = camp.clubes.find((c) => c.nome === final.vencedor);
    const vice = camp.clubes.find((c) => c.nome === final.perdedor);
    camp_.status = 'fim';
    camp_.campeao = campeao.nome;
    camp_.vice = vice.nome;
    camp_.campeaoJogadores = [...campeao.jogadores];
    camp_.viceJogadores = [...vice.jogadores];
    camp_.encerradoEm = Date.now();
    delete this.store.data.ativos[camp.chatId];
    ctx.say(
      `🏆🏆🏆 *CAMPEÃO: ${campeao.nome}!* 🏆🏆🏆\n\n` +
      `🥇 ${campeao.jogadores.map(tag).join(' ')}\n` +
      `🥈 Vice: ${vice.nome} (${vice.jogadores.map((j) => this.nome(j)).join(', ')})\n\n` +
      `Troféu registrado! Veja /trofeus /ranking /artilharia`,
      campeao.jogadores
    );
  }

  // ---------- stats ----------
  stat(ctx, tipo, args) {
    const { say, msg } = ctx;
    const n = parseInt(args, 10);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      return say(`Use assim: /${tipo === 'gols' ? 'gols' : 'assist'} 2 (quantidade na sua última partida)`);
    }
    const id = msg.senderId;
    const minhas = Object.values(this.store.data.partidas)
      .filter(
        (p) =>
          p.chatId === msg.chatId &&
          p.estado !== 'aguardando_cria' &&
          p.estado !== 'aguardando_sala' &&
          (p.timeA.jogadores.includes(id) || p.timeB.jogadores.includes(id))
      )
      .sort((a, b) => b.id - a.id);
    if (!minhas.length) return say('Você ainda não jogou nenhuma partida por aqui.');
    const p = minhas[0];
    this.registrar(ctx);
    p.stats[id] = p.stats[id] || { gols: 0, assist: 0 };
    p.stats[id][tipo] = n;
    const quem = this.nome(id);
    say(
      tipo === 'gols'
        ? `⚽ ${quem}: ${n} gol(s) em ${p.timeA.clube} x ${p.timeB.clube}`
        : `🎯 ${quem}: ${n} assistência(s) em ${p.timeA.clube} x ${p.timeB.clube}`
    );
  }

  // ---------- status ----------
  status(ctx, camp) {
    const { say } = ctx;
    if (!camp) return say('Nenhum campeonato rolando. Use /iniciar pra começar um.');
    if (camp.status === 'competicao') return say('Escolha a competição: /champions /libertadores /brasileirao');
    if (camp.status === 'liga') return say(this.menuLigas(camp));
    if (camp.status === 'tamanho') return say(this.menuTamanhos(camp));
    if (camp.status === 'modo') return say('Escolha o modo: /x1 /x2 /x3');
    if (camp.status === 'etapa') return say('Admin, escolha a fase: /final /semi /quartas /oitavas');
    if (camp.status === 'inscricoes') return say(camp.novo ? this.textoCamp(camp) : this.textoInscricoes(camp), camp.novo ? [camp.organizador] : []);
    const icone = { aguardando_cria: '⏳', aguardando_sala: '🔧', jogando: '🎮', aguardando_confirmacao: '📝', finalizada: '✅' };
    const linhas = this.partidasDaRodada(camp).map((p) => {
      let extra = '';
      if (p.estado === 'aguardando_sala') extra = ` — ${p.criador} cria a sala`;
      if (p.estado === 'jogando') extra = ` — sala: ${p.codigo}`;
      if (p.estado === 'aguardando_confirmacao') extra = ` — ${this.textoPlacar(p)}`;
      if (p.estado === 'finalizada') extra = ` — ${this.textoPlacar(p)}`;
      return `${icone[p.estado]} *${p.num})* ${p.timeA.clube} x ${p.timeB.clube}${extra}`;
    });
    let txt = `📋 *${camp.nomeRodada}*\n\n${linhas.join('\n')}`;
    if (camp.passaram.length) txt += `\n\nJá classificados nesta fase: ${camp.passaram.join(', ')}`;
    say(txt);
  }
}

module.exports = { Bot, AJUDA };
