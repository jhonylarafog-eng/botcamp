// Preços das FOTOS DE ESTÚDIO do Estúdio Digital (o cliente sabe esses valores: estão no anúncio).
//
// Pra mudar um preço, edite só as constantes abaixo.

const PRECO_FOTO = 7.99;     // uma foto
const FOTOS_ALBUM = 5;       // quantas fotos tem o álbum
const PRECO_ALBUM = 25;      // álbum completo

// Valor em reais no jeito brasileiro (R$7,99 / R$25).
const reais = (v) => 'R$' + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));

// Preço de N fotos. 5 = álbum. Quantidade fora de 1 a 5 não tem preço automático (retorna null).
function precoFotos(qtd) {
  const n = Math.floor(Number(qtd) || 0);
  if (n === FOTOS_ALBUM) return PRECO_ALBUM;
  if (n >= 1 && n < FOTOS_ALBUM) return Math.round(n * PRECO_FOTO * 100) / 100;
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
  return linhas.join(' | ');
}

module.exports = { PRECO_FOTO, FOTOS_ALBUM, PRECO_ALBUM, reais, precoFotos, tabelaTexto };
