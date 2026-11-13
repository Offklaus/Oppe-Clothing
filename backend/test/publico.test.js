import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CLIENTE_TESTE, consultarPedido, fazerPedido, ORIGEM, prepararBanco, subirServidor } from './ajuda.js';

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
  assert.equal(loja.ufs.length, 27, 'o formulário de entrega recebe os estados do servidor');
  assert.ok(loja.ufs.includes('MG'));
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

/** Muda o preço de uma peça só durante o teste (volta ao original mesmo se o teste falhar). */
async function precoDuranteOTeste(t, slug, centavos) {
  await pool.query('UPDATE produtos SET preco_centavos = $2 WHERE slug = $1', [slug, centavos]);
  t.after(() => pool.query('UPDATE produtos SET preco_centavos = NULL WHERE slug = $1', [slug]));
}

test('prévia da sacola: junta repetidos, tira o que não existe e calcula o total', async (t) => {
  await precoDuranteOTeste(t, 'drip', 12990);
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
  assert.equal(previa.podeFinalizar, true);
  assert.equal(previa.linkWhatsapp, undefined, 'o pedido não sai mais por link');
});

const contarPedidos = async () => (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;

test('finalizar pedido: registra com os dados do cliente e devolve o código e o WhatsApp', async (t) => {
  await precoDuranteOTeste(t, 'the-key', 15000);
  const res = await fazerPedido(srv.base, [{ id: 'i-won-again', tamanho: 'M', qtd: 2 }, { id: 'the-key', tamanho: 'G', qtd: 1 }]);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const criado = await res.json();
  assert.match(criado.codigo, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const codigo = criado.codigo.replace('-', '');
  assert.equal(criado.acompanharUrl, `/acompanhar?codigo=${codigo}`);

  const destino = new URL(criado.whatsappUrl);
  assert.equal(destino.host, 'wa.me');
  assert.equal(destino.pathname, '/5535997653327');
  const texto = destino.searchParams.get('text');
  assert.match(texto, /2x I Won Again \(Cru \/ Vinho\) — Tam\. M/);
  assert.match(texto, new RegExp(`Pedido: #${criado.codigo}`));
  assert.match(texto, /Nome: Maria Teste/);
  assert.match(texto, /Entrega: Itajubá\/MG — CEP 37500-000/);
  assert.match(texto, new RegExp(`Acompanhe: https://oppe\\.exemplo/acompanhar\\?codigo=${codigo}`));
  assert.doesNotMatch(texto, /maria@exemplo\.com|Rua das Flores/, 'e-mail e endereço completo ficam só no painel');

  const { rows: [salvo] } = await pool.query('SELECT * FROM pedidos WHERE codigo = $1', [codigo]);
  assert.equal(salvo.status, 'novo');
  assert.equal(salvo.pecas, 3);
  assert.equal(salvo.total_centavos, null, 'uma peça sem preço deixa o total "a combinar"');
  assert.equal(salvo.cliente_telefone, '5535999990000');
  assert.equal(salvo.entrega_cep, '37500000');
  assert.equal(salvo.entrega_uf, 'MG');
  const { rows: itens } = await pool.query('SELECT slug, tamanho, qtd, preco_centavos FROM pedido_itens WHERE pedido_id = $1 ORDER BY posicao', [salvo.id]);
  assert.deepEqual(itens, [
    { slug: 'i-won-again', tamanho: 'M', qtd: 2, preco_centavos: null },
    { slug: 'the-key', tamanho: 'G', qtd: 1, preco_centavos: 15000 }
  ]);
  const { rows: eventos } = await pool.query('SELECT status FROM pedido_eventos WHERE pedido_id = $1', [salvo.id]);
  assert.deepEqual(eventos, [{ status: 'novo' }]);
});

test('clique duplo em "confirmar" não cria dois pedidos', async () => {
  const chave = randomUUID();
  const antes = await contarPedidos();
  const respostas = await Promise.all([1, 2, 3].map(() => fazerPedido(srv.base, [{ id: 'drip', tamanho: 'P', qtd: 1 }], { chave })));
  const corpos = await Promise.all(respostas.map((r) => r.json()));
  assert.equal(new Set(corpos.map((c) => c.codigo)).size, 1, 'mesmo código');
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(await contarPedidos(), antes + 1);
});

test('repetir a chave com outros dados não devolve o pedido (nem a mensagem) de outra pessoa', async () => {
  const chave = randomUUID();
  const original = await fazerPedido(srv.base, [{ id: 'drip', tamanho: 'G', qtd: 1 }], { chave });
  assert.equal(original.status, 201);

  for (const outro of [{ email: 'outra@exemplo.com' }, { telefone: '(11) 98888-7777' }]) {
    const res = await fazerPedido(srv.base, [{ id: 'flame', tamanho: 'M', qtd: 1 }], { chave, cliente: { ...CLIENTE_TESTE, ...outro } });
    assert.equal(res.status, 409);
    const corpo = await res.json();
    assert.equal(corpo.whatsappUrl, undefined);
    assert.ok(!JSON.stringify(corpo).includes('Maria'));
  }
  // o mesmo cliente repetindo (ex.: nova tentativa após falha de rede) recebe o mesmo pedido
  const repetido = await fazerPedido(srv.base, [{ id: 'drip', tamanho: 'G', qtd: 1 }], { chave });
  assert.equal(repetido.status, 200);
  assert.equal((await repetido.json()).codigo, (await original.json()).codigo);
});

test('pedido só é aceito vindo do site, com dados válidos', async () => {
  const antes = await contarPedidos();
  const itens = [{ id: 'drip', tamanho: 'M', qtd: 1 }];
  assert.equal((await fazerPedido(srv.base, itens, { origem: null })).status, 403, 'sem Origin');
  assert.equal((await fazerPedido(srv.base, itens, { origem: 'https://site-malicioso.exemplo' })).status, 403);

  const ruim = await fazerPedido(srv.base, itens, {
    cliente: { ...CLIENTE_TESTE, email: 'sem-arroba', telefone: '123', cep: '1', uf: 'ZZ', nome: '<script>' }
  });
  assert.equal(ruim.status, 400);
  const { campos } = await ruim.json();
  assert.deepEqual(Object.keys(campos).sort(), ['cliente.cep', 'cliente.email', 'cliente.nome', 'cliente.telefone', 'cliente.uf']);

  const semChave = await fetch(`${srv.base}/api/pedidos`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGEM }, body: JSON.stringify({ itens, cliente: CLIENTE_TESTE })
  });
  assert.equal(semChave.status, 400);
  assert.equal((await fazerPedido(srv.base, [])).status, 400, 'sacola vazia');
  assert.equal((await fazerPedido(srv.base, [{ id: '<script>', tamanho: 'M', qtd: 1 }])).status, 400);
  assert.equal((await fetch(`${srv.base}/api/pedidos/whatsapp?itens=drip:M:1`)).status, 404, 'o link antigo não existe mais');
  assert.equal(await contarPedidos(), antes, 'nada foi registrado');
});

test('acompanhar pedido: mostra o andamento pelo código, sem dados pessoais', async () => {
  const { codigo } = await (await fazerPedido(srv.base, [{ id: 'flame', tamanho: 'G', qtd: 1 }])).json();

  const res = await consultarPedido(srv.base, ` #${codigo.toLowerCase()} `);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const pedido = await res.json();
  assert.equal(pedido.codigo, codigo);
  assert.equal(pedido.statusRotulo, 'Aguardando pagamento');
  assert.deepEqual(pedido.etapas.map((e) => [e.rotulo, e.estado]), [
    ['Pagamento', 'atual'], ['Preparação', 'pendente'], ['Envio', 'pendente'], ['Entrega', 'pendente']
  ]);
  assert.equal(pedido.etapas[0].texto, 'Aguardando pagamento');
  assert.ok(pedido.etapas[0].data);
  assert.deepEqual(pedido.itens.map((i) => [i.nome, i.tamanho, i.qtd]), [['Flame', 'G', 1]]);
  const tudo = JSON.stringify(pedido);
  for (const pessoal of ['Maria', 'maria@exemplo.com', '99999', 'Rua das Flores', '37500', 'Centro', 'Apto']) {
    assert.ok(!tudo.includes(pessoal), `não pode mostrar "${pessoal}"`);
  }

  const inexistente = await consultarPedido(srv.base, 'ZZZZ-ZZZZ');
  const invalido = await consultarPedido(srv.base, 'abc');
  assert.equal(inexistente.status, 404);
  assert.equal(invalido.status, 404);
  assert.equal((await inexistente.json()).erro, (await invalido.json()).erro, 'mesma resposta: não dá pistas');
  assert.equal((await consultarPedido(srv.base, '')).status, 400);
});

test('peça desativada some do site e não pode ser pedida', async (t) => {
  await pool.query("UPDATE produtos SET ativo = false WHERE slug = 'fall'");
  t.after(() => pool.query("UPDATE produtos SET ativo = true WHERE slug = 'fall'"));
  assert.equal((await fetch(`${srv.base}/api/produtos/fall`)).status, 404);
  assert.equal((await json('/api/produtos')).produtos.length, 12);
  const pedido = await fazerPedido(srv.base, [{ id: 'fall', tamanho: 'M', qtd: 1 }]);
  assert.equal(pedido.status, 400);
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
