// Lista de competições e clubes. EDITE À VONTADE.
// Cada clube: nome (como aparece no grupo) + apelidos (o que as pessoas podem digitar).
// Acentos e maiúsculas não importam. Erros pequenos de digitação são tolerados.

const c = (nome, ...apelidos) => ({ nome, apelidos });

const COMPETICOES = {
  champions: {
    nome: 'Champions League',
    emoji: '🏆',
    clubes: [
      c('Real Madrid', 'real', 'madrid', 'real madri'),
      c('Barcelona', 'barca', 'barça', 'barcelona fc'),
      c('Bayern', 'bayern munique', 'bayern de munique', 'bayern munich', 'bayer'),
      c('Manchester City', 'city', 'man city', 'manchester', 'cidade'),
      c('Liverpool', 'liverpul'),
      c('Arsenal'),
      c('PSG', 'paris', 'paris saint germain', 'paris sg'),
      c('Inter de Milão', 'inter', 'inter milao', 'internazionale'),
      c('Milan', 'ac milan', 'milao'),
      c('Juventus', 'juve'),
      c('Atlético de Madrid', 'atletico', 'atletico madrid', 'atleti', 'atletico de madri'),
      c('Borussia Dortmund', 'dortmund', 'borussia', 'bvb'),
      c('Chelsea'),
      c('Benfica'),
      c('Porto', 'fc porto'),
      c('Napoli', 'napoles', 'nápoles'),
    ],
  },
  libertadores: {
    nome: 'Libertadores',
    emoji: '🌎',
    clubes: [
      c('Flamengo', 'fla', 'mengao', 'mengão'),
      c('Palmeiras', 'palmeira', 'verdao', 'verdão'),
      c('Corinthians', 'timao', 'timão', 'corinthias'),
      c('São Paulo', 'sao paulo', 'spfc', 'tricolor paulista'),
      c('Fluminense', 'flu', 'fluminenze'),
      c('Botafogo', 'fogao', 'fogão', 'bota'),
      c('Atlético Mineiro', 'atletico mineiro', 'galo', 'atletico mg', 'atletico-mg'),
      c('Cruzeiro', 'raposa'),
      c('Grêmio', 'gremio', 'imortal'),
      c('Internacional', 'inter rs', 'colorado', 'inter de porto alegre'),
      c('River Plate', 'river'),
      c('Boca Juniors', 'boca'),
      c('Peñarol', 'penarol'),
      c('Nacional', 'nacional uruguai'),
      c('Estudiantes', 'estudiantes la plata'),
      c('Racing', 'racing club'),
    ],
  },
  brasileirao: {
    nome: 'Brasileirão',
    emoji: '🇧🇷',
    clubes: [
      c('Flamengo', 'fla', 'mengao', 'mengão'),
      c('Palmeiras', 'palmeira', 'verdao', 'verdão'),
      c('Corinthians', 'timao', 'timão'),
      c('São Paulo', 'sao paulo', 'spfc'),
      c('Fluminense', 'flu'),
      c('Botafogo', 'fogao', 'fogão', 'bota'),
      c('Vasco', 'vasco da gama', 'gigante da colina'),
      c('Santos', 'peixe'),
      c('Atlético Mineiro', 'atletico mineiro', 'galo', 'atletico mg'),
      c('Cruzeiro', 'raposa'),
      c('Grêmio', 'gremio'),
      c('Internacional', 'inter', 'colorado'),
      c('Bahia', 'esquadrao', 'esquadrão'),
      c('Fortaleza', 'leao do pici', 'leão do pici'),
      c('Athletico Paranaense', 'athletico', 'athletico pr', 'furacao', 'furacão', 'cap'),
      c('Bragantino', 'red bull bragantino', 'braga'),
      c('Vitória', 'vitoria', 'leao da barra', 'leão da barra'),
      c('Ceará', 'ceara', 'vozao', 'vozão'),
      c('Sport', 'sport recife', 'leao da ilha', 'leão da ilha'),
      c('Juventude', 'ju'),
    ],
  },
};

const MODOS = { x1: 1, x2: 2, x3: 3 };

module.exports = { COMPETICOES, MODOS };
