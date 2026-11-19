// Bola de Ouro: votação aberta, top 3 com pontos (5-3-1), só vota/é votado quem tem partida registrada.
//
//  /bolaouro [nome]        (admin) abre a votação
//  /votar @1º @2º @3º      vota (ou pelos nomes: /votar ana, bia, caio). Pode mudar o voto votando de novo.
//  /votos                  quem já votou, quem falta e a parcial
//  /encerrar               (admin) fecha e anuncia o campeão
//  /cancelarvotacao        (admin) descarta a votação
//  /hall                   campeões de votações anteriores

const { norm, levenshtein } = require('./text');

const PONTOS = [5, 3, 1];
const MEDALHA = ['🥇', '🥈', '🥉'];
const tag = (id) => `@${id.split('@')[0]}`;
const usuario = (id) => id.split('@')[0].split(':')[0];

class Votacao {
  constructor(store, contagem) {
    this.store = store;
    this.contagem = contagem;
    store.data.votacoes ||= {};
  }

  get todas() { return this.store.data.votacoes; }

  nome(id) {
    const j = this.store.data.jogadores[id];
    return j ? j.nome : usuario(id);
  }

  aberta(chatId) {
    return Object.values(this.todas).find((v) => v.chatId === chatId && v.status === 'aberta');
  }

  exigeAdmin(ctx) {
    if (ctx.msg.isAdmin) return true;
    ctx.say('Só admin pode fazer isso.');
    return false;
  }

  // ---------- abrir ----------
  abrir(ctx, args) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const atual = this.aberta(msg.chatId);
    if (atual) return say(`Já tem uma votação aberta: *${atual.nome}*. Use /votos pra ver, ou /encerrar.`);

    const totais = [...this.contagem.totais(msg.chatId).values()].sort(
      (a, b) => b.gols - a.gols || b.assist - a.assist || b.jogos - a.jogos
    );
    if (totais.length < 3) {
      return say('Precisa de pelo menos 3 jogadores com partidas registradas pra abrir a votação (veja /artilheiros).');
    }
    const id = this.store.novoId('votacao');
    const qtd = Math.min(3, totais.length - 1);
    const v = {
      id, chatId: msg.chatId, nome: args.trim() || `Temporada ${id}`, status: 'aberta',
      candidatos: totais.map((t) => t.id), qtd, votos: {}, abertaPor: msg.senderId, abertaEm: Date.now(),
    };
    this.todas[id] = v;

    const exemplo = Array.from({ length: qtd }, (_, i) => `@${['1º', '2º', '3º'][i]}`).join(' ');
    const pts = PONTOS.slice(0, qtd).join(', ').replace(/, (\d+)$/, ' e $1');
    say(
      `🏅 *BOLA DE OURO — ${v.nome}*\nVotação aberta!\n\n` +
      `Escolha seus *${qtd} melhores* jogadores (não vale votar em você), em ordem:\n` +
      `*/votar ${exemplo}*  (${pts} pontos)\n\n` +
      `*Candidatos:*\n` +
      totais.map((t) => `• ${this.nome(t.id)} — ${t.jogos} ${t.jogos === 1 ? 'jogo' : 'jogos'} · ⚽ ${t.gols} · 🎯 ${t.assist}`).join('\n') +
      `\n\nO voto é aberto: todo mundo vê. Só vota quem tem partida registrada. ` +
      `Pode mudar o voto mandando /votar de novo. O admin encerra com /encerrar.`
    );
  }

  // ---------- votar ----------
  // Lê os escolhidos: primeiro pelas menções (na ordem em que aparecem), senão pelos nomes.
  lerEscolhas(msg, args, v) {
    const ordem = [...String(args).matchAll(/@(\d{5,})/g)].map((m) => m[1]);
    const mentions = msg.mentions || [];
    if (ordem.length || mentions.length) {
      const porNumero = new Map(mentions.map((j) => [usuario(j), j]));
      let ids = ordem.map((d) => porNumero.get(d)).filter(Boolean);
      if (!ids.length || ids.length !== ordem.length) ids = [...mentions];
      return { ids };
    }
    let partes = String(args).split(/[,;\n]|\s+e\s+|\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
    if (partes.length === 1) partes = partes[0].split(/\s+/).filter(Boolean);
    const ids = [];
    for (const p of partes) {
      const r = this.acharCandidato(p, v);
      if (r.erro) return r;
      ids.push(r.id);
    }
    return { ids };
  }

  acharCandidato(texto, v) {
    const t = norm(texto);
    if (!t) return { erro: 'Não entendi um dos nomes.' };
    const cands = v.candidatos.map((id) => ({ id, nome: norm(this.nome(id)) }));
    let achados = cands.filter((c) => c.nome === t);
    if (!achados.length && t.length >= 2) {
      achados = cands.filter((c) => c.nome.startsWith(t) || c.nome.split(' ').some((w) => w === t));
    }
    if (!achados.length && t.length >= 4) {
      achados = cands.filter((c) => c.nome.split(' ').some((w) => levenshtein(w, t) <= 1));
    }
    if (achados.length === 1) return { id: achados[0].id };
    if (achados.length > 1) {
      return { erro: `"${texto}" pode ser ${achados.map((c) => this.nome(c.id)).join(' ou ')}. Marque com @ pra ser exato.` };
    }
    return { erro: `Não achei "${texto}" entre os candidatos.` };
  }

  votar(ctx, args) {
    const { msg, say } = ctx;
    const v = this.aberta(msg.chatId);
    if (!v) return say('Não tem votação aberta agora.');
    if (!v.candidatos.includes(msg.senderId)) {
      return say('Só vota quem já tem partida registrada (veja /artilheiros).');
    }
    const r = this.lerEscolhas(msg, args, v);
    if (r.erro) return say(`⚠️ ${r.erro}`);
    const ids = r.ids;
    const exemplo = Array.from({ length: v.qtd }, (_, i) => `@${['1º', '2º', '3º'][i]}`).join(' ');
    if (ids.length !== v.qtd) {
      return say(`Escolha exatamente *${v.qtd}* jogadores, em ordem: /votar ${exemplo}`);
    }
    if (new Set(ids).size !== ids.length) return say('⚠️ Não repita o mesmo jogador.');
    if (ids.includes(msg.senderId)) return say('⚠️ Não vale votar em você mesmo.');
    const fora = ids.filter((id) => !v.candidatos.includes(id));
    if (fora.length) return say(`⚠️ ${fora.map((id) => this.nome(id)).join(', ')} não está na lista de candidatos (precisa ter partida registrada).`);

    const mudou = !!v.votos[msg.senderId];
    v.votos[msg.senderId] = ids;
    const votaram = Object.keys(v.votos).length;
    say(
      `🗳️ *${this.nome(msg.senderId)}* ${mudou ? 'mudou o voto' : 'votou'}:\n` +
      ids.map((id, i) => `${MEDALHA[i]} ${this.nome(id)}`).join('\n') +
      `\n\n(${votaram}/${v.candidatos.length} já votaram)`
    );
  }

  // ---------- apuração ----------
  apurar(v) {
    const mapa = new Map(v.candidatos.map((id) => [id, { id, pts: 0, pos: [0, 0, 0] }]));
    for (const ids of Object.values(v.votos)) {
      ids.forEach((id, i) => {
        const t = mapa.get(id);
        if (!t) return;
        t.pts += PONTOS[i];
        t.pos[i]++;
      });
    }
    return [...mapa.values()]
      .filter((t) => t.pts > 0)
      .sort((a, b) => b.pts - a.pts || b.pos[0] - a.pos[0] || b.pos[1] - a.pos[1] || this.nome(a.id).localeCompare(this.nome(b.id)));
  }

  votos(ctx) {
    const { msg, say } = ctx;
    const v = this.aberta(msg.chatId);
    if (!v) return say('Não tem votação aberta agora.');
    const votaram = Object.keys(v.votos);
    const faltam = v.candidatos.filter((id) => !votaram.includes(id));
    let txt = `🏅 *${v.nome}* — ${votaram.length}/${v.candidatos.length} votaram\n\n`;
    if (votaram.length) {
      txt += votaram.map((id) => `• ${this.nome(id)}: ${v.votos[id].map((x, i) => `${MEDALHA[i]} ${this.nome(x)}`).join(' · ')}`).join('\n');
      const parcial = this.apurar(v).slice(0, 3);
      txt += `\n\n*Parcial:* ` + parcial.map((t, i) => `${MEDALHA[i]} ${this.nome(t.id)} (${t.pts})`).join(' · ');
    } else {
      txt += 'Ninguém votou ainda.';
    }
    if (faltam.length) txt += `\n\n⏳ Faltam votar: ${faltam.map((id) => this.nome(id)).join(', ')}`;
    say(txt);
  }

  encerrar(ctx) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const v = this.aberta(msg.chatId);
    if (!v) return say('Não tem votação aberta agora.');
    const rank = this.apurar(v);
    if (!rank.length) return say('Ninguém votou ainda. Use /cancelarvotacao se quiser descartar.');
    v.status = 'encerrada';
    v.encerradaEm = Date.now();
    v.resultado = rank.slice(0, 10).map((t) => ({ id: t.id, pts: t.pts, pos: t.pos }));

    const [a, b] = rank;
    const empate = b && a.pts === b.pts && a.pos[0] === b.pos[0] && a.pos[1] === b.pos[1];
    const linhas = rank.slice(0, 10).map((t, i) => {
      const m = MEDALHA[i] || `${i + 1}.`;
      return `${m} ${this.nome(t.id)} — ${t.pts} pts (${t.pos[0]}× 1º)`;
    });
    say(
      `🏆🏆🏆 *BOLA DE OURO — ${v.nome}* 🏆🏆🏆\n\n` +
      `O melhor jogador foi ${tag(a.id)}!\n\n` +
      linhas.join('\n') +
      `\n\n${Object.keys(v.votos).length}/${v.candidatos.length} votaram.` +
      (empate ? `\n⚠️ Empate técnico entre ${this.nome(a.id)} e ${this.nome(b.id)}: admin decide.` : ''),
      [a.id]
    );
  }

  cancelar(ctx) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const v = this.aberta(msg.chatId);
    if (!v) return say('Não tem votação aberta agora.');
    v.status = 'cancelada';
    say(`🛑 Votação *${v.nome}* cancelada.`);
  }

  hall(ctx) {
    const lista = Object.values(this.todas)
      .filter((v) => v.chatId === ctx.msg.chatId && v.status === 'encerrada')
      .sort((x, y) => x.id - y.id);
    if (!lista.length) return ctx.say('Ainda não teve nenhuma Bola de Ouro encerrada.');
    ctx.say(
      `🏆 *Hall da Fama — Bola de Ouro*\n\n` +
      lista.map((v) => {
        const r = v.resultado;
        return `*${v.nome}*\n` + r.slice(0, 3).map((t, i) => `${MEDALHA[i]} ${this.nome(t.id)} (${t.pts} pts)`).join(' · ');
      }).join('\n\n')
    );
  }
}

module.exports = { Votacao };
