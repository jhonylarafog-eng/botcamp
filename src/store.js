// Armazenamento simples em arquivo JSON (suficiente para um grupo de amigos).
// Gravação atômica: escreve num arquivo temporário e renomeia.

const fs = require('fs');
const path = require('path');

const VAZIO = () => ({
  jogadores: {},      // id -> { id, nome }
  partidas: {},       // id -> partida (ver game.js)
  campeonatos: {},    // id -> campeonato
  ativos: {},         // chatId -> id do campeonato em andamento
  registros: {},      // id -> contagem de gols/assistências confirmada por admin (contagem.js)
  pendentes: {},      // printId -> pedido de jogador aguardando confirmação
  contadores: { partida: 0, campeonato: 0, registro: 0 },
});

class Store {
  constructor(arquivo) {
    this.arquivo = arquivo; // null = só memória (testes)
    this.data = VAZIO();
    if (arquivo && fs.existsSync(arquivo)) {
      try {
        this.data = { ...VAZIO(), ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) };
      } catch (e) {
        const backup = arquivo + '.corrompido-' + Date.now();
        fs.copyFileSync(arquivo, backup);
        console.error('Arquivo de dados corrompido; backup em', backup);
      }
    }
  }

  // Agenda a gravação (no máx. 1 por segundo, pra não regravar o arquivo a cada mensagem do grupo)
  salvar() {
    if (!this.arquivo) return;
    this.sujo = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.salvarAgora();
    }, 1000);
    if (this.timer.unref) this.timer.unref();
  }

  salvarAgora() {
    if (!this.arquivo || !this.sujo) return;
    this.sujo = false;
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.arquivo);
  }

  novoId(tipo) {
    this.data.contadores[tipo] = (this.data.contadores[tipo] || 0) + 1;
    return this.data.contadores[tipo];
  }

  jogador(id, nome) {
    let j = this.data.jogadores[id];
    if (!j) {
      j = this.data.jogadores[id] = { id, nome: nome || id.split('@')[0] };
    } else if (nome && nome !== j.nome) {
      j.nome = nome;
    }
    return j;
  }
}

module.exports = { Store };
