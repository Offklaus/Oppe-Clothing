import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarUsuario } from '../src/servicos/autenticacao.js';
import { clienteAdmin, consultarPedido, fazerPedido, prepararBanco, SENHA_TESTE, subirServidor } from './ajuda.js';

let pool;
let srv;
let admin;
let idDrip;
let idFlame;

const ZERADO = { P: 0, M: 0, G: 0, GG: 0, XGG: 0 };

const peca = async (slug) => (await fetch(`${srv.base}/api/produtos/${slug}`)).json();
const detalheAdmin = async (id) => (await admin.pedir('GET', `/produtos/${id}`)).corpo;
const estoqueDe = async (id) => (await detalheAdmin(id)).estoque;
const quantidades = (estoque) => Object.fromEntries(estoque.tamanhos.map((t) => [t.tamanho, t.quantidade]));
const salvarEstoque = (id, corpo) => admin.pedir('PUT', `/produtos/${id}/estoque`, corpo);
const pedir = (itens, extra) => fazerPedido(srv.base, itens, extra);
const idDoPedido = async (codigo) =>
  (await pool.query('SELECT id FROM pedidos WHERE codigo = $1', [codigo.replace('-', '')])).rows[0].id;
const contar = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;

async function definirEstoque(id, valores) {
  const res = await salvarEstoque(id, { controla: true, quantidades: { ...ZERADO, ...valores } });
  assert.equal(res.status, 200);
  return res.corpo;
}

async function esperarTransacaoTravada() {
  for (let i = 0; i < 100; i++) {
    const n = await contar(`SELECT count(*)::int AS n FROM pg_stat_activity
                            WHERE datname = current_database() AND wait_event_type = 'Lock'`);
    if (n > 0) return;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  throw new Error('o ajuste não chegou a esperar a outra transação');
}

before(async () => {
  pool = await prepararBanco();
  await criarUsuario(pool, { nome: 'Admin Estoque', email: 'estoque@teste.local', senha: SENHA_TESTE });
  srv = await subirServidor(pool);
  admin = clienteAdmin(srv.base);
  await admin.pedir('POST', '/login', { email: 'estoque@teste.local', senha: SENHA_TESTE });
  const { rows } = await pool.query("SELECT slug, id FROM produtos WHERE slug IN ('drip', 'flame')");
  const ids = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  idDrip = ids.drip;
  idFlame = ids.flame;
});

beforeEach(async () => {
  await pool.query('TRUNCATE estoque_movimentos, estoque');
  await pool.query('UPDATE produtos SET controla_estoque = false');
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
  assert.equal(await contar('SELECT count(*)::int AS n FROM estoque_movimentos'), 0, 'nada sai do estoque de peça que não controla');
});

test('painel liga o controle e informa as quantidades; o site mostra o que esgotou', async () => {
  const res = await salvarEstoque(idDrip, { controla: true, quantidades: { P: 0, M: 3, G: 1, GG: 0, XGG: 0 } });
  assert.equal(res.status, 200);
  assert.equal(res.corpo.estoque.controla, true);
  assert.equal(res.corpo.estoque.maximo, 99999);
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

test('o histórico de estoque vem no detalhe da peça, não em toda resposta do painel', async () => {
  await definirEstoque(idDrip, { M: 1 });
  const detalhe = await detalheAdmin(idDrip);
  assert.equal(detalhe.movimentosEstoque.length, 1);

  const campos = ['nome', 'cor', 'descricaoCor', 'colecaoId', 'tag', 'preco', 'frase', 'referencia', 'estampa', 'ordem', 'ativo', 'slug'];
  const editado = await admin.pedir('PUT', `/produtos/${idDrip}`, Object.fromEntries(campos.map((c) => [c, detalhe[c]])));
  assert.equal(editado.status, 200);
  assert.equal(editado.corpo.movimentosEstoque, undefined);
  assert.equal(editado.corpo.estoque.texto, detalhe.estoque.texto);
});

test('o pedido retira do estoque; acima do que há, ou tamanho esgotado, é recusado', async () => {
  await definirEstoque(idDrip, { M: 3, G: 1 });
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
  await definirEstoque(idDrip, { G: 1 });
  const antes = await contar('SELECT count(*)::int AS n FROM pedidos');
  const respostas = await Promise.all([1, 2, 3].map(() => pedir([{ id: 'drip', tamanho: 'G', qtd: 1 }], { chave: randomUUID() })));
  await Promise.all(respostas.map((r) => r.arrayBuffer()));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal(quantidades(await estoqueDe(idDrip)).G, 0);
  assert.equal(await contar('SELECT count(*)::int AS n FROM pedidos'), antes + 1);
});

test('pedidos com várias peças retiram sempre na mesma ordem e não travam um ao outro', async (t) => {
  await definirEstoque(idDrip, { M: 50 });
  await definirEstoque(idFlame, { G: 50 });
  const outro = await subirServidor(pool);
  t.after(outro.fechar);
  const pedirNoOutro = (itens) => fazerPedido(outro.base, itens);
  const ida = [{ id: 'drip', tamanho: 'M', qtd: 1 }, { id: 'flame', tamanho: 'G', qtd: 1 }];
  const volta = [...ida].reverse();
  const rodadas = 10;
  for (let i = 0; i < rodadas; i++) {
    const respostas = await Promise.all([pedirNoOutro(ida), pedirNoOutro(volta)]);
    await Promise.all(respostas.map((r) => r.arrayBuffer()));
    assert.deepEqual(respostas.map((r) => r.status), [201, 201]);
  }
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 50 - 2 * rodadas);
  assert.equal(quantidades(await estoqueDe(idFlame)).G, 50 - 2 * rodadas);

  for (const sacola of [ida, volta]) {
    const { codigo } = await (await pedirNoOutro(sacola)).json();
    const { rows } = await pool.query('SELECT produto_id FROM estoque_movimentos WHERE pedido_id = $1 ORDER BY id', [await idDoPedido(codigo)]);
    assert.deepEqual(rows.map((r) => r.produto_id), [idDrip, idFlame].sort((a, b) => a - b), 'a ordem da sacola não muda a ordem da retirada');
  }
});

test('a sacola ajusta a quantidade ao estoque e tira o que esgotou', async () => {
  await definirEstoque(idDrip, { M: 1 });
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
  await definirEstoque(idDrip, { M: 1 });
  const { codigo } = await (await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).json();
  const id = await idDoPedido(codigo);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 0);
  assert.equal((await peca('drip')).esgotado, true, 'todos os tamanhos zerados: selo ESGOTADO');
  assert.equal((await fetch(`${srv.base}/api/produtos`).then((r) => r.json())).produtos.find((p) => p.id === 'drip').esgotado, true);

  assert.equal((await admin.pedir('PUT', `/pedidos/${id}`, { status: 'cancelado' })).status, 200);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1, 'cancelado: a peça volta');
  await admin.pedir('PUT', `/pedidos/${id}`, { observacao: 'cliente desistiu' });
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 1, 'mexer em outra coisa do pedido cancelado não devolve duas vezes');

  assert.equal((await admin.pedir('PUT', `/pedidos/${id}`, { status: 'pago' })).status, 200);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 0, 'reativado: a peça sai de novo');

  await admin.pedir('PUT', `/pedidos/${id}`, { status: 'cancelado' });
  assert.equal((await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).status, 201);
  const reativar = await admin.pedir('PUT', `/pedidos/${id}`, { status: 'novo' });
  assert.equal(reativar.status, 409);
  assert.match(reativar.corpo.erro, /Não dá para reativar: Drip \(M\) tem 0 peças/);
  assert.equal((await consultarPedido(srv.base, codigo).then((r) => r.json())).statusRotulo, 'Cancelado', 'nada mudou');

  const historico = (await detalheAdmin(idDrip)).movimentosEstoque;
  assert.ok(historico.some((m) => m.motivo === 'Pedido cancelado' && m.variacaoTexto === '+1' && m.pedido?.codigo === codigo));
  assert.ok(historico.some((m) => m.motivo === 'Pedido reativado' && m.variacaoTexto === '-1'));
  assert.ok(historico.some((m) => m.motivo === 'Pedido' && m.quem === 'Site'));
});

test('cancelar um pedido funciona mesmo com o estoque no limite', async () => {
  await definirEstoque(idDrip, { M: 99999 });
  const { codigo } = await (await pedir([{ id: 'drip', tamanho: 'M', qtd: 2 }])).json();
  await definirEstoque(idDrip, { M: 99999 });

  const cancelar = await admin.pedir('PUT', `/pedidos/${await idDoPedido(codigo)}`, { status: 'cancelado' });
  assert.equal(cancelar.status, 200);
  assert.equal(cancelar.corpo.statusRotulo, 'Cancelado');
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 99999);
});

test('ajuste no painel não apaga um pedido que entrou enquanto a loja editava', async () => {
  await definirEstoque(idDrip, { M: 4 });
  const tela = quantidades(await estoqueDe(idDrip));
  assert.equal((await pedir([{ id: 'drip', tamanho: 'M', qtd: 1 }])).status, 201);

  const conflito = await salvarEstoque(idDrip, { controla: true, quantidades: { ...tela, M: 10 }, anteriores: tela });
  assert.equal(conflito.status, 409);
  assert.match(conflito.corpo.erro, /O estoque de M mudou enquanto você editava/);
  assert.equal(quantidades(await estoqueDe(idDrip)).M, 3, 'nada foi gravado');
});

test('ajuste no painel espera a devolução de um tamanho que ainda não tinha estoque', async () => {
  await salvarEstoque(idDrip, { controla: true, quantidades: { M: 2 } });
  const semLinha = "SELECT count(*)::int AS n FROM estoque WHERE produto_id = $1 AND tamanho = 'GG'";
  assert.equal(await contar(semLinha, [idDrip]), 0);
  const tela = quantidades(await estoqueDe(idDrip));

  const outra = await pool.connect();
  try {
    await outra.query('BEGIN');
    await outra.query("INSERT INTO estoque (produto_id, tamanho, quantidade) VALUES ($1, 'GG', 1)", [idDrip]);
    const salvando = salvarEstoque(idDrip, { controla: true, quantidades: { ...tela, GG: 5 }, anteriores: tela });
    await esperarTransacaoTravada();
    await outra.query('COMMIT');
    const res = await salvando;
    assert.equal(res.status, 409);
    assert.match(res.corpo.erro, /O estoque de GG mudou enquanto você editava/);
  } finally {
    outra.release();
  }
  assert.equal(quantidades(await estoqueDe(idDrip)).GG, 1, 'a peça devolvida continua no estoque');
});

test('ajuste valida tamanhos e quantidades; desligar o controle volta a vender sem limite', async () => {
  await definirEstoque(idDrip, { M: 1 });
  const negativo = await salvarEstoque(idDrip, { controla: true, quantidades: { M: -1 } });
  assert.equal(negativo.status, 400);
  assert.equal((await salvarEstoque(idDrip, { controla: true, quantidades: { M: 1.5 } })).status, 400);
  assert.equal((await salvarEstoque(idDrip, { controla: true, quantidades: { M: 100000 } })).status, 400);
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

test('o varal e a coleção em destaque abrem numa peça à venda; o painel avisa', async (t) => {
  const { rows: [antes] } = await pool.query('SELECT destaque_produto_id, colecao_destaque_id FROM configuracoes_loja');
  t.after(() => pool.query('UPDATE configuracoes_loja SET destaque_produto_id = $1, colecao_destaque_id = $2',
    [antes.destaque_produto_id, antes.colecao_destaque_id]));
  await pool.query(`UPDATE configuracoes_loja SET destaque_produto_id = $1,
                    colecao_destaque_id = (SELECT colecao_id FROM produtos WHERE id = $1)`, [idDrip]);
  const loja = () => fetch(`${srv.base}/api/loja`).then((r) => r.json());
  assert.equal((await loja()).destaqueId, 'drip');

  await definirEstoque(idDrip, {});
  const depois = await loja();
  assert.ok(depois.destaqueId && depois.destaqueId !== 'drip', 'o varal abre numa peça à venda');
  const esgotadas = depois.colecaoDestaque.produtos.map((p) => p.esgotado);
  assert.deepEqual(esgotadas, [...esgotadas].sort((a, b) => a - b), 'peças à venda primeiro');
  const drip = depois.colecaoDestaque.produtos.find((p) => p.id === 'drip');
  if (drip) assert.equal(drip.esgotado, true);

  const resumo = (await admin.pedir('GET', '/resumo')).corpo;
  assert.ok(resumo.pendencias.some((p) => p.texto.startsWith('A peça em destaque (Drip) está esgotada') && p.link === '/admin/loja'));
});
