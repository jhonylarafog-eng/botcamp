// Boas-vindas a quem entra no grupo. Rode com: npm test
const assert = require('assert');
const { criarBoasVindas } = require('../src/boasvindas');

const CHAT = 'grupo@g.us';
const NOVO = '5511900000042@s.whatsapp.net';

function falso({ foto = true, fotoErro = false } = {}) {
  const enviados = [];
  const sock = {
    user: { id: '5511900000000:7@s.whatsapp.net' },
    profilePictureUrl: async () => { if (fotoErro) throw new Error('not-authorized'); return foto ? 'https://pps.whatsapp.net/x.jpg' : null; },
    sendMessage: async (chat, msg) => { enviados.push({ chat, msg }); return { key: { id: 'm' + enviados.length } }; },
  };
  const buscar = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  return { sock, enviados, buscar };
}

(async () => {
  // 1) com foto: manda imagem com legenda e marcação
  {
    const f = falso();
    const lembrados = [];
    const bv = criarBoasVindas({ buscar: f.buscar, esperar: async () => {}, lembrarEnviado: (r) => lembrados.push(r), sorteio: () => 0 });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [NOVO] });
    assert.strictEqual(f.enviados.length, 1);
    const m = f.enviados[0].msg;
    assert.ok(Buffer.isBuffer(m.image));
    assert.match(m.caption, /Bem-vindo\(a\) ao grupo, @5511900000042/);
    assert.deepStrictEqual(m.mentions, [NOVO]);
    assert.strictEqual(lembrados.length, 1);
  }
  // 2) sem foto / foto privada: manda só o texto
  for (const opc of [{ foto: false }, { fotoErro: true }]) {
    const f = falso(opc);
    const bv = criarBoasVindas({ buscar: f.buscar, esperar: async () => {}, sorteio: () => 0.5 });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [NOVO] });
    assert.strictEqual(f.enviados.length, 1);
    assert.match(f.enviados[0].msg.text, /@5511900000042/);
    assert.ok(!f.enviados[0].msg.image);
  }
  // 3) formato novo (participantes como objeto) e vários de uma vez
  {
    const f = falso();
    const bv = criarBoasVindas({ buscar: f.buscar, esperar: async () => {} });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [{ id: NOVO }, { id: '5511900000043@s.whatsapp.net' }] });
    assert.strictEqual(f.enviados.length, 2);
  }
  // 4) não cumprimenta o próprio bot, nem remoção/promoção, nem repetido, nem chat privado, nem desligado
  {
    const f = falso();
    let ligado = true;
    const bv = criarBoasVindas({ buscar: f.buscar, esperar: async () => {}, ligado: () => ligado });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: ['5511900000000@s.whatsapp.net'] });
    await bv.receber(f.sock, { id: CHAT, action: 'remove', participants: [NOVO] });
    await bv.receber(f.sock, { id: CHAT, action: 'promote', participants: [NOVO] });
    await bv.receber(f.sock, { id: '5511@s.whatsapp.net', action: 'add', participants: [NOVO] });
    assert.strictEqual(f.enviados.length, 0);
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [NOVO] });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [NOVO] }); // duplicado em seguida
    assert.strictEqual(f.enviados.length, 1);
    ligado = false;
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: ['5511900000099@s.whatsapp.net'] });
    assert.strictEqual(f.enviados.length, 1);
  }
  // 5) erro ao enviar não derruba
  {
    const f = falso();
    f.sock.sendMessage = async () => { throw new Error('boom'); };
    const bv = criarBoasVindas({ buscar: f.buscar, esperar: async () => {} });
    await bv.receber(f.sock, { id: CHAT, action: 'add', participants: [NOVO] });
  }
  console.log('✅ boas-vindas: todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
