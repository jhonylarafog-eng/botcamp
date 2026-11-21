// As 20 ligas do menu "ESCOLHA A LIGA". EDITE À VONTADE.
// Cada linha de clube:  Nome | apelidos separados por vírgula | cores
// Cores (até 2 letras): b=🔵 p=⚫ v=🔴 w=⚪ g=🟢 y=🟡 o=🟠 r=🟣 m=🟤
// Acentos e maiúsculas não importam na hora de digitar o nome do time.

const BOLINHAS = { b: '🔵', p: '⚫', v: '🔴', w: '⚪', g: '🟢', y: '🟡', o: '🟠', r: '🟣', m: '🟤' };

function clube(linha) {
  const [nome, apel = '', cor = ''] = linha.split('|').map((s) => s.trim());
  return {
    nome,
    apelidos: apel ? apel.split(',').map((s) => s.trim()).filter(Boolean) : [],
    cores: [...cor].map((l) => BOLINHAS[l] || '').join('') || '⚪',
  };
}
const lista = (texto) => texto.trim().split('\n').map((l) => l.trim()).filter(Boolean).map(clube);

// o número é a posição no menu
const LIGAS = [
  {
    chave: 'brasileirao', nome: 'Brasileirão A', emoji: '🇧🇷',
    clubes: lista(`
      Flamengo | fla, mengao | vp
      Palmeiras | palmeira, verdao | gw
      Corinthians | timao, corinthias | pw
      São Paulo | sao paulo, spfc, tricolor paulista | vw
      Fluminense | flu | gm
      Botafogo | fogao, bota | pw
      Vasco | vasco da gama, gigante da colina | pw
      Santos | peixe | wp
      Atlético Mineiro | atletico mineiro, galo, atletico mg | pw
      Cruzeiro | raposa | bw
      Grêmio | gremio, imortal | bp
      Internacional | colorado | vw
      Bahia | esquadrao | bv
      Fortaleza | leao do pici | bv
      Athletico Paranaense | athletico, athletico pr, furacao, cap | vp
      Bragantino | red bull bragantino, braga | wv
      Vitória | vitoria, leao da barra | vp
      Ceará | ceara, vozao | pw
      Sport | sport recife, leao da ilha | vp
      Juventude | ju | gw
    `),
  },
  {
    chave: 'champions', nome: 'Champions', emoji: '⭐',
    clubes: lista(`
      Real Madrid | real, madrid, real madri | w
      Barcelona | barca, barça | bv
      Bayern | bayern munique, bayern de munique, bayern munich, bayer | v
      Manchester City | city, man city, manchester, cidade | b
      Liverpool | liverpul | v
      Arsenal | gunners | vw
      PSG | paris, paris saint germain, paris sg | bv
      Inter de Milão | inter, inter milao, internazionale | bp
      Milan | ac milan, milao | vp
      Juventus | juve | pw
      Atlético de Madrid | atletico, atletico madrid, atleti, atletico de madri | vw
      Borussia Dortmund | dortmund, borussia, bvb | yp
      Chelsea | | b
      Benfica | | vw
      Porto | fc porto | bw
      Napoli | napoles | b
      Tottenham | spurs | wb
      Newcastle | | pw
      Atalanta | | bp
      Bayer Leverkusen | leverkusen | vp
      Sporting | sporting cp, sporting lisboa | gw
      Ajax | | vw
      PSV | psv eindhoven | vw
      Galatasaray | gala | vy
      Olympique de Marselha | marseille, marselha, om | bw
      Villarreal | submarino amarelo | y
      Club Brugge | brugge | bp
      Athletic Bilbao | athletic club, bilbao | vw
      Eintracht Frankfurt | frankfurt | pv
      Olympiacos | | vw
      Slavia Praga | slavia | vw
      Monaco | monaco fc | vw
    `),
  },
  {
    chave: 'premier', nome: 'Premier', emoji: '👑',
    clubes: lista(`
      Arsenal | gunners | vw
      Aston Villa | villa | mb
      Bournemouth | cherries | vp
      Brentford | bees | vw
      Brighton | seagulls | bw
      Chelsea | | b
      Crystal Palace | palace | bv
      Everton | | b
      Fulham | | wp
      Leeds United | leeds | wy
      Liverpool | liverpul | v
      Manchester City | city, man city, manchester, cidade | b
      Manchester United | united, man utd, man united, manchester united | v
      Newcastle | | pw
      Nottingham Forest | forest | v
      Sunderland | black cats | vw
      Tottenham | spurs | wb
      West Ham | hammers | mb
      Wolverhampton | wolves | yo
      Burnley | | mb
    `),
  },
  {
    chave: 'laliga', nome: 'La Liga', emoji: '🇪🇸',
    clubes: lista(`
      Real Madrid | real, madrid, real madri | w
      Barcelona | barca, barça | bv
      Atlético de Madrid | atletico, atletico madrid, atleti, atletico de madri | vw
      Athletic Bilbao | athletic club, bilbao | vw
      Real Sociedad | sociedad | bw
      Villarreal | submarino amarelo | y
      Real Betis | betis | gw
      Sevilla | | wv
      Valencia | | wp
      Celta de Vigo | celta | bw
      Osasuna | | vb
      Getafe | | b
      Rayo Vallecano | rayo | wv
      Mallorca | | vp
      Girona | | vw
      Espanyol | | bw
      Alavés | alaves | bw
      Elche | | gw
      Levante | | bv
      Real Oviedo | oviedo | b
    `),
  },
  {
    chave: 'copadomundo', nome: 'Copa do Mundo', emoji: '🌍', selecoes: true,
    clubes: lista(`
      Brasil | selecao brasileira, bra | gy
      Argentina | arg | bw
      França | franca | bv
      Inglaterra | england | w
      Espanha | spain | v
      Portugal | | vg
      Alemanha | germany | wp
      Holanda | paises baixos | o
      Itália | italia | b
      Bélgica | belgica | v
      Croácia | croacia | vw
      Uruguai | | b
      Colômbia | colombia | y
      México | mexico | g
      Estados Unidos | eua, usa | bw
      Canadá | canada | v
      Japão | japao | b
      Coreia do Sul | coreia | vw
      Austrália | australia | yg
      Irã | ira | wg
      Arábia Saudita | arabia | g
      Catar | qatar | m
      Marrocos | | v
      Senegal | | g
      Nigéria | nigeria | g
      Camarões | camaroes | g
      Gana | | vy
      Egito | | v
      Argélia | argelia | gw
      Tunísia | tunisia | vw
      Costa do Marfim | | o
      África do Sul | africa do sul | yg
      Equador | | y
      Chile | | v
      Paraguai | | vw
      Peru | | wv
      Venezuela | | m
      Bolívia | bolivia | g
      Costa Rica | | v
      Panamá | panama | v
      Jamaica | | yg
      Honduras | | b
      Dinamarca | | v
      Suécia | suecia | yb
      Noruega | | v
      Suíça | suica | v
      Áustria | austria | v
      Polônia | polonia | vw
      Sérvia | servia | v
      Ucrânia | ucrania | yb
      Turquia | | v
      Grécia | grecia | b
      Escócia | escocia | b
      País de Gales | gales | v
      Irlanda | | g
      República Tcheca | tchequia, republica tcheca | v
      Hungria | | v
      Romênia | romenia | y
      Eslováquia | eslovaquia | b
      Eslovênia | eslovenia | w
      Islândia | islandia | b
      Finlândia | finlandia | w
      Bósnia | bosnia | b
      Albânia | albania | v
      Uzbequistão | uzbequistao | b
      Jordânia | jordania | v
      Iraque | | w
      Nova Zelândia | nova zelandia | w
      Cabo Verde | | b
      RD Congo | | b
      Mali | | g
    `),
  },
  {
    chave: 'libertadores', nome: 'Libertadores', emoji: '🔱',
    clubes: lista(`
      Flamengo | fla, mengao | vp
      Palmeiras | palmeira, verdao | gw
      Botafogo | fogao, bota | pw
      Fluminense | flu | gm
      Cruzeiro | raposa | bw
      Corinthians | timao, corinthias | pw
      Grêmio | gremio, imortal | bp
      Atlético Mineiro | atletico mineiro, galo, atletico mg | pw
      River Plate | river | wv
      Boca Juniors | boca | by
      Racing | racing club | bw
      Estudiantes | estudiantes la plata | vw
      Vélez Sarsfield | velez | bw
      Peñarol | penarol | yp
      Nacional | nacional uruguai | bw
      Colo-Colo | colo colo | w
      Universidad de Chile | u de chile | b
      Universidad Católica | catolica | bw
      Atlético Nacional | nacional medellin | gw
      Millonarios | | b
      Junior | junior barranquilla | vw
      LDU Quito | ldu | w
      Independiente del Valle | del valle | bp
      Barcelona SC | barcelona de guayaquil | y
      Olimpia | | wp
      Cerro Porteño | cerro porteno, cerro | bv
      Libertad | | wp
      Universitario | | m
      Alianza Lima | alianza | bw
      Sporting Cristal | cristal | b
      Bolívar | bolivar | b
      The Strongest | strongest | yp
    `),
  },
  {
    chave: 'seriea', nome: 'Serie A', emoji: '🇮🇹',
    clubes: lista(`
      Napoli | napoles | b
      Inter de Milão | inter, inter milao, internazionale | bp
      Juventus | juve | pw
      Milan | ac milan, milao | vp
      Atalanta | | bp
      Roma | as roma | yv
      Lazio | | bw
      Fiorentina | viola | r
      Bologna | | vb
      Torino | toro | m
      Udinese | | wp
      Genoa | | vb
      Cagliari | | vb
      Parma | | yb
      Como | | bw
      Lecce | | yv
      Sassuolo | | gp
      Cremonese | | vw
      Pisa | | bp
      Hellas Verona | verona | yb
    `),
  },
  {
    chave: 'bundesliga', nome: 'Bundesliga', emoji: '🇩🇪',
    clubes: lista(`
      Bayern | bayern munique, bayern de munique, bayern munich, bayer | v
      Borussia Dortmund | dortmund, borussia, bvb | yp
      Bayer Leverkusen | leverkusen | vp
      RB Leipzig | leipzig | vw
      Eintracht Frankfurt | frankfurt | pv
      Stuttgart | | wv
      Borussia Mönchengladbach | gladbach, monchengladbach | gw
      Wolfsburg | | g
      Werder Bremen | bremen | g
      Freiburg | | vp
      Union Berlin | union | v
      Mainz | | vw
      Augsburg | | vg
      Hoffenheim | | b
      Heidenheim | | vb
      St. Pauli | st pauli | m
      Hamburgo | hamburger sv, hsv | b
      Colônia | colonia, koln | vw
    `),
  },
  {
    chave: 'ligue1', nome: 'Ligue 1', emoji: '🇫🇷',
    clubes: lista(`
      PSG | paris, paris saint germain, paris sg | bv
      Olympique de Marselha | marseille, marselha, om | bw
      Lyon | olympique lyonnais | bv
      Monaco | monaco fc | vw
      Lille | | v
      Nice | | vp
      Rennes | | vp
      Lens | | yv
      Strasbourg | | b
      Nantes | | yg
      Toulouse | | r
      Brest | | v
      Auxerre | | bw
      Angers | | pw
      Le Havre | | b
      Lorient | | o
      Metz | | m
      Paris FC | | b
    `),
  },
  {
    chave: 'argentina', nome: 'Argentina', emoji: '🇦🇷',
    clubes: lista(`
      River Plate | river | wv
      Boca Juniors | boca | by
      Racing | racing club | bw
      Independiente | | v
      San Lorenzo | | bv
      Estudiantes | estudiantes la plata | vw
      Vélez Sarsfield | velez | bw
      Rosario Central | central | by
      Newell's Old Boys | newells | vp
      Lanús | lanus | m
      Talleres | | bw
      Argentinos Juniors | argentinos | v
      Huracán | huracan | wv
      Defensa y Justicia | defensa | gy
      Belgrano | | b
      Banfield | | gw
      Godoy Cruz | | b
      Gimnasia La Plata | gimnasia | bw
      Tigre | | bv
      Platense | | m
      Barracas Central | barracas | vw
      Instituto | | vw
      Sarmiento | | g
      Central Córdoba | central cordoba | bw
      Unión de Santa Fe | union de santa fe | vw
      Atlético Tucumán | atletico tucuman | bw
      Independiente Rivadavia | rivadavia | b
      Deportivo Riestra | riestra | pw
      San Martín de San Juan | san martin | vp
      Aldosivi | | yg
    `),
  },
  {
    chave: 'saudita', nome: 'Saudita', emoji: '🇸🇦',
    clubes: lista(`
      Al-Hilal | hilal | b
      Al-Nassr | nassr | y
      Al-Ittihad | ittihad | yp
      Al-Ahli | ahli | g
      Al-Shabab | shabab | w
      Al-Taawoun | taawoun | o
      Al-Fateh | fateh | g
      Al-Ettifaq | ettifaq | g
      Al-Fayha | fayha | y
      Al-Khaleej | khaleej | y
      Al-Raed | raed | o
      Damac | | r
      Al-Okhdood | okhdood | w
      Al-Riyadh | riyadh | b
      Al-Qadsiah | qadsiah | y
      Al-Kholood | kholood | g
      Al-Orobah | orobah | g
      NEOM SC | neom | b
    `),
  },
  {
    chave: 'copaafrica', nome: 'Copa África', emoji: '🌴', selecoes: true,
    clubes: lista(`
      Egito | | v
      Marrocos | | v
      Senegal | | g
      Nigéria | nigeria | g
      Camarões | camaroes | g
      Argélia | argelia | gw
      Costa do Marfim | | o
      Gana | | vy
      Mali | | g
      Tunísia | tunisia | vw
      África do Sul | africa do sul | yg
      RD Congo | | b
      Burkina Faso | | v
      Cabo Verde | | b
      Guiné | guine | v
      Zâmbia | zambia | g
      Angola | | v
      Gabão | gabao | g
      Moçambique | mocambique | g
      Benin | | g
      Uganda | | y
      Tanzânia | tanzania | g
      Sudão | sudao | v
      Zimbábue | zimbabue | g
    `),
  },
  {
    chave: 'eredivisie', nome: 'Eredivisie', emoji: '🇳🇱',
    clubes: lista(`
      Ajax | | vw
      PSV | psv eindhoven | vw
      Feyenoord | | vw
      AZ Alkmaar | az | v
      FC Twente | twente | v
      FC Utrecht | utrecht | v
      Sparta Rotterdam | sparta | vw
      Go Ahead Eagles | go ahead | yv
      NEC Nijmegen | nec | vg
      Heerenveen | | bw
      Fortuna Sittard | fortuna | yg
      Groningen | | g
      Heracles | | w
      PEC Zwolle | zwolle | b
      Excelsior | | vp
      NAC Breda | nac | y
      Willem II | | vw
      Telstar | | w
    `),
  },
  {
    chave: 'superlig', nome: 'Super Lig', emoji: '🇹🇷',
    clubes: lista(`
      Galatasaray | gala | vy
      Fenerbahçe | fenerbahce, fener | yb
      Beşiktaş | besiktas | pw
      Trabzonspor | trabzon | mb
      Başakşehir | basaksehir | o
      Samsunspor | samsun | vw
      Konyaspor | konya | g
      Antalyaspor | antalya | v
      Alanyaspor | alanya | og
      Kasımpaşa | kasimpasa | bw
      Rizespor | rize | gb
      Gaziantep | | vp
      Göztepe | goztepe | yv
      Eyüpspor | eyupspor | r
      Kocaelispor | kocaeli | g
      Gençlerbirliği | genclerbirligi | vp
      Kayserispor | kayseri | yv
      Fatih Karagümrük | karagumruk | vp
    `),
  },
  {
    chave: 'brasileiraob', nome: 'Brasileirão B', emoji: '🇧🇷',
    clubes: lista(`
      Coritiba | coxa | gw
      Goiás | goias | g
      América Mineiro | america mineiro, america mg | g
      Chapecoense | chape | g
      Novorizontino | | y
      Avaí | avai | b
      Criciúma | criciuma | yp
      Operário | operario pr, operario | pw
      Vila Nova | | vw
      CRB | | vw
      Remo | | bw
      Paysandu | | bw
      Ponte Preta | | pw
      Guarani | | g
      Botafogo-SP | botafogo sp | vw
      Ferroviária | ferroviaria | m
      Amazonas | | y
      Volta Redonda | | y
      Athletic Club | athletic mg | gw
      Cuiabá | cuiaba | y
    `),
  },
  {
    chave: 'portugal', nome: 'Liga Portugal', emoji: '🇵🇹',
    clubes: lista(`
      Benfica | | vw
      Porto | fc porto | bw
      Sporting | sporting cp, sporting lisboa | gw
      Braga | sc braga | v
      Vitória de Guimarães | vitoria de guimaraes, guimaraes | w
      Famalicão | famalicao | b
      Estoril | | yb
      Casa Pia | | y
      Moreirense | | g
      Rio Ave | | g
      Gil Vicente | | vb
      Santa Clara | | vw
      Arouca | | y
      Nacional da Madeira | nacional madeira | pw
      Estrela da Amadora | estrela | vg
      AVS | | v
      Alverca | | vw
      Tondela | | g
    `),
  },
  {
    chave: 'mls', nome: 'MLS', emoji: '🇺🇸',
    clubes: lista(`
      Inter Miami | miami | py
      LA Galaxy | galaxy | wb
      LAFC | los angeles fc | py
      Seattle Sounders | sounders | gb
      Atlanta United | atlanta | vp
      New York City FC | nycfc, new york city | b
      New York Red Bulls | red bulls | vw
      Portland Timbers | timbers | gy
      Columbus Crew | columbus, crew | y
      FC Cincinnati | cincinnati | ob
      Philadelphia Union | union | bw
      Orlando City | orlando | r
      Nashville SC | nashville | yb
      Austin FC | austin | gp
      Real Salt Lake | salt lake | vb
      Sporting Kansas City | kansas city | b
      Minnesota United | minnesota | pg
      Houston Dynamo | houston | o
      FC Dallas | dallas | vb
      Colorado Rapids | colorado | m
      Vancouver Whitecaps | vancouver | wb
      Toronto FC | toronto | v
      CF Montréal | montreal | bp
      DC United | dc | vp
      New England Revolution | new england | bv
      Charlotte FC | charlotte | b
      Chicago Fire | chicago | v
      St. Louis City | st louis | v
      San Jose Earthquakes | san jose | bp
      San Diego FC | san diego | b
    `),
  },
  {
    chave: 'escocesa', nome: 'Liga Escocesa', emoji: '🏴',
    clubes: lista(`
      Celtic | | gw
      Rangers | | b
      Hearts | | m
      Hibernian | hibs | gw
      Aberdeen | | v
      Dundee United | | o
      Motherwell | | yv
      Kilmarnock | killie | bw
      St Mirren | | pw
      Dundee | | b
      Falkirk | | b
      Livingston | | y
    `),
  },
  {
    chave: 'mundial', nome: 'Mundial de Clubes', emoji: '🏆',
    clubes: lista(`
      Real Madrid | real, madrid, real madri | w
      Manchester City | city, man city, manchester, cidade | b
      Bayern | bayern munique, bayern de munique, bayern munich, bayer | v
      PSG | paris, paris saint germain, paris sg | bv
      Chelsea | | b
      Inter de Milão | inter, inter milao, internazionale | bp
      Juventus | juve | pw
      Borussia Dortmund | dortmund, borussia, bvb | yp
      Atlético de Madrid | atletico, atletico madrid, atleti, atletico de madri | vw
      Benfica | | vw
      Porto | fc porto | bw
      Red Bull Salzburg | salzburg | vw
      Flamengo | fla, mengao | vp
      Palmeiras | palmeira, verdao | gw
      Fluminense | flu | gm
      Botafogo | fogao, bota | pw
      River Plate | river | wv
      Boca Juniors | boca | by
      Monterrey | | b
      Pachuca | | bw
      Seattle Sounders | sounders | gb
      Inter Miami | miami | py
      LAFC | los angeles fc | py
      Al-Hilal | hilal | b
      Al Ain | | r
      Al Ahly | ahly | v
      Wydad | wydad casablanca | v
      Espérance de Tunis | esperance | yv
      Mamelodi Sundowns | sundowns | y
      Urawa Reds | urawa | v
      Ulsan HD | ulsan | b
      Auckland City | auckland | b
    `),
  },
  {
    chave: 'zoeira', nome: 'Liga Zoeira', emoji: '🤡', zoeira: true,
    clubes: lista(`
      Pão de Queijo FC | pao de queijo | y
      Real Churrasco | churrasco | v
      Atlético Pastelaria | pastelaria | o
      Sport Clube Marmita | marmita | g
      Galáticos da Padaria | padaria | wy
      União da Pelada | pelada | gw
      Barcelona de Esquina | esquina | bv
      Cruzeiro do Fiado | fiado | bw
      Vasco da Gambiarra | gambiarra | pw
      Nacional da Laje | laje | m
      Botafogo do Bar | bar | pw
      Juventus da Vila | vila | pw
      Real Sociedade do Sofá | sofa | r
      Estrela do Rolê | role | yb
      Tigres do Baile | baile | op
      Flamengo de Várzea | varzea | vp
    `),
  },
];

module.exports = { LIGAS };
