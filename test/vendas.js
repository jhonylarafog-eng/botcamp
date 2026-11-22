// Testes do atendente de vendas (sem internet: Claude, Groq e Telegram são simulados).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarVendas, classificar, tirarMarcacoes, dividir } = require('../src/vendas/vendas');
const { precoFotos, tabelaTexto } = require('../src/vendas/precos');
const { montarPrompt } = require('../src/vendas/prompt');

let ok = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log('  ✓', nome); } catch (e) { console.error('  ✗', nome, '\n', e); process.exitCode = 1; }
}
const esperar = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// ---------- ambiente simulado ----------
function montar({ respostas = [], env = {}, falhaClaude = false, inicio = null } = {}) {
  const relogio = { t: inicio ? new Date(inicio).getTime() : null };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendas-'));
  const chamadas = { claude: [], groq: [], gemini: [], telegram: [] };
  const fila = respostas.slice();
  const fetch = async (url, opts) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      const corpo = JSON.parse(opts.body);
      chamadas.gemini.push({ url, chave: opts.headers['x-goog-api-key'], corpo });
      const ehAudio = (corpo.contents?.[0]?.parts || []).some((p) => p.inlineData?.mimeType?.startsWith('audio/'));
      const texto = ehAudio ? 'quero um vídeo do meu filho brincando' : (fila.length ? fila.shift() : 'ok');
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
    }
    if (url.includes('anthropic.com')) {
      chamadas.claude.push(JSON.parse(opts.body));
      if (falhaClaude) return { ok: false, status: 529, text: async () => 'overloaded', json: async () => ({}) };
      const texto = fila.length ? fila.shift() : 'ok';
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: texto }] }) };
    }
    if (url.includes('groq.com')) {
      chamadas.groq.push(opts);
      return { ok: true, status: 200, json: async () => ({ text: 'quero um vídeo do meu filho brincando' }) };
    }
    if (url.includes('api.telegram.org')) {
      chamadas.telegram.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error('URL inesperada ' + url);
  };
  const enviadas = [];
  const sock = {
    sendMessage: async (jid, conteudo, op) => { enviadas.push({ jid, texto: conteudo.text, id: op?.messageId }); return { key: { id: op?.messageId } }; },
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
  };
  const silencio = { error() {}, log() {} };
  let n = 0;
  const v = criarVendas({
    dataDir: dir, fetch, dormir: async () => {}, log: silencio,
    agora: () => new Date(relogio.t !== null ? relogio.t : Date.now()),
    obterSock: () => sock,
    gerarId: () => 'ID' + (++n),
    baixar: async () => Buffer.from('arquivo-falso'),
    env: { VENDAS_ATIVO: 'sim', ANTHROPIC_API_KEY: 'k', GROQ_API_KEY: 'g', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', PIX_CHAVE: 'pix@exemplo.com', VENDAS_ESPERA_MS: '0', ...env },
  });
  const horas = (h) => { relogio.t += h * 3_600_000; };
  return { v, sock, chamadas, enviadas, dir, horas };
}
const JID = '5511999990000@s.whatsapp.net';
const msgTexto = (texto, extra = {}) => ({ key: { remoteJid: JID, id: 'M' + Math.random(), fromMe: false }, message: { conversation: texto }, pushName: 'Cliente', ...extra });
const msgAudio = () => ({ key: { remoteJid: JID, id: 'A' + Math.random(), fromMe: false }, message: { audioMessage: { seconds: 12 } }, pushName: 'Cliente' });
const msgImagem = () => ({ key: { remoteJid: JID, id: 'I' + Math.random(), fromMe: false }, message: { imageMessage: { mimetype: 'image/jpeg', caption: '' } }, pushName: 'Cliente' });
const msgDono = (texto) => ({ key: { remoteJid: JID, id: 'D' + Math.random(), fromMe: true }, message: { conversation: texto } });

(async () => {
  console.log('Preços');
  await teste('preço das fotos: 1 = 7,99, álbum de 5 = 25, fora disso sem preço automático', () => {
    assert.strictEqual(precoFotos(1), 7.99);
    assert.strictEqual(precoFotos(2), 15.98);
    assert.strictEqual(precoFotos(3), 23.97);
    assert.strictEqual(precoFotos(4), 31.96);
    assert.strictEqual(precoFotos(5), 25);
    assert.strictEqual(precoFotos(0), null);
  });
  await teste('mais de 5 fotos: R$5 cada foto', () => {
    assert.strictEqual(precoFotos(6), 30);
    assert.strictEqual(precoFotos(8), 40);
    assert.strictEqual(precoFotos(10), 50);
    assert.strictEqual(precoFotos(15), 75);
  });
  await teste('a partir de 4 fotos o álbum de 5 sai mais barato', () => {
    assert.ok(precoFotos(4) > precoFotos(5));
    assert.ok(precoFotos(3) < precoFotos(5));
  });
  await teste('prompt tem tabela, Pix e regra de nunca confirmar pagamento', () => {
    const p = montarPrompt({ pixChave: 'pix@exemplo.com', agora: 'hoje' });
    assert.ok(p.includes(tabelaTexto()));
    assert.ok(p.includes('pix@exemplo.com'));
    assert.ok(p.includes('NUNCA confirma que o pagamento caiu'));
    assert.ok(montarPrompt({ agora: 'x' }).includes('NÃO está configurada'));
  });

  console.log('Funções de apoio');
  await teste('classificar', () => {
    assert.deepStrictEqual(classificar({ conversation: 'oi' }), { tipo: 'texto', texto: 'oi' });
    assert.strictEqual(classificar({ audioMessage: { seconds: 5 } }).tipo, 'audio');
    assert.strictEqual(classificar({ imageMessage: { caption: 'x' } }).tipo, 'imagem');
    assert.strictEqual(classificar({ ephemeralMessage: { message: { conversation: 'oi' } } }).texto, 'oi');
    assert.strictEqual(classificar({ reactionMessage: {} }), null);
  });
  await teste('tirarMarcacoes', () => {
    const r = tirarMarcacoes('Recebi!\n[[PAGAMENTO|vídeo 17s R$31 pago tudo]]');
    assert.strictEqual(r.texto, 'Recebi!');
    assert.deepStrictEqual(r.acoes, [{ tipo: 'PAGAMENTO', motivo: 'vídeo 17s R$31 pago tudo' }]);
    assert.deepStrictEqual(tirarMarcacoes('Já te falo [[HUMANO]]').acoes, [{ tipo: 'HUMANO', motivo: '' }]);
  });
  await teste('Pix: a chave sempre sai sozinha numa mensagem, mesmo se vier junto com texto', () => {
    const K = '09623517920';
    assert.deepStrictEqual(dividir(`Fica R$7,99, pagamento por Pix.\n\n${K}\n\nMe manda o comprovante!`, K), ['Fica R$7,99, pagamento por Pix.', K, 'Me manda o comprovante!']);
    assert.deepStrictEqual(dividir(`Fica R$7,99. Chave Pix: ${K}\n\nMe manda o comprovante!`, K), ['Fica R$7,99. Chave Pix', K, 'Me manda o comprovante!']);
    assert.deepStrictEqual(dividir(`Pix: ${K} Depois me manda o comprovante.`, K), ['Pix', K, 'Depois me manda o comprovante.']);
    const longa = dividir(`Entendi!\n\nFica R$25.\n\n${K}\n\nManda o comprovante!`, K);
    assert.ok(longa.includes(K));
    assert.ok(longa.every((p) => p === K || !p.includes(K)));
    assert.deepStrictEqual(dividir('a\n\nb', K), ['a', 'b']);
  });
  await teste('dividir em no máximo 3 mensagens', () => {
    assert.deepStrictEqual(dividir('a\n\nb'), ['a', 'b']);
    assert.strictEqual(dividir('a\n\nb\n\nc\n\nd\n\ne').length, 3);
  });

  console.log('Atendimento');
  await teste('desligado: não faz nada', async () => {
    const { v, sock, chamadas, enviadas } = montar({ env: { VENDAS_ATIVO: 'nao' } });
    assert.strictEqual(v.ativo, false);
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 0);
    assert.strictEqual(enviadas.length, 0);
  });
  await teste('grupo não é privado', () => {
    const { v } = montar();
    assert.strictEqual(v.ehPrivado('1203630@g.us'), false);
    assert.strictEqual(v.ehPrivado('status@broadcast'), false);
    assert.strictEqual(v.ehPrivado('5511999990000@s.whatsapp.net'), true);
    assert.strictEqual(v.ehPrivado('123456@lid'), true);
  });
  await teste('texto: chama o Claude, responde em mensagens separadas e guarda histórico', async () => {
    const { v, sock, chamadas, enviadas } = montar({ respostas: ['Opa, tudo certo?\n\nAqui é do Estúdio Digital 🎬'] });
    await v.receber(sock, msgTexto('Opa, posso ter mais informações sobre isso?'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 1);
    assert.strictEqual(chamadas.claude[0].model, 'claude-haiku-5-5');
    assert.ok(chamadas.claude[0].system.includes('pix@exemplo.com'));
    assert.strictEqual(enviadas.length, 2);
    assert.strictEqual(enviadas[0].jid, JID);
    assert.strictEqual(chamadas.telegram.length, 0);
    assert.strictEqual(v._estado().chats[JID].historico.length, 2);
  });
  await teste('mensagens seguidas são juntadas numa resposta só', async () => {
    const { v, sock, chamadas } = montar({ env: { VENDAS_ESPERA_MS: '30' } });
    await v.receber(sock, msgTexto('oi'));
    await v.receber(sock, msgTexto('quero um vídeo'));
    await esperar(120);
    assert.strictEqual(chamadas.claude.length, 1);
    assert.strictEqual(chamadas.claude[0].messages[0].content, 'oi\nquero um vídeo');
  });
  await teste('áudio vira texto pelo Groq e vai pro Claude', async () => {
    const { v, sock, chamadas } = montar();
    await v.receber(sock, msgAudio());
    await esperar();
    assert.strictEqual(chamadas.groq.length, 1);
    assert.ok(chamadas.claude[0].messages[0].content.includes('[áudio do cliente] quero um vídeo do meu filho brincando'));
  });
  await teste('áudio sem chave do Groq: avisa o Claude que não foi possível ouvir', async () => {
    const { v, sock, chamadas } = montar({ env: { GROQ_API_KEY: '' } });
    await v.receber(sock, msgAudio());
    await esperar();
    assert.ok(chamadas.claude[0].messages[0].content.includes('não foi possível ouvir'));
  });
  await teste('comprovante em imagem vai como imagem pro Claude', async () => {
    const { v, sock, chamadas } = montar();
    await v.receber(sock, msgImagem());
    await esperar();
    const c = chamadas.claude[0].messages[0].content;
    assert.ok(Array.isArray(c));
    assert.strictEqual(c[0].type, 'image');
    assert.strictEqual(c[0].source.media_type, 'image/jpeg');
  });
  await teste('pagamento: avisa no Telegram, tira a marcação do texto e para de responder', async () => {
    const { v, sock, chamadas, enviadas } = montar({ respostas: ['Recebi, vou conferir e já te aviso!\n[[PAGAMENTO|vídeo 17s, R$31, pagou tudo]]'] });
    await v.receber(sock, msgTexto('paguei!'));
    await esperar();
    assert.strictEqual(enviadas.length, 1);
    assert.ok(!enviadas[0].texto.includes('[['));
    assert.strictEqual(chamadas.telegram.length, 1);
    assert.ok(chamadas.telegram[0].text.includes('PAGOU'));
    assert.ok(chamadas.telegram[0].text.includes('vídeo 17s'));
    assert.ok(chamadas.telegram[0].text.includes('wa.me/5511999990000'));
    // cliente fala de novo: atendente fica quieto
    await v.receber(sock, msgTexto('e aí?'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 1);
    assert.strictEqual(v._estado().chats[JID].pausado, true);
  });
  await teste('dono responde pelo celular: atendente pausa; /ia religa', async () => {
    const { v, sock, chamadas } = montar();
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 1);
    await esperar(); // passa a janela de eco? (usa relógio real: 8s) -> simula com ultimoEnvio antigo
    v._estado().chats[JID].ultimoEnvio = 0;
    await v.receber(sock, msgDono('Oi, aqui é eu mesmo, já te ajudo'));
    assert.strictEqual(v._estado().chats[JID].pausado, true);
    await v.receber(sock, msgTexto('beleza'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 1);
    await v.receber(sock, msgDono('/ia'));
    assert.strictEqual(v._estado().chats[JID].pausado, false);
    await v.receber(sock, msgTexto('voltou?'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 2);
  });
  await teste('eco das próprias mensagens do atendente não pausa a conversa', async () => {
    const { v, sock, enviadas } = montar({ respostas: ['Oi!'] });
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    const eco = { key: { remoteJid: JID, id: enviadas[0].id, fromMe: true }, message: { conversation: 'Oi!' } };
    await v.receber(sock, eco);
    assert.strictEqual(v._estado().chats[JID].pausado, false);
  });
  await teste('HUMANO: avisa o dono e pausa', async () => {
    const { v, sock, chamadas } = montar({ respostas: ['Vou ver isso com o responsável 🙂\n[[HUMANO|cliente pediu desconto]]'] });
    await v.receber(sock, msgTexto('faz por 10?'));
    await esperar();
    assert.ok(chamadas.telegram[0].text.includes('precisa de você'));
    assert.ok(chamadas.telegram[0].text.includes('desconto'));
    assert.strictEqual(v._estado().chats[JID].pausado, true);
  });
  await teste('comando de campeonato no privado e números ignorados não são atendidos', async () => {
    const { v, sock, chamadas } = montar({ env: { VENDAS_IGNORAR: '5511888880000' } });
    await v.receber(sock, msgTexto('/ranking'));
    const outro = msgTexto('oi'); outro.key.remoteJid = '5511888880000@s.whatsapp.net';
    await v.receber(sock, outro);
    await esperar();
    assert.strictEqual(chamadas.claude.length, 0);
  });
  await teste('Claude fora do ar: não manda nada ao cliente e avisa o dono', async () => {
    const { v, sock, chamadas, enviadas } = montar({ falhaClaude: true });
    await v.receber(sock, msgTexto('oi'));
    await esperar(80);
    assert.strictEqual(enviadas.length, 0);
    assert.strictEqual(chamadas.telegram.length, 1);
    assert.ok(chamadas.telegram[0].text.includes('não conseguiu responder'));
  });
  await teste('limite diário: para de responder e avisa', async () => {
    const { v, sock, chamadas, enviadas } = montar({ env: { VENDAS_LIMITE_CHAT_DIA: '1' }, respostas: ['Oi!', 'Segunda'] });
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    await v.receber(sock, msgTexto('oi de novo'));
    await esperar();
    assert.strictEqual(enviadas.length, 1);
    assert.strictEqual(chamadas.claude.length, 1);
    assert.ok(chamadas.telegram.some((t) => t.text.includes('Limite diário')));
  });
  await teste('mensagem velha (bot ficou fora do ar) é ignorada', async () => {
    const { v, sock, chamadas } = montar();
    const velha = msgTexto('oi', { messageTimestamp: Math.floor(Date.now() / 1000) - 3 * 24 * 3600 });
    await v.receber(sock, velha);
    await esperar();
    assert.strictEqual(chamadas.claude.length, 0);
  });
  console.log('Gemini (plano grátis)');
  const SO_GEMINI = { ANTHROPIC_API_KEY: '', GROQ_API_KEY: '', GEMINI_API_KEY: 'chave-gemini' };
  await teste('escolha do provedor', () => {
    assert.strictEqual(montar().v.provedor, 'claude');
    assert.strictEqual(montar({ env: SO_GEMINI }).v.provedor, 'gemini');
    assert.strictEqual(montar({ env: { GEMINI_API_KEY: 'x' } }).v.provedor, 'claude'); // com as duas chaves, vale o Claude
    assert.strictEqual(montar({ env: { GEMINI_API_KEY: 'x', VENDAS_PROVEDOR: 'gemini' } }).v.provedor, 'gemini');
  });
  await teste('Gemini: texto vai no formato certo e a resposta é enviada', async () => {
    const { v, sock, chamadas, enviadas } = montar({ env: SO_GEMINI, respostas: ['Opa, tudo certo?\n\nAqui é do Estúdio Digital 🎬'] });
    await v.receber(sock, msgTexto('Opa, posso ter mais informações sobre isso?'));
    await esperar();
    assert.strictEqual(chamadas.claude.length, 0);
    assert.strictEqual(chamadas.gemini.length, 1);
    const g = chamadas.gemini[0];
    assert.ok(g.url.includes('/models/gemini-flash-latest:generateContent'));
    assert.strictEqual(g.chave, 'chave-gemini');
    assert.ok(g.corpo.systemInstruction.parts[0].text.includes('pix@exemplo.com'));
    assert.deepStrictEqual(g.corpo.contents, [{ role: 'user', parts: [{ text: 'Opa, posso ter mais informações sobre isso?' }] }]);
    assert.strictEqual(enviadas.length, 2);
  });
  await teste('Gemini: histórico usa os papéis user e model', async () => {
    const { v, sock, chamadas } = montar({ env: SO_GEMINI, respostas: ['Oi!', 'Beleza'] });
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    await v.receber(sock, msgTexto('quero um vídeo'));
    await esperar();
    const papeis = chamadas.gemini[1].corpo.contents.map((c) => c.role);
    assert.deepStrictEqual(papeis, ['user', 'model', 'user']);
  });
  await teste('Gemini: áudio é transcrito pelo próprio Gemini quando não há Groq', async () => {
    const { v, sock, chamadas } = montar({ env: SO_GEMINI });
    await v.receber(sock, msgAudio());
    await esperar();
    assert.strictEqual(chamadas.groq.length, 0);
    assert.strictEqual(chamadas.gemini.length, 2);
    assert.strictEqual(chamadas.gemini[0].corpo.contents[0].parts[0].inlineData.mimeType, 'audio/ogg');
    assert.ok(chamadas.gemini[1].corpo.contents[0].parts[0].text.includes('[áudio do cliente] quero um vídeo do meu filho brincando'));
  });
  await teste('Gemini: comprovante em imagem vai como inlineData', async () => {
    const { v, sock, chamadas } = montar({ env: SO_GEMINI });
    await v.receber(sock, msgImagem());
    await esperar();
    const partes = chamadas.gemini[0].corpo.contents[0].parts;
    assert.strictEqual(partes[0].inlineData.mimeType, 'image/jpeg');
    assert.ok(partes[1].text.includes('imagem enviada pelo cliente'));
    assert.ok(!partes[1].text.includes('comprovante'));
  });
  await teste('Gemini: pagamento avisa no Telegram igual ao Claude', async () => {
    const { v, sock, chamadas } = montar({ env: SO_GEMINI, respostas: ['Recebi, vou conferir!\n[[PAGAMENTO|vídeo 17s R$31]]'] });
    await v.receber(sock, msgTexto('paguei'));
    await esperar();
    assert.strictEqual(chamadas.telegram.length, 1);
    assert.ok(chamadas.telegram[0].text.includes('PAGOU'));
  });
  await teste('sem a chave do provedor escolhido: avisa o dono e não responde', async () => {
    const { v, sock, chamadas, enviadas } = montar({ env: { ANTHROPIC_API_KEY: '', VENDAS_PROVEDOR: 'gemini' } });
    await v.receber(sock, msgTexto('oi'));
    await esperar();
    assert.strictEqual(enviadas.length, 0);
    assert.ok(chamadas.telegram[0].text.includes('GEMINI_API_KEY'));
  });

  const PR = () => montarPrompt({ pixChave: 'pix@exemplo.com', agora: 'hoje' });
  await teste('manual: só vende foto de estúdio, sem nada de vídeo ou tabela por duração', async () => {
    const pr = PR();
    assert.ok(pr.includes('foto profissional de estúdio'));
    assert.ok(pr.includes('É só isso que vendemos no momento'));
    assert.ok(!pr.includes('PEDIDO de VÍDEO'));
    assert.ok(!pr.includes('Tabela de preços de vídeo'));
    assert.ok(!pr.includes('R$150'));
    assert.ok(!pr.includes('muito diálogo'));
  });
  await teste('manual: primeira resposta pede a foto do cliente (rosto visível, boa iluminação)', async () => {
    const pr = PR();
    assert.ok(pr.includes('Vamos criar a sua foto de estúdio'));
    assert.ok(pr.includes('A única coisa que eu vou precisar é de uma foto sua'));
    assert.ok(pr.includes('mostre bem o seu rosto'));
    assert.ok(pr.includes('boa iluminação'));
    assert.ok(pr.includes('Me manda a sua melhor foto'));
  });
  await teste('manual: preço R$7,99 e álbum de 5 por R$25 (R$5 cada), com a tabela de 1 a 4 fotos', async () => {
    const pr = PR();
    assert.ok(pr.includes('R$7,99'));
    assert.ok(pr.includes('álbum completo com 5 fotos por somente R$25'));
    assert.ok(pr.includes('sai R$5 cada'));
    assert.ok(pr.includes(tabelaTexto()));
    assert.ok(pr.includes('2 fotos = R$15,98'));
    assert.ok(pr.includes('3 fotos = R$23,97'));
    assert.ok(pr.includes('Nunca dê desconto'));
    assert.ok(pr.includes('Mais de 5 fotos: o preço padrão é R$5 cada foto'));
    assert.ok(pr.includes('8 fotos = R$40'));
    assert.ok(pr.includes('10 fotos = R$50'));
    assert.ok(pr.includes('15 fotos = R$75'));
    assert.ok(pr.includes('Só fale disso se o cliente pedir mais de 5 fotos'));
    assert.ok(pr.includes('nunca puxe esse assunto por conta própria'));
    assert.ok(!pr.includes('cliente quer mais de 5 fotos'));
  });
  await teste('manual: ordem é foto, preço, detalhes da foto (cenário, roupa, áudio) e só depois o Pix', async () => {
    const pr = PR();
    const i1 = pr.indexOf('1. Foto do cliente');
    const i2 = pr.indexOf('2. Preço e quantidade');
    const i3 = pr.indexOf('3. Detalhes da foto');
    const i5 = pr.indexOf('4. Pix');
    assert.ok(i1 > 0 && i1 < i2 && i2 < i3 && i3 < i5);
    assert.ok(pr.includes('antes de pedir o Pix, pergunte como ele quer a foto'));
    assert.ok(pr.includes('Um cenário específico, uma roupa diferente'));
    assert.ok(pr.includes('mude algo no cabelo'));
    assert.ok(pr.includes('em uma única mensagem'));
    assert.ok(pr.includes('Não repita o pedido dele nem peça confirmação de novo'));
    assert.ok(pr.includes('pode me mandar um áudio explicando'));
  });
  await teste('manual: prazo (30 min a 1 h) e 2 refações só se o cliente perguntar', async () => {
    const pr = PR();
    assert.ok(pr.includes('Prazo e ajustes (só se o cliente perguntar)'));
    assert.ok(pr.includes('Não fale disso por conta própria'));
    assert.ok(pr.includes('de 30 minutos a 1 hora'));
    assert.ok(pr.includes('refazer até 2 vezes'));
  });
  await teste('manual: Pix em 3 mensagens, comprovante vira [[PAGAMENTO]] e nunca confirma pagamento', async () => {
    const pr = PR();
    assert.ok(pr.includes('MENSAGENS SEPARADAS'));
    assert.ok(pr.includes('SÓ a chave, sozinha na mensagem'));
    assert.ok(pr.includes('Nunca escreva a chave dentro de uma frase'));
    assert.ok(pr.includes('que você fica aguardando o pagamento'));
    assert.ok(pr.includes('mandar o comprovante por aqui'));
    assert.ok(pr.includes('Recebi, vou conferir aqui e já te aviso!'));
    assert.ok(pr.includes('NUNCA confirma que o pagamento caiu'));
    assert.ok(pr.includes('[[PAGAMENTO|resumo curto: quantidade'));
  });
  await teste('manual: Pix avisa que o valor vai direto pra Jhenifer, a dona, antes do valor e da chave', async () => {
    const pr = PR();
    const iAviso = pr.indexOf('(1) o aviso de quem recebe');
    const iValor = pr.indexOf('(2) o valor combinado');
    const iChave = pr.indexOf('(3) SÓ a chave');
    const iAguarda = pr.indexOf('(4) que você fica aguardando');
    assert.ok(iAviso > 0 && iAviso < iValor && iValor < iChave && iChave < iAguarda);
    assert.ok(pr.includes('o valor vai direto para Jhenifer, a dona do Estúdio Digital'));
    assert.ok(pr.includes('vai direto pra Jhenifer, a dona do Estúdio Digital, então é o nome dela'));
    assert.ok(pr.includes('só nesse momento, junto do Pix, não no meio da conversa'));
    assert.ok(!pr.includes('em nome de'));
    assert.ok(montarPrompt({ pixChave: 'x', pixDono: 'Maria', agora: 'hoje' }).includes('direto para Maria, a dona'));
  });
  await teste('manual: imagem pode ser foto do cliente ou comprovante e o atendente reconhece e segue o fluxo', async () => {
    const pr = PR();
    assert.ok(pr.includes('Imagens e arquivos que o cliente manda'));
    assert.ok(pr.includes('QUALQUER momento'));
    assert.ok(pr.includes('Não trate toda imagem como comprovante'));
    assert.ok(pr.includes('[imagem enviada pelo cliente]'));
    assert.ok(pr.includes('muito ruim'));
    assert.ok(pr.includes('uma vez só'));
    assert.ok(!pr.includes('[comprovante/imagem do cliente]'));
  });
  await teste('manual: se o cliente perguntar o preço antes de mandar a foto, responde direto', async () => {
    const pr = PR();
    assert.ok(pr.includes('Se o cliente perguntar o preço antes de mandar a foto, responda direto'));
    assert.ok(!pr.includes('entre R$30 e R$120'));
  });
  await teste('conversa salva em disco e recarregada', async () => {
    const a = montar();
    await a.v.receber(a.sock, msgTexto('oi'));
    await esperar();
    a.v.salvarAgora();
    const salvo = JSON.parse(fs.readFileSync(path.join(a.dir, 'vendas.json'), 'utf8'));
    assert.strictEqual(salvo.chats[JID].historico.length, 2);
  });

  // ---------- lembretes pra quem sumiu ----------
  const INICIO = '2026-11-19T13:00:00Z'; // 10h em Brasília
  const conversarEsumir = async (extra = {}) => {
    const a = montar({ inicio: INICIO, respostas: ['opa! que tipo de vídeo você quer?'], ...extra });
    await a.v.receber(a.sock, msgTexto('oi, quero um vídeo'));
    await esperar();
    a.enviadas.length = 0;
    return a;
  };
  await teste('lembrete: antes de 3h não manda; depois de 3h manda 1', async () => {
    const a = await conversarEsumir();
    a.horas(2);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
    a.horas(1.5);
    assert.strictEqual(await a.v.verificarLembretes(), 1);
    assert.strictEqual(a.enviadas.length, 1);
    assert.ok(/foto de estúdio/i.test(a.enviadas[0].texto));
    assert.ok(a.enviadas[0].texto.includes('Cliente'));
    assert.ok(a.v._estado().chats[JID].historico.at(-1).content.includes('[lembrete automático enviado'));
  });
  await teste('lembrete: no máximo 2 e o 2º só depois de 24h', async () => {
    const a = await conversarEsumir();
    a.horas(4); await a.v.verificarLembretes();
    a.horas(5); assert.strictEqual(await a.v.verificarLembretes(), 0);
    a.horas(20); assert.strictEqual(await a.v.verificarLembretes(), 1);
    a.horas(30); assert.strictEqual(await a.v.verificarLembretes(), 0);
    assert.strictEqual(a.enviadas.length, 2);
    assert.notStrictEqual(a.enviadas[0].texto, a.enviadas[1].texto);
  });
  await teste('lembrete: fora do horário (9h–20h) espera a manhã seguinte', async () => {
    const a = await conversarEsumir({ inicio: '2026-11-19T21:00:00Z' }); // 18h
    a.horas(3); // 21h em Brasília
    assert.strictEqual(await a.v.verificarLembretes(), 0);
    a.horas(12); // 9h do dia seguinte
    assert.strictEqual(await a.v.verificarLembretes(), 1);
  });
  await teste('lembrete: não manda se o cliente disse que pagou ou precisa do dono (conversa pausada)', async () => {
    const a = montar({ inicio: INICIO, respostas: ['Recebi, vou conferir!\n[[PAGAMENTO|resumo]]'] });
    await a.v.receber(a.sock, msgTexto('paguei'));
    await esperar();
    a.horas(5);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
  });
  await teste('lembrete: não manda se o dono assumiu a conversa', async () => {
    const a = await conversarEsumir();
    a.horas(0.01);
    await a.v.receber(a.sock, msgDono('oi, é o dono'));
    a.horas(5);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
  });
  await teste('lembrete: não manda pra quem pediu pra parar', async () => {
    const a = montar({ inicio: INICIO, respostas: ['tudo bem, qualquer coisa é só falar'] });
    await a.v.receber(a.sock, msgTexto('não quero mais, obrigado'));
    await esperar();
    a.horas(5);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
  });
  await teste('lembrete: se o cliente volta a falar, a contagem recomeça', async () => {
    const a = await conversarEsumir({ respostas: ['opa!', 'beleza, me conta mais'] });
    a.horas(4); await a.v.verificarLembretes();
    await a.v.receber(a.sock, msgTexto('voltei, quero sim'));
    await esperar();
    assert.strictEqual(a.v._estado().chats[JID].lembretes, 0);
    a.horas(4);
    assert.strictEqual(await a.v.verificarLembretes(), 1);
  });
  await teste('lembrete: VENDAS_LEMBRETES=nao desliga', async () => {
    const a = await conversarEsumir({ env: { VENDAS_LEMBRETES: 'nao' } });
    a.horas(5);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
  });
  await teste('lembrete: limite diário de lembretes', async () => {
    const a = await conversarEsumir({ env: { VENDAS_LEMBRETES_DIA: '0' } });
    a.horas(5);
    assert.strictEqual(await a.v.verificarLembretes(), 0);
  });

  console.log(`\n${ok} testes de vendas ok`);
})();
