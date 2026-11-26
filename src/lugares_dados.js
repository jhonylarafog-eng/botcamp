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

// Lugares "extras": marcas famosas do Brasil e cômodos da casa. Caem com chance MENOR (PESO_RARO),
// mas caem. Aumente o peso pra eles aparecerem mais, diminua pra aparecerem menos.
const PESO_RARO = 0.3;
const LINHAS_RARAS = `
McDonald's | mcdonalds, mc donalds, mcdonald, mc, macdonalds, mac donalds, mequi
Burger King | bk, burguer king, burger
Subway | subway sanduiche
Bob's | bobs
Habib's | habibs, habibs esfiha
Outback | outback steakhouse
Giraffas | girafas
Madero | restaurante madero
Spoleto | spoleto massas
KFC | kentucky, kentucky fried chicken
Pizza Hut | pizzahut
Domino's | dominos
Starbucks | starbuck
Cacau Show | cacauchow, loja de chocolate
Casas Bahia | casas bahia loja
Magazine Luiza | magalu, magazine
Americanas | lojas americanas
Carrefour | carrefur
Atacadão | atacadao
Assaí | assai, assai atacadista
Renner | lojas renner
Riachuelo | lojas riachuelo
Droga Raia | raia, drogasil
Correios | agencia dos correios, agencia do correio
Lotérica | loterica, casa lotérica, casa loterica
Beto Carrero World | beto carrero
Hopi Hari | hopihari
Cristo Redentor | cristo
Copacabana | calcadao de copacabana
Avenida Paulista | paulista
Parque Ibirapuera | ibirapuera
Cataratas do Iguaçu | cataratas, foz do iguacu
Fernando de Noronha | noronha
Cozinha | cozinha de casa
Sala de estar | sala, sala de tv, sala de casa
Banheiro | wc, toalete, lavabo
Privada | vaso, vaso sanitario, latrina, sanitario
Quarto | quarto de dormir, dormitorio
Garagem | garagem de casa
Quintal | quintal de casa
Lavanderia | area de servico, tanque
Varanda | sacada
Laje | laje da casa, terraco
Elevador | elevador do predio
Escada rolante | escada rolante do shopping
`;

const ler = (linhas, peso) => linhas.trim().split('\n').map((l) => {
  const [nome, resto = ''] = l.split('|').map((s) => s.trim());
  return { nome, peso, aliases: [nome, ...resto.split(',').map((x) => x.trim()).filter(Boolean)] };
});

// índices estáveis: os comuns primeiro, depois os extras (um jogo em andamento não se perde ao editar a lista)
const LUGARES = [...ler(LINHAS, 1), ...ler(LINHAS_RARAS, PESO_RARO)];

module.exports = { LUGARES, PESO_RARO };
