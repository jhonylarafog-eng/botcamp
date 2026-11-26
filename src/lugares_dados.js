// Lugares do jogo "Adivinha o Lugar". EDITE À VONTADE.
// Formato: 'Nome do lugar | outras formas que valem como acerto, separadas por vírgula'
// Acentos, maiúsculas e pequenos erros de digitação não importam.

const LINHAS = `
Praia | beira mar, litoral
Hospital | pronto socorro, upa
Escola | colegio
Aeroporto | aeroporto internacional
Cinema | sala de cinema
Estádio de futebol | estadio, maracana, arena
Igreja | templo, culto, missa
Supermercado | mercado, hipermercado
Zoológico | zoologico, zoo
Circo | picadeiro
Shopping | shopping center
Delegacia | delegacia de policia
Cemitério | cemiterio
Padaria | padoca
Academia | academia de ginastica
Barbearia | barbeiro
Rodoviária | rodoviaria, terminal de onibus
Boate | balada, danceteria
Biblioteca | livraria
Parque de diversões | parque de diversoes, parque de diversao, montanha russa
Banco | agencia bancaria
Posto de gasolina | posto, posto de combustivel
Prisão | prisao, cadeia, presidio
Fazenda | sitio, roca
Quartel | exercito
Navio | cruzeiro, transatlantico
Avião | aviao
Hotel | pousada
Restaurante | churrascaria
Pizzaria | pizza
Açougue | acougue
Farmácia | farmacia, drogaria
Dentista | consultorio dentario
Salão de beleza | salao, cabeleireiro
Oficina mecânica | oficina, mecanico
Cachoeira | queda dagua
Montanha | serra
Floresta | mata, selva
Deserto | saara
Piscina | clube de piscina
Universidade | faculdade
Tribunal | forum, fórum
Fábrica | fabrica
Metrô | metro
Ônibus | onibus, busao
Feira | feira livre
Cassino | casino
Lanchonete | hamburgueria
Sorveteria | sorveteria
Clube | clube social
Casa de show | show, festival
Quadra | quadra de esportes, ginasio
Lava-jato | lava jato
Velório | velorio
Parque | praca
Museu | galeria de arte
Teatro | teatro
Motel | hotel de beira de estrada
Rodeio | rodeio, peao
Pesqueiro | pescaria, pesque e pague
Igreja evangélica | culto evangelico
Padaria de esquina | botequim, boteco
`;

const LUGARES = LINHAS.trim().split('\n').map((l) => {
  const [nome, resto = ''] = l.split('|').map((s) => s.trim());
  return { nome, aliases: [nome, ...resto.split(',').map((s) => s.trim()).filter(Boolean)] };
});

module.exports = { LUGARES };
