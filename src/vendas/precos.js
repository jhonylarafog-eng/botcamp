// Tabela de preços de VÍDEO do Estúdio Digital (uso interno: o cliente só vê o preço final).
//
// Os valores abaixo são as faixas que o dono definiu; entre elas o preço sobe aos poucos
// (interpolação), pra um pedido de 17s não pular de R$30 direto pra R$45.
// Pra mudar um preço, edite só os PONTOS.

// [duração em segundos, preço em R$]: o preço vale pra essa duração; entre dois pontos, interpola.
const PONTOS = [
  [15, 30],   // até 15s            R$30
  [30, 38],   // 16–30s             R$38
  [45, 45],   // 31–45s             R$45
  [90, 60],   // 46s–1min30         R$60
  [120, 80],  // 1min30–2min        R$80
  [180, 100], // 2–3min             R$100
  [240, 150], // 3–4min (rampa)     até R$150
];
const TETO = 150;          // acima do último ponto: preço fixo
const EXTRA_DIALOGO = 15;  // "muito diálogo" (personagens conversando a maior parte do vídeo)

function precoVideo(segundos, muitoDialogo = false) {
  const s = Math.max(1, Math.ceil(Number(segundos) || 0));
  let base;
  if (s <= PONTOS[0][0]) base = PONTOS[0][1];
  else if (s >= PONTOS[PONTOS.length - 1][0]) base = TETO;
  else {
    for (let i = 1; i < PONTOS.length; i++) {
      const [s1, p1] = PONTOS[i];
      const [s0, p0] = PONTOS[i - 1];
      if (s <= s1) {
        base = Math.round(p0 + ((s - s0) / (s1 - s0)) * (p1 - p0));
        break;
      }
    }
  }
  return base + (muitoDialogo ? EXTRA_DIALOGO : 0);
}

const rotulo = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? String(s % 60).padStart(2, '0') + 's' : ''}`);

// Texto da tabela pro prompt: de 5 em 5 segundos até 1min, depois de 15 em 15 até 4min.
function tabelaTexto() {
  const duracoes = [];
  for (let s = 5; s <= 60; s += 5) duracoes.push(s);
  for (let s = 75; s <= 240; s += 15) duracoes.push(s);
  return duracoes.map((s) => `${rotulo(s)} = R$${precoVideo(s)}`).join(' | ');
}

module.exports = { PONTOS, TETO, EXTRA_DIALOGO, precoVideo, tabelaTexto };
