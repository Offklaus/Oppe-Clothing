// Controle de estoque por tamanho: reserva no pedido, devolução no cancelamento e ajuste no painel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarUsuario } from '../src/servicos/autenticacao.js';
import { clienteAdmin, consultarPedido, fazerPedido, prepararBanco, SENHA_TESTE, subirServidor } from './ajuda.js';

let pool;
let srv;
let admin;
let idDrip;

const peca = async (slug) => (await fetch(`${srv.base}/api/produtos/${slug}`)).json();
const estoqueDe = async (id) => (await admin.pedir('GET', `/produtos/${id}`)).corpo.estoque;
const quantidades = (estoque) => Object.fromEntries(estoque.tamanhos.map((t) => [t.tamanho, t.quantidade]));
const salvarEstoque = (id, corpo) => admin.pedir('PUT', `/produtos/${id}/estoque`, corpo);
const pedir = (itens, extra) => fazerPedido(srv.base, itens, extra);

before(async () => {
  pool = await prepararBanco();
  await criarUsuario(pool, { nome: 'Admin Estoque', email: 'estoque@teste.local', senha: SENHA_TESTE });
  srv = await subirServidor(pool);
  admin = clienteAdmin(srv.base);
  await admin.pedir('POST', '/login', { email: 'estoque@teste.local', senha: SENHA_TESTE });
  idDrip = (await pool.query("SELECT id FROM produtos WHERE slug = 'drip'")).rows[0].id;
});
after(async () => {
  await srv.fechar();
  await pool.end();
});

test('peças sem controle de estoque vendem como antes', async () => {
  const detalhe = await peca('drip');
  assert.deepEqual(detalhe.tamanhosEsgotados, []);
  assert.equal(detalhe.esgotado, false);
  assert.equal((await estoqueDe(idDrip)).texto, 'Não controlado');
  const res = await pedir([{ id: 'drip', tamanho: 'M', qtd: 5 }]);
  assert.equal(res.status, 201);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM estoque_movimentos');
  assert.equal(rows[0].n, 0, 'nada sai do estoque de peça que não controla');
});

test('painel liga o controle e informa as quantidades; o site mostra o que esgotou', async () => {
  const res = await salvarEstoque(idDrip, { controla: true, quantidades: { P: 0, M: 3, G: 1, GG: 0, XGG: 0 } });
  assert.equal(res.status, 200);
  assert.equal(res.corpo.estoque.controla, true);
  assert.equal(res.corpo.estoque.texto, 'P 0 · M 3 · G 1 · GG 0 · XGG 0 (4 peças)');
  assert.ok(res.corpo.pendencias.includes('Esgotado: P, GG, XGG'));
  assert.deepEqual(res.corpo.movimentosEstoque.map((m) => [m.tamanho, m.variacaoTexto, m.motivo, m.quem]).sort(),
    [['G', '+1', 'Ajuste', 'Admin Estoque'], ['M', '+3', 'Ajuste', 'Admin Estoque']]);

  const detalhe = await peca('drip');
  assert.deepEqual(detalhe.tamanhosEsgotados, ['P', 'GG', 'XGG']);
  assert.equal(detalhe.esgotado, false);

  const atividade = (await admin.pedir('GET', '/auditoria')).corpo;
  assert.ok(atividade.some((a) => a.descricao === 'ajustou o estoque de Drip (Preta): passou a controlar, M 0→3, G 0→1'));
  const resumo = (await admin.pedir('GET', '/resumo')).corpo;
  assert.ok(resumo.pendencias.some((p) => p.texto.includes('tamanho esgotado')));
});

test('o pedido retira do estoque; acima do que há, ou tamanho esgotado, é recusado', async () => {
  const ok = await pedir([{ id: 'drip', tamanho: 'M', qtd: 2 }]);
  assert.equal(ok.status, 201);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1);

  const muito = await pedir([{ id: 'drip', tamanho: 'M', qtd: 2 }]);
  assert.equal(muito.status, 409);
  assert.match((await muito.json()).erro, /Drip \(M\): só resta 1 peça/);
  const esgotado = await pedir([{ id: 'drip', tamanho: 'P', qtd: 1 }]);
  assert.equal(esgotado.status, 409);
  assert.match((await esgotado.json()).erro, /Drip \(P\) esgotou/);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1, 'pedido recusado não mexe no estoque');
});

test('dois clientes ao mesmo tempo não levam a mesma última peça', async () => {
  const antes = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  const respostas = await Promise.all([1, 2, 3].map(() => pedir([{ id: 'drip', tamanho: 'G', qtd: 1 }], { chave: randomUUID() })));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal(quantidades(await estoqueDe(idDrip)).G, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n, antes + 1);
});

test('a sacola ajusta a quantidade ao estoque e tira o que esgotou', async () => {
  const res = await fetch(`${srv.base}/api/pedidos/previa`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itens: [{ id: 'drip', tamanho: 'M', qtd: 5 }, { id: 'drip', tamanho: 'G', qtd: 1 }, { id: 'flame', tamanho: 'M', qtd: 1 }] })
  });
  const previa = await res.json();
  assert.deepEqual(previa.itens.map((i) => [i.id, i.tamanho, i.qtd, i.podeAumentar]), [['drip', 'M', 1, false], ['flame', 'M', 1, true]]);
  assert.deepEqual(previa.removidos, [{ id: 'drip', tamanho: 'G', motivo: 'Esgotado' }]);
  assert.deepEqual(previa.avisos, ['Drip (M): só resta 1 peça, a quantidade foi ajustada.']);
});

test('cancelar devolve as peças; reativar retira de novo (e recusa se não houver)', async () => {
  // pedido com a última peça M
  const { codigo } = await (await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).json();
  const id = (await admin.pedir('GET', `/pedidos?busca=${codigo}`)).corpo.pedidos[0].id;
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 0);
  assert.equal((await peca('drip')).esgotado, true, 'todos os tamanhos zerados: selo ESGOTADO');
  assert.equal((await fetch(`${srv.base}/api/produtos`).then((r) => r.json())).produtos.find((p) => p.id === 'drip').esgotado, true);

  assert.equal((await admin.pedir('PUT', `/pedidos/${id}`, { status: 'cancelado' })).status, 200);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1, 'cancelado: a peça volta');
  // mexer em outra coisa do pedido cancelado não devolve duas vezes
  await admin.pedir('PUT', `/pedidos/${id}`, { observacao: 'cliente desistiu' });
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1);

  assert.equal((await admin.pedir('PUT', `/pedidos/${id}`, { status: 'pago' })).status, 200);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 0, 'reativado: a peça sai de novo');

  // cancela, outro cliente leva a peça, e aí não dá para reativar
  await admin.pedir('PUT', `/pedidos/${id}`, { status: 'cancelado' });
  assert.equal((await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).status, 201);
  const reativar = await admin.pedir('PUT', `/pedidos/${id}`, { status: 'novo' });
  assert.equal(reativar.status, 409);
  assert.match(reativar.corpo.erro, /Não dá para reativar: Drip \(M\) tem 0 peças/);
  assert.equal((await consultarPedido(srv.base, codigo).then((r) => r.json())).statusRotulo, 'Cancelado', 'nada mudou');

  const historico = (await admin.pedir('GET', `/produtos/${idDrip}`)).corpo.movimentosEstoque;
  assert.ok(historico.some((m) => m.motivo === 'Pedido cancelado' && m.variacaoTexto === '+1' && m.pedido?.codigo === codigo));
  assert.ok(historico.some((m) => m.motivo === 'Pedido reativado' && m.variacaoTexto === '-1'));
  assert.ok(historico.some((m) => m.motivo === 'Pedido' && m.quem === 'Site'));
});

test('ajuste no painel não apaga um pedido que entrou enquanto a loja editava', async () => {
  const tela = quantidades(await estoqueDe(idDrip)); // o que o admin vê ao abrir a página
  await salvarEstoque(idDrip, { controla: true, quantidades: { ...tela, M: 4 }, anteriores: tela });
  const abertoNaTela = quantidades(await estoqueDe(idDrip));
  assert.equal(abertoNaTela.M, 4);

  // entra um pedido enquanto a tela está aberta
  assert.equal((await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).status, 201);

  const conflito = await salvarEstoque(idDrip, { controla: true, quantidades: { ...abertoNaTela, M: 10 }, anteriores: abertoNaTela });
  assert.equal(conflito.status, 409);
  assert.match(conflito.corpo.erro, /O estoque de M mudou enquanto você editava/);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 3, 'nada foi gravado');
});

test('ajuste valida tamanhos e quantidades; desligar o controle volta a vender sem limite', async () => {
  const negativo = await salvarEstoque(idDrip, { controla: true, quantidades: { M: -1 } });
  assert.equal(negativo.status, 400);
  assert.equal((await salvarEstoque(idDrip, { controla: true, quantidades: { M: 1.5 } })).status, 400);
  const tamanhoErrado = await salvarEstoque(idDrip, { controla: true, quantidades: { XXXG: 2 } });
  assert.equal(tamanhoErrado.status, 400);
  assert.match(tamanhoErrado.corpo.campos.quantidades, /XXXG/);
  assert.equal((await salvarEstoque(idDrip, { controla: true, quantidades: {}, extra: 1 })).status, 400);
  assert.equal((await clienteAdmin(srv.base).pedir('PUT', `/produtos/${idDrip}/estoque`, { controla: false, quantidades: {} })).status, 401);

  const desligado = await salvarEstoque(idDrip, { controla: false, quantidades: {} });
  assert.equal(desligado.status, 200);
  assert.equal(desligado.corpo.estoque.texto, 'Não controlado');
  assert.deepEqual((await peca('drip')).tamanhosEsgotados, []);
  assert.equal((await pedir([{ id: 'drip', tamanho: 'P', qtd: 3 }])).status, 201, 'sem controle, vende sem limite');
});
