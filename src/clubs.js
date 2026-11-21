// Competições e clubes. As ligas ficam em ligas.js (EDITE LÁ). Aqui só montamos o que o bot usa.
// Cada clube: nome (como aparece no grupo) + apelidos (o que as pessoas podem digitar) + cores (bolinhas).
// Acentos e maiúsculas não importam. Erros pequenos de digitação são tolerados.

const { LIGAS } = require('./ligas');
const { norm } = require('./text');

const COMPETICOES = {};
for (const l of LIGAS) COMPETICOES[l.chave] = { nome: l.nome, emoji: l.emoji, selecoes: !!l.selecoes, zoeira: !!l.zoeira, clubes: l.clubes };

// menu "ESCOLHA A LIGA": o número é a posição (1 a 20)
const MENU_LIGAS = LIGAS.map((l) => l.chave);

// menu "QUANTOS CLUBES ENTRAM?"
const TAMANHOS = [
  { n: 64, nome: 'MEGA TORNEIO', emoji: '🌍' },
  { n: 32, nome: 'TORNEIO COMPLETO', emoji: '🎯' },
  { n: 16, nome: 'OITAVAS', emoji: '🌟' },
  { n: 8, nome: 'QUARTAS', emoji: '💫' },
  { n: 4, nome: 'SEMIFINAL', emoji: '🎖️' },
  { n: 2, nome: 'FINAL', emoji: '🏵️' },
];

// Mega torneio: clubes misturados de várias ligas (sem seleções, sem a Liga Zoeira).
// Se a liga escolhida for a Copa do Mundo, o pool é só de seleções.
function poolMega(chaveLiga) {
  if (COMPETICOES[chaveLiga] && COMPETICOES[chaveLiga].selecoes) {
    return COMPETICOES.copadomundo.clubes;
  }
  const vistos = new Set();
  const pool = [];
  for (const l of LIGAS) {
    if (l.selecoes || l.zoeira) continue;
    for (const c of l.clubes) {
      const k = norm(c.nome);
      if (vistos.has(k)) continue;
      vistos.add(k);
      pool.push(c);
    }
  }
  return pool;
}

const MODOS = { x1: 1, x2: 2, x3: 3 };
const NOME_MODO = { x1: 'SOLO', x2: 'DUPLA', x3: 'TRIO' };

module.exports = { COMPETICOES, MENU_LIGAS, TAMANHOS, MODOS, NOME_MODO, poolMega };
