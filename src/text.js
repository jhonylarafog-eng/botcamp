// Utilidades de texto: normalização e comparação tolerante a erros.

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function tolerancia(len) {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

// Procura em `clubes` (da lista do campeonato) o que melhor combina com `texto`.
// Retorna o clube ou null. Só aceita mensagens curtas, para não pegar conversa solta.
function acharClube(texto, clubes) {
  const t = norm(texto);
  if (!t || t.length > 32 || t.split(' ').length > 4) return null;

  // 1) igualdade exata com nome ou apelido
  for (const cl of clubes) {
    const nomes = [cl.nome, ...cl.apelidos].map(norm);
    if (nomes.includes(t)) return cl;
  }
  // 2) erro de digitação pequeno
  let melhor = null;
  let melhorDist = Infinity;
  for (const cl of clubes) {
    for (const n of [cl.nome, ...cl.apelidos].map(norm)) {
      const d = levenshtein(t, n);
      if (d <= tolerancia(Math.max(n.length, t.length)) && d < melhorDist) {
        melhor = cl;
        melhorDist = d;
      }
    }
  }
  return melhor;
}

module.exports = { norm, levenshtein, acharClube };
