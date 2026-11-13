import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prepararBanco, subirServidor } from './ajuda.js';

let pool;
let srv;
const json = async (caminho) => (await fetch(srv.base + caminho)).json();

before(async () => {
  pool = await prepararBanco();
  srv = await subirServidor(pool);
});
after(async () => {
  await srv.fechar();
  await pool.end();
});

test('dados da loja: só o que o site precisa, sem campos internos', async () => {
  const loja = await json('/api/loja');
  assert.equal(loja.whatsappExibicao, '(35) 99765-3327');
  assert.deepEqual(loja.instagram, { usuario: '@oppeclothing', url: 'https://www.instagram.com/oppeclothing/' });
  assert.equal(loja.mensagens, undefined);
  assert.equal(loja.whatsapp_numero, undefined);
  assert.deepEqual(loja.filtros.map((f) => f.nome), ['Todas', 'Faith', 'Graphic', 'Logo', 'Key & Heart']);
  assert.equal(loja.destaqueId, 'i-won-again');
  assert.equal(loja.colecaoDestaque.titulo, 'The Key & To My Heart');
  assert.equal(loja.colecaoDestaque.chamada, 'COLEÇÃO ✦ PARA DOIS');
});

test('lista as peças e filtra por coleção no servidor', async () => {
  const todas = await json('/api/produtos');
  assert.equal(todas.produtos.length, 13);
  assert.equal(todas.rotuloTotal, '13 PEÇAS');
  assert.ok(todas.produtos.every((p) => p.faces.length === 2 && p.precoTexto));

  const logo = await json('/api/produtos?colecao=logo');
  assert.deepEqual(logo.produtos.map((p) => p.id), ['flame', 'drip', 'chaos-also-builds']);
  assert.equal(logo.rotuloTotal, '3 PEÇAS');
});

test('detalhe da peça traz ficha, tamanhos e relacionados da mesma coleção primeiro', async () => {
  const p = await json('/api/produtos/i-won-again');
  assert.equal(p.referencia, 'ROMANOS 12:21');
  assert.equal(p.precoTexto, 'Sob consulta');
  assert.deepEqual(p.tamanhos, ['P', 'M', 'G', 'GG', 'XGG']);
  assert.deepEqual(p.ficha.map((f) => f.rotulo), ['MODELAGEM', 'MALHA', 'ESTAMPA', 'CUIDADOS']);
  assert.equal(p.relacionados.length, 4);
  assert.ok(p.relacionados.every((r) => r.colecao === 'Faith'));
  assert.equal((await fetch(`${srv.base}/api/produtos/nao-existe`)).status, 404);
});

test('prévia da sacola: junta repetidos, tira o que não existe e calcula o total', async () => {
  await pool.query("UPDATE produtos SET preco_centavos = 12990 WHERE slug = 'drip'");
  const res = await fetch(`${srv.base}/api/pedidos/previa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itens: [
      { id: 'drip', tamanho: 'M', qtd: 1 },
      { id: 'drip', tamanho: 'M', qtd: 2 },
      { id: 'nao-existe', tamanho: 'M', qtd: 1 },
      { id: 'drip', tamanho: 'ZZ', qtd: 1 },
      { id: 'drip', tamanho: 'G', qtd: 500 }
    ] })
  });
  const previa = await res.json();
  assert.deepEqual(previa.itens.map((i) => [i.tamanho, i.qtd]), [['M', 3], ['G', 99]]);
  assert.equal(previa.removidos.length, 2);
  assert.equal(previa.pecas, 102);
  assert.match(previa.totalTexto, /R\$\s13\.249,80/);
  assert.match(previa.linkWhatsapp, /^\/api\/pedidos\/whatsapp\?itens=[^&]+&chave=[0-9a-f-]{36}$/);
  await pool.query("UPDATE produtos SET preco_centavos = NULL WHERE slug = 'drip'");
});

const abrirPedido = (itens, chave = randomUUID(), headers = {}) =>
  fetch(`${srv.base}/api/pedidos/whatsapp?itens=${encodeURIComponent(itens)}&chave=${chave}`, { redirect: 'manual', headers });

test('link do pedido registra o pedido e redireciona ao WhatsApp com o código na mensagem', async () => {
  await pool.query("UPDATE produtos SET preco_centavos = 15000 WHERE slug = 'the-key'");
  const res = await abrirPedido('i-won-again:M:2,the-key:G:1');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const destino = new URL(res.headers.get('location'));
  assert.equal(destino.host, 'wa.me');
  assert.equal(destino.pathname, '/5535997653327');
  const texto = destino.searchParams.get('text');
  assert.match(texto, /2x I Won Again \(Cru \/ Vinho\) — Tam\. M/);
  assert.match(texto, /https:\/\/oppe\.exemplo\/produto\/the-key/);

  const codigo = texto.match(/Código do pedido: #([2-9A-HJ-NP-Z]{6})/)?.[1];
  assert.ok(codigo, 'a mensagem leva o código do pedido');
  const { rows: [salvo] } = await pool.query('SELECT * FROM pedidos WHERE codigo = $1', [codigo]);
  assert.equal(salvo.status, 'novo');
  assert.equal(salvo.pecas, 3);
  assert.equal(salvo.total_centavos, null, 'uma peça sem preço deixa o total "a combinar"');
  const { rows: itens } = await pool.query('SELECT slug, tamanho, qtd, preco_centavos FROM pedido_itens WHERE pedido_id = $1 ORDER BY posicao', [salvo.id]);
  assert.deepEqual(itens, [
    { slug: 'i-won-again', tamanho: 'M', qtd: 2, preco_centavos: null },
    { slug: 'the-key', tamanho: 'G', qtd: 1, preco_centavos: 15000 }
  ]);
  await pool.query("UPDATE produtos SET preco_centavos = NULL WHERE slug = 'the-key'");
});

test('o mesmo link (clique duplo, "abrir de novo") não cria outro pedido', async () => {
  const chave = randomUUID();
  const antes = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  const respostas = await Promise.all([abrirPedido('drip:P:1', chave), abrirPedido('drip:P:1', chave), abrirPedido('drip:P:1', chave)]);
  assert.deepEqual(respostas.map((r) => r.status), [303, 303, 303]);
  assert.equal(new Set(respostas.map((r) => r.headers.get('location'))).size, 1, 'mesma mensagem, mesmo código');
  const depois = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  assert.equal(depois, antes + 1);
});

test('pedido só é registrado quando vem do próprio site, com link válido', async () => {
  const antes = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  const deOutroSite = await abrirPedido('drip:M:1', randomUUID(), { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' });
  assert.equal(deOutroSite.status, 403);
  const comoImagem = await abrirPedido('drip:M:1', randomUUID(), { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'image' });
  assert.equal(comoImagem.status, 403);
  const semChave = await fetch(`${srv.base}/api/pedidos/whatsapp?itens=drip:M:1`, { redirect: 'manual' });
  assert.equal(semChave.status, 400);
  const chaveRuim = await abrirPedido('drip:M:1', 'nao-e-uuid');
  assert.equal(chaveRuim.status, 400);

  const ruim = await abrirPedido('<script>:M:1');
  assert.equal(ruim.status, 400);
  assert.doesNotMatch(await ruim.text(), /<script>/);

  const doSite = await abrirPedido('drip:M:1', randomUUID(), { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document' });
  assert.equal(doSite.status, 303);
  const depois = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  assert.equal(depois, antes + 1, 'só o pedido feito pelo site foi registrado');
});

test('peça desativada some do site e não pode ser pedida', async () => {
  await pool.query("UPDATE produtos SET ativo = false WHERE slug = 'fall'");
  assert.equal((await fetch(`${srv.base}/api/produtos/fall`)).status, 404);
  assert.equal((await json('/api/produtos')).produtos.length, 12);
  const pedido = await abrirPedido('fall:M:1');
  assert.equal(pedido.status, 400);
  await pool.query("UPDATE produtos SET ativo = true WHERE slug = 'fall'");
});

test('cabeçalhos de segurança e fotos', async () => {
  const res = await fetch(`${srv.base}/api/loja`);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const foto = await fetch(`${srv.base}/images/camisetas/drip-frente.webp`);
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get('content-type'), 'image/webp');
});
