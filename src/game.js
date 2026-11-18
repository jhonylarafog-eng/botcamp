// Lógica do bot de campeonato. Não depende do WhatsApp: recebe mensagens e devolve respostas.
//
// handle({ chatId, senderId, senderName, text, isAdmin }) -> [{ chatId, text, mentions }]

const { COMPETICOES, MODOS } = require('./clubs');
const { norm, acharClube } = require('./text');
const rank = require('./rankings');
const { Contagem } = require('./contagem');
const { Votacao } = require('./votacao');

const AJUDA = `⚽ *Bot de Campeonato*

*Montar campeonato*
/iniciar — começa um campeonato
/champions /libertadores /brasileirao — escolhe a competição
/x1 /x2 /x3 — escolhe o modo
/times 4 — muda a quantidade de clubes
Depois é só *digitar o nome do clube* pra entrar nele
/lista — times completos e times com vaga (durante as inscrições)
/sair — sai do clube
/comecar — (admin) começa só com os clubes completos
/cancelar — (admin) cancela o campeonato

*Modo aleatório*
(admin) /x3aleatorio — abre o sorteio (também /x1aleatorio /x2aleatorio)
Escolha a fase: /final /semi /quartas /oitavas
Todo mundo escolhe um clube; quando enche, o bot embaralha os jogadores entre os times e sorteia os confrontos
(admin) /comecar — sorteia agora com quem já entrou

*Durante os jogos*
*cria* — o time ADVERSÁRIO vai criar a sala
/sala CÓDIGO — manda o código da sala
/placar 3x1 — informa o placar (seu time primeiro)
/placar 2x2 pen 4x3 — com pênaltis
/confirmar — o adversário confirma o placar
/gols 2 e /assist 1 — suas stats na última partida
/status — situação do campeonato

*Rankings*
/ranking /trofeus /artilharia /assistencias
/derrotas /duplas /trios /perfil

*Contagem de gols e assistências*
Mande o *print* do fim da partida e escreva: _fiz 2 gols, dei 1 assistência_
(admin) responda ao print com /ok pra confirmar
(admin) ou corrija: /reg @fulano 2 gols 1 assistência
(admin) /add @fulano 3 gols 2 assistências — soma direto, sem print (opcional: 4 jogos)
(admin) /desfazer N — cancela um registro
/lista — jogos, gols e assistências de todos (durante as inscrições use /lista geral)
/artilheiros /assistentes /pendentes

*Bola de Ouro (votação)*
(admin) /bolaouro Temporada 1 — abre a votação
/votar @1º @2º @3º — vota nos 3 melhores (5, 3 e 1 pontos)
/votos — quem votou, quem falta e a parcial
(admin) /encerrar — apura e anuncia o campeão
(admin) /cancelarvotacao — descarta
/hall — campeões anteriores`;

const ETAPAS = { final: 2, semi: 4, quartas: 8, oitavas: 16 };
const norma = (s) => norm(s).replace(/ /g, '');
const tag = (id) => `@${id.split('@')[0]}`;

class Bot {
  constructor(store, { prefix = '/', rng = Math.random } = {}) {
    this.store = store;
    this.prefix = prefix;
    this.rng = rng;
    this.contagem = new Contagem(store, { prefix });
    this.votacao = new Votacao(store, this.contagem);
  }

  // ---------- entrada ----------
  handle(msg) {
    const out = [];
    const say = (text, mentions = []) => out.push({ chatId: msg.chatId, text, mentions });
    const ctx = { msg, say };
    try {
      this._handle(ctx);
    } catch (e) {
      console.error('Erro ao tratar mensagem:', e);
      say('⚠️ Deu um erro aqui. Tenta de novo.');
    }
    this.store.salvar();
    return out;
  }

  _handle(ctx) {
    const { msg } = ctx;
    if (msg.senderName) this.store.jogador(msg.senderId, msg.senderName); // guarda o nome de quem fala
    if (this.contagem.antes(ctx)) return; // pedido de gols/assistências com print
    const text = String(msg.text || '').trim();
    if (!text) return;
    const camp = this.campAtivo(msg.chatId);

    if (text.startsWith(this.prefix) && text.length > 1) {
      // separa o comando dos argumentos preservando as quebras de linha dos argumentos
      const m = text.slice(this.prefix.length).trim().match(/^(\S+)\s*([\s\S]*)$/);
      if (!m) return;
      return this.comando(ctx, norma(m[1]), m[2].trim(), camp);
    }
    if (!camp) return;
    if (camp.status === 'inscricoes') return this.entrar(ctx, camp, text, false);
    if (camp.status === 'andamento' && norm(text) === 'cria') return this.cria(ctx, camp);
  }

  comando(ctx, cmd, args, camp) {
    const { say, msg } = ctx;
    switch (cmd) {
      case 'ajuda': case 'comandos': case 'help': case 'menu':
        return say(AJUDA);
      case 'iniciar': return this.iniciar(ctx, camp, args);
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
      case 'assistencias': return say(rank.assistencias(this.store, msg.chatId));
      case 'derrotas': return say(rank.derrotas(this.store, msg.chatId));
      case 'duplas': return say(rank.combos(this.store, msg.chatId, 2));
      case 'trios': return say(rank.combos(this.store, msg.chatId, 3));
      case 'perfil': return say(rank.perfil(this.store, msg.chatId, msg.senderId));
      // contagem de gols e assistências (com print)
      case 'reg': case 'registrar': return this.contagem.reg(ctx, args);
      case 'ok': return this.contagem.ok(ctx);
      case 'add': case 'adicionar': return this.contagem.adicionar(ctx, args);
      case 'desfazer': return this.contagem.desfazer(ctx, args);
      case 'lista':
        // durante as inscrições mostra os times; "/lista geral" sempre mostra jogos/gols/assistências
        if (camp && camp.status === 'inscricoes' && norma(args) !== 'geral') return this.listaTimes(ctx, camp);
        return this.contagem.lista(ctx);
      case 'artilheiros': return this.contagem.top(ctx, 'gols');
      case 'assistentes': return this.contagem.top(ctx, 'assist');
      case 'pendentes': return this.contagem.pendentes(ctx);
      // Bola de Ouro (votação)
      case 'bolaouro': case 'bolaodeouro': case 'votacao': return this.votacao.abrir(ctx, args);
      case 'votar': case 'voto': return this.votacao.votar(ctx, args);
      case 'votos': return this.votacao.votos(ctx);
      case 'encerrar': return this.votacao.encerrar(ctx);
      case 'cancelarvotacao': return this.votacao.cancelar(ctx);
      case 'hall': return this.votacao.hall(ctx);
      default: return; // comando desconhecido: ignora (pode ser de outro bot)
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
    const cheio = c.jogadores.length >= camp.tamanho;
    const linhas = c.jogadores.map((id) => `   👤 ${marcar ? tag(id) : this.nome(id)}`);
    for (let i = c.jogadores.length; i < camp.tamanho; i++) linhas.push('   ▫️ _vaga livre_');
    return `${cheio ? '✅' : '⚪'} *${c.nome}* (${c.jogadores.length}/${camp.tamanho})\n${linhas.join('\n')}`;
  }

  // /lista durante as inscrições: times completos e times com vagas
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
      Object.entries(COMPETICOES).map(([k, v]) => `${v.emoji} /${k}`).join('\n')
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

  sortearClubes(camp, quantidade) {
    const pool = COMPETICOES[camp.competicao].clubes;
    camp.clubes = this.embaralhar(pool)
      .slice(0, quantidade)
      .map((c) => ({ nome: c.nome, apelidos: c.apelidos, jogadores: [] }));
    camp.numClubes = camp.clubes.length;
  }

  escolherModo(ctx, camp, modo) {
    const { say } = ctx;
    if (!camp || camp.status !== 'modo') return;
    if (!this.ehOrg(ctx, camp)) return say('Só quem iniciou o campeonato (ou um admin) escolhe o modo.');
    camp.modo = modo;
    camp.tamanho = MODOS[modo];
    const pool = COMPETICOES[camp.competicao].clubes.length;
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
    const pool = COMPETICOES[camp.competicao].clubes.length;
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
    const embaralhados = this.embaralhar(jogadores);
    const clubes = this.embaralhar(camp.clubes).slice(0, k).map((c, i) => ({
      nome: c.nome, apelidos: c.apelidos,
      jogadores: embaralhados.slice(i * camp.tamanho, (i + 1) * camp.tamanho),
    }));
    const reservas = embaralhados.slice(k * camp.tamanho);
    camp.clubes = clubes;
    camp.numClubes = k;
    camp.status = 'andamento';

    let txt = `🎲 *Sorteio feito!* Jogadores embaralhados entre os times:\n\n` +
      clubes.map((c) => `⚽ *${c.nome}* — ${c.jogadores.map(tag).join(' ')}`).join('\n');
    if (reservas.length) txt += `\n\n🪑 Ficaram de fora (faltou gente pra completar): ${reservas.map(tag).join(' ')}`;
    say(txt, [...clubes.flatMap((c) => c.jogadores), ...reservas]);
    this.proximaRodada(ctx, camp, clubes.map((c) => c.nome));
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
    const n = parseInt(args, 10);
    const pool = COMPETICOES[camp.competicao].clubes.length;
    if (!Number.isInteger(n) || n < 2 || n > pool) return say(`Use /times com um número de 2 a ${pool}.`);
    this.sortearClubes(camp, n);
    say('🔄 Clubes sorteados de novo, inscrições reiniciadas!\n\n' + this.textoInscricoes(camp));
  }

  // ---------- inscrições ----------
  entrar(ctx, camp, texto, explicito) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
    const clube = acharClube(texto, camp.clubes);
    if (!clube) {
      if (explicito) say('Não achei esse clube. Clubes disponíveis:\n\n' + this.formatClubes(camp));
      return;
    }
    const id = ctx.msg.senderId;
    this.registrar(ctx);
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
    let txt = `✅ ${this.nome(id)} ${antigo ? `saiu do ${antigo.nome} e ` : ''}entrou no time!\n\n${this.blocoTime(camp, clube)}`;
    if (antigo) txt += `\n\n_Como ficou o ${antigo.nome}:_\n${this.blocoTime(camp, antigo, false)}`;
    say(txt, [...clube.jogadores]);
    if (camp.clubes.every((c) => c.jogadores.length >= camp.tamanho)) {
      return camp.aleatorio ? this.comecarAleatorio(ctx, camp) : this.comecarMataMata(ctx, camp);
    }
  }

  sair(ctx, camp) {
    const { say } = ctx;
    if (!camp || camp.status !== 'inscricoes') return;
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
    return 'Fase de 32';
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
      `Quando acabar: /placar 3x1 (seu time primeiro)`,
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
    let t = `${p.timeA.clube} ${p.placar.a} x ${p.placar.b} ${p.timeB.clube}`;
    if (p.penaltis) t += ` (pên. ${p.penaltis.a} x ${p.penaltis.b})`;
    return t;
  }

  confirmar(ctx, camp) {
    const { say, msg } = ctx;
    if (!camp || camp.status !== 'andamento') return;
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

  finalizar(ctx, camp, p) {
    const aGanhou = p.penaltis
      ? p.penaltis.a > p.penaltis.b
      : p.placar.a > p.placar.b;
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
    if (camp.status === 'competicao') return say('Escolha a competição: ' + Object.keys(COMPETICOES).map((k) => '/' + k).join(' '));
    if (camp.status === 'modo') return say('Escolha o modo: /x1 /x2 /x3');
    if (camp.status === 'etapa') return say('Admin, escolha a fase: /final /semi /quartas /oitavas');
    if (camp.status === 'inscricoes') return say(this.textoInscricoes(camp));
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
