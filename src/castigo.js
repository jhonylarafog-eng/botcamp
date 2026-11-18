// Castigo: um admin manda /castigo @fulano e o bot tira o admin dele por 24 horas.
// Durante o castigo ninguém consegue promover a pessoa de novo (nem manualmente, nem por outro bot):
// toda vez que ela vira admin, o conector percebe e tira de novo.
//
// O castigo dura exatamente 24h: não dá pra perdoar nem renovar.
// O núcleo só guarda os castigos e monta as mensagens. Quem fala com o WhatsApp (tirar o admin,
// vigiar promoções) é o conector (whatsapp.js), que usa as funções públicas daqui.

const HORAS_PADRAO = 24;
const FUSO = 'America/Sao_Paulo';

const tag = (id) => `@${id.split('@')[0].split(':')[0]}`;
const usuario = (id) => String(id || '').split('@')[0].split(':')[0];

class Castigo {
  constructor(store, { agora = () => Date.now(), protegidos = [] } = {}) {
    this.store = store;
    this.agora = agora;
    // números blindados (só dígitos, com DDI): ninguém consegue castigar essas pessoas
    this.protegidos = new Set((protegidos || []).map((n) => String(n).replace(/\D/g, '')).filter(Boolean));
    store.data.castigos ||= {};
  }

  get castigos() { return this.store.data.castigos; }

  // ---------- consultas (usadas também pelo conector) ----------
  // castigos ainda valendo num grupo; apaga os vencidos
  ativosDoChat(chatId) {
    const t = this.agora();
    for (const c of Object.values(this.castigos)) if (c.ate <= t) delete this.castigos[c.id];
    return Object.values(this.castigos).filter((c) => c.chatId === chatId);
  }

  chatsComCastigo() {
    this.ativosDoChat('');
    return [...new Set(Object.values(this.castigos).map((c) => c.chatId))];
  }

  // a pessoa (qualquer um dos ids dela) está de castigo neste grupo?
  daPessoa(chatId, ids) {
    const alvo = new Set((ids || []).map(usuario));
    return this.ativosDoChat(chatId).find((c) => [c.alvo, ...(c.aliases || [])].some((x) => alvo.has(usuario(x)))) || null;
  }

  // algum dos ids (número, LID...) é de uma pessoa blindada?
  ehProtegido(ids) {
    return (ids || []).some((i) => this.protegidos.has(usuario(i)));
  }

  guardarAliases(id, aliases) {
    const c = this.castigos[id];
    if (c) c.aliases = [...new Set((aliases || []).filter(Boolean))];
  }

  remover(id) { delete this.castigos[id]; }

  quando(ts) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      .format(new Date(ts)).replace(',', ' às');
  }

  restante(ate) {
    const min = Math.max(1, Math.round((ate - this.agora()) / 60_000));
    const h = Math.floor(min / 60);
    return h ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
  }

  // ---------- comandos ----------
  exigeAdmin(ctx) {
    if (ctx.msg.isAdmin) return true;
    ctx.say('Só admin pode fazer isso.');
    return false;
  }

  alvoDe(ctx, args) {
    const mentions = ctx.msg.mentions || [];
    if (mentions.length === 1) return mentions[0];
    const m = String(args || '').match(/@(\d{5,})/);
    return m ? `${m[1]}@s.whatsapp.net` : null;
  }

  // /castigo @fulano — tira o admin por 24h e bloqueia promoção
  aplicar(ctx, args) {
    const { msg, say } = ctx;
    if (!this.exigeAdmin(ctx)) return;
    const alvo = this.alvoDe(ctx, args);
    if (!alvo) return say('Marque a pessoa: /castigo @fulano\n(tira o admin dela por 24h e ninguém consegue promover de novo nesse tempo)');
    if (ctx.msg.mentions && ctx.msg.mentions.length > 1) return say('Marque uma pessoa por vez: /castigo @fulano');

    if (this.ehProtegido([alvo])) return say(`🛡️ ${tag(alvo)} é protegido e não pode ser castigado.`, [alvo]);
    const existente = this.daPessoa(msg.chatId, [alvo]);
    if (existente) {
      return say(`${tag(alvo)} já está de castigo: faltam ${this.restante(existente.ate)} (até ${this.quando(existente.ate)}).`, [alvo]);
    }
    const ate = this.agora() + HORAS_PADRAO * 3_600_000;
    const id = this.store.novoId('castigo');
    const c = this.castigos[id] = { id, chatId: msg.chatId, alvo, aliases: [], ate, por: msg.senderId, em: this.agora() };
    // o conector tira o admin, guarda os outros ids da pessoa e só então manda `texto`
    ctx.castigo({
      castigoId: c.id, alvo,
      texto:
        `⛔ *CASTIGO!* ${tag(alvo)} perdeu o admin por ${HORAS_PADRAO}h.\n\n` +
        `Até *${this.quando(ate)}* ninguém consegue promover de novo — nem manualmente, nem por outro bot. ` +
        `Se alguém tentar, eu tiro na hora.`,
      mentions: [alvo],
    });
  }

  lista(ctx) {
    const { msg, say } = ctx;
    const cs = this.ativosDoChat(msg.chatId).sort((a, b) => a.ate - b.ate);
    if (!cs.length) return say('Ninguém está de castigo agora. 😇');
    say(
      `⛔ *De castigo (sem admin)*\n\n` +
      cs.map((c) => `• ${tag(c.alvo)} — faltam ${this.restante(c.ate)} (até ${this.quando(c.ate)})`).join('\n'),
      cs.map((c) => c.alvo)
    );
  }
}

module.exports = { Castigo, HORAS_PADRAO };
