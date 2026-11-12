import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.match(previa.linkWhatsapp, /^\/api\/pedidos\/whatsapp\?itens=/);
  await pool.query("UPDATE produtos SET preco_centavos = NULL WHERE slug = 'drip'");
});

test('link do pedido redireciona ao WhatsApp da loja com a mensagem montada no servidor', async () => {
  const res = await fetch(`${srv.base}/api/pedidos/whatsapp?itens=i-won-again:M:2,the-key:G:1`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const destino = new URL(res.headers.get('location'));
  assert.equal(destino.host, 'wa.me');
  assert.equal(destino.pathname, '/5535997653327');
  const texto = destino.searchParams.get('text');
  assert.match(texto, /2x I Won Again \(Cru \/ Vinho\) — Tam\. M/);
  assert.match(texto, /https:\/\/oppe\.exemplo\/produto\/the-key/);

  const ruim = await fetch(`${srv.base}/api/pedidos/whatsapp?itens=<script>:M:1`, { redirect: 'manual' });
  assert.equal(ruim.status, 400);
  assert.doesNotMatch(await ruim.text(), /<script>/);
});

test('peça desativada some do site e não pode ser pedida', async () => {
  await pool.query("UPDATE produtos SET ativo = false WHERE slug = 'fall'");
  assert.equal((await fetch(`${srv.base}/api/produtos/fall`)).status, 404);
  assert.equal((await json('/api/produtos')).produtos.length, 12);
  const pedido = await fetch(`${srv.base}/api/pedidos/whatsapp?itens=fall:M:1`, { redirect: 'manual' });
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
