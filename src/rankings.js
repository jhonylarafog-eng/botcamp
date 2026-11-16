// Cálculo dos rankings a partir das partidas finalizadas (tudo recalculado do histórico).

const K = 32;               // sensibilidade do ELO
const MIN_JOGOS_COMBO = 2;  // mínimo de jogos juntos pra entrar em melhor/pior dupla/trio

const medalha = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
const media = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function nomeDe(store, id) {
  const j = store.data.jogadores[id];
  return j ? j.nome : id.split('@')[0];
}

function calcular(store, chatId) {
  const jog = {};
  const combos = {};
  const get = (id) =>
    (jog[id] ||= { id, jogos: 0, v: 0, d: 0, gols: 0, assist: 0, elo: 1000, titulos: 0, vices: 0 });

  const partidas = Object.values(store.data.partidas)
    .filter((p) => p.chatId === chatId && p.estado === 'finalizada')
    .sort((a, b) => a.id - b.id);

  for (const p of partidas) {
    const A = p.timeA.jogadores;
    const B = p.timeB.jogadores;
    const aGanhou = p.vencedor === p.timeA.clube;
    const eloA = media(A.map((id) => get(id).elo));
    const eloB = media(B.map((id) => get(id).elo));
    const esperadoA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const delta = K * ((aGanhou ? 1 : 0) - esperadoA);

    for (const id of A) {
      const g = get(id);
      g.jogos++;
      aGanhou ? g.v++ : g.d++;
      g.elo += delta;
    }
    for (const id of B) {
      const g = get(id);
      g.jogos++;
      aGanhou ? g.d++ : g.v++;
      g.elo -= delta;
    }
    for (const [id, s] of Object.entries(p.stats || {})) {
      const g = get(id);
      g.gols += s.gols || 0;
      g.assist += s.assist || 0;
    }
    for (const [time, ganhou] of [[A, aGanhou], [B, !aGanhou]]) {
      if (time.length < 2) continue;
      const key = [...time].sort().join('|');
      const c = (combos[key] ||= { ids: [...time].sort(), jogos: 0, v: 0 });
      c.jogos++;
      if (ganhou) c.v++;
    }
  }

  for (const c of Object.values(store.data.campeonatos)) {
    if (c.chatId !== chatId || c.status !== 'fim') continue;
    for (const id of c.campeaoJogadores || []) get(id).titulos++;
    for (const id of c.viceJogadores || []) get(id).vices++;
  }
  return { jog, combos };
}

function lista(titulo, linhas, vazio) {
  if (!linhas.length) return `${titulo}\n\n${vazio}`;
  return `${titulo}\n\n${linhas.join('\n')}`;
}

function top(store, chatId, { titulo, valor, filtro, ordenar, vazio, limite = 10 }) {
  const { jog } = calcular(store, chatId);
  const itens = Object.values(jog).filter(filtro).sort(ordenar).slice(0, limite);
  const linhas = itens.map((g, i) => `${medalha(i)} ${nomeDe(store, g.id)} — ${valor(g)}`);
  return lista(titulo, linhas, vazio);
}

function rankingElo(store, chatId) {
  return top(store, chatId, {
    titulo: '📊 *Ranking geral (ELO)*',
    valor: (g) => `${Math.round(g.elo)} pts (${g.v}V ${g.d}D)`,
    filtro: (g) => g.jogos > 0,
    ordenar: (a, b) => b.elo - a.elo || b.jogos - a.jogos,
    vazio: 'Ainda não teve nenhuma partida finalizada.',
  });
}

function trofeus(store, chatId) {
  return top(store, chatId, {
    titulo: '🏆 *Troféus*',
    valor: (g) => `${g.titulos} 🏆${g.vices ? ` | ${g.vices} vice` : ''}`,
    filtro: (g) => g.titulos > 0 || g.vices > 0,
    ordenar: (a, b) => b.titulos - a.titulos || b.vices - a.vices,
    vazio: 'Nenhum campeonato terminou ainda.',
  });
}

function artilharia(store, chatId) {
  return top(store, chatId, {
    titulo: '⚽ *Artilharia*',
    valor: (g) => `${g.gols} gols em ${g.jogos} jogos`,
    filtro: (g) => g.gols > 0,
    ordenar: (a, b) => b.gols - a.gols || a.jogos - b.jogos,
    vazio: 'Ninguém registrou gols ainda. Use /gols N depois da partida.',
  });
}

function assistencias(store, chatId) {
  return top(store, chatId, {
    titulo: '🎯 *Assistências*',
    valor: (g) => `${g.assist} assist. em ${g.jogos} jogos`,
    filtro: (g) => g.assist > 0,
    ordenar: (a, b) => b.assist - a.assist || a.jogos - b.jogos,
    vazio: 'Ninguém registrou assistências ainda. Use /assist N depois da partida.',
  });
}

function derrotas(store, chatId) {
  return top(store, chatId, {
    titulo: '💔 *Mais derrotas (os "fregueses")*',
    valor: (g) => `${g.d} derrotas em ${g.jogos} jogos`,
    filtro: (g) => g.d > 0,
    ordenar: (a, b) => b.d - a.d || b.jogos - a.jogos,
    vazio: 'Ninguém perdeu ainda.',
  });
}

function combos(store, chatId, tamanho) {
  const nomeTipo = tamanho === 3 ? 'trio' : 'dupla';
  const { combos: cs } = calcular(store, chatId);
  const elegiveis = Object.values(cs)
    .filter((c) => c.ids.length === tamanho && c.jogos >= MIN_JOGOS_COMBO)
    .map((c) => ({ ...c, taxa: c.v / c.jogos }));

  if (!elegiveis.length) {
    return `🤝 *Melhor e pior ${nomeTipo}*\n\nAinda não tem ${nomeTipo} com ${MIN_JOGOS_COMBO}+ jogos juntos.`;
  }
  const fmt = (c) => {
    const nomes = c.ids.map((id) => nomeDe(store, id)).join(' + ');
    return `${nomes} — ${Math.round(c.taxa * 100)}% (${c.v}V ${c.jogos - c.v}D)`;
  };
  const melhores = [...elegiveis].sort((a, b) => b.taxa - a.taxa || b.jogos - a.jogos);
  const piores = [...elegiveis].sort((a, b) => a.taxa - b.taxa || b.jogos - a.jogos);

  let txt = `🤝 *Melhor e pior ${nomeTipo}* (mín. ${MIN_JOGOS_COMBO} jogos juntos)\n\n🔥 *Melhores*\n`;
  txt += melhores.slice(0, 3).map((c, i) => `${medalha(i)} ${fmt(c)}`).join('\n');
  if (elegiveis.length > 1) {
    txt += `\n\n🥶 *Pior ${nomeTipo}*\n${fmt(piores[0])}`;
  }
  return txt;
}

function perfil(store, chatId, id) {
  const { jog } = calcular(store, chatId);
  const g = jog[id];
  const nome = nomeDe(store, id);
  if (!g) return `📇 *${nome}*\n\nAinda sem partidas finalizadas.`;
  return (
    `📇 *${nome}*\n\n` +
    `📊 ELO: ${Math.round(g.elo)}\n` +
    `🎮 Jogos: ${g.jogos} (${g.v}V ${g.d}D)\n` +
    `🏆 Títulos: ${g.titulos} | 🥈 Vices: ${g.vices}\n` +
    `⚽ Gols: ${g.gols} | 🎯 Assistências: ${g.assist}`
  );
}

module.exports = {
  calcular, rankingElo, trofeus, artilharia, assistencias, derrotas, combos, perfil, nomeDe,
};
