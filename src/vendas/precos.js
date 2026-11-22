// Preços das FOTOS DE ESTÚDIO do Estúdio Digital (o cliente sabe esses valores: estão no anúncio).
//
// Pra mudar um preço, edite só as constantes abaixo.

const PRECO_FOTO = 7.99;     // uma foto
const FOTOS_ALBUM = 5;       // quantas fotos tem o álbum
const PRECO_ALBUM = 25;      // álbum completo
const PRECO_ACIMA = 5;       // preço de cada foto quando o cliente pede mais de FOTOS_ALBUM

// Valor em reais no jeito brasileiro (R$7,99 / R$25).
const reais = (v) => 'R$' + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));

// Preço de N fotos. 1 a 4 = R$7,99 cada; 5 = álbum (R$25); mais de 5 = R$5 cada. Zero ou inválido retorna null.
function precoFotos(qtd) {
  const n = Math.floor(Number(qtd) || 0);
  if (n === FOTOS_ALBUM) return PRECO_ALBUM;
  if (n >= 1 && n < FOTOS_ALBUM) return Math.round(n * PRECO_FOTO * 100) / 100;
  if (n > FOTOS_ALBUM) return n * PRECO_ACIMA;
  return null;
}

// Texto da tabela pro prompt.
function tabelaTexto() {
  const linhas = [];
  for (let n = 1; n < FOTOS_ALBUM; n++) {
    const p = precoFotos(n);
    linhas.push(`${n} ${n === 1 ? 'foto' : 'fotos'} = ${reais(p)}${p > PRECO_ALBUM ? ' (já passa do álbum: ofereça o álbum)' : ''}`);
  }
  linhas.push(`álbum com ${FOTOS_ALBUM} fotos = ${reais(PRECO_ALBUM)} (${reais(PRECO_ALBUM / FOTOS_ALBUM)} cada)`);
  linhas.push(`mais de ${FOTOS_ALBUM} fotos = ${reais(PRECO_ACIMA)} cada (8 fotos = ${reais(precoFotos(8))}, 10 fotos = ${reais(precoFotos(10))}, 15 fotos = ${reais(precoFotos(15))})`);
  return linhas.join(' | ');
}

module.exports = { PRECO_FOTO, FOTOS_ALBUM, PRECO_ALBUM, PRECO_ACIMA, reais, precoFotos, tabelaTexto };
