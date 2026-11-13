import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, montarConfig } from '../src/config.js';
import { opcoesCookie } from '../src/seguranca/sessao.js';
import { criarUsuario } from '../src/servicos/autenticacao.js';
import { clienteAdmin, consultarPedido, fazerPedido, ORIGEM, prepararBanco, SENHA_TESTE, subirServidor } from './ajuda.js';

const EMAIL = 'admin@teste.local';
let pool;
let srv;
let admin;

const imagemPng = () => sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
function formularioComArquivo(conteudo, tipo, lado = 'Costas') {
  const form = new FormData();
  form.append('lado', lado);
  form.append('imagem', new Blob([conteudo], { type: tipo }), 'qualquer-nome.png');
  return form;
}

before(async () => {
  pool = await prepararBanco();
  await criarUsuario(pool, { nome: 'Admin Teste', email: EMAIL, senha: SENHA_TESTE });
  srv = await subirServidor(pool);
  admin = clienteAdmin(srv.base);
});
after(async () => {
  await srv.fechar();
  await pool.end();
});

test('a senha fica guardada só como hash Argon2id', async () => {
  const { rows: [u] } = await pool.query('SELECT senha_hash FROM usuarios_admin WHERE email = $1', [EMAIL]);
  assert.match(u.senha_hash, /^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
  assert.ok(!u.senha_hash.includes(SENHA_TESTE));
});

test('o painel exige login', async () => {
  const anonimo = clienteAdmin(srv.base);
  for (const caminho of ['/sessao', '/resumo', '/produtos', '/colecoes', '/loja', '/usuarios', '/auditoria', '/pedidos', '/pedidos/1']) {
    assert.equal((await anonimo.pedir('GET', caminho)).status, 401, caminho);
  }
  assert.equal((await anonimo.pedir('POST', '/produtos', { nome: 'X' })).status, 401);
});

test('senha errada e e-mail inexistente recebem a mesma resposta', async () => {
  const c = clienteAdmin(srv.base);
  const errada = await c.pedir('POST', '/login', { email: EMAIL, senha: 'senha-errada-123' });
  const inexistente = await c.pedir('POST', '/login', { email: 'ninguem@teste.local', senha: 'senha-errada-123' });
  assert.equal(errada.status, 401);
  assert.equal(inexistente.status, 401);
  assert.equal(errada.corpo.erro, inexistente.corpo.erro);
  assert.equal(errada.setCookie, null);
});

test('proteção CSRF: sem o cabeçalho do painel, sem origem ou de outra origem, recusa', async () => {
  const tentar = (headers) => fetch(`${srv.base}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: EMAIL, senha: SENHA_TESTE })
  });
  assert.equal((await tentar({ origin: ORIGEM })).status, 403);
  assert.equal((await tentar({ origin: 'https://site-malicioso.exemplo', 'x-oppe-admin': '1' })).status, 403);
  assert.equal((await tentar({ 'x-oppe-admin': '1' })).status, 403);
});

test('login cria sessão com cookie protegido e guarda só o hash do token', async () => {
  const r = await admin.pedir('POST', '/login', { email: EMAIL, senha: SENHA_TESTE });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Strict/i);
  assert.match(r.setCookie, /Path=\/api/);
  assert.equal(r.corpo.usuario.senha_hash, undefined);

  const token = admin.cookie.split('=')[1];
  const { rows } = await pool.query('SELECT encode(token_hash, \'hex\') AS h FROM sessoes_admin');
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((s) => !s.h.includes(Buffer.from(token).toString('hex'))));
  assert.equal((await admin.pedir('GET', '/sessao')).corpo.usuario.email, EMAIL);
});

test('bloqueia a conta depois de 5 senhas erradas, mesmo que a sexta esteja certa', async () => {
  await criarUsuario(pool, { nome: 'Outro Admin', email: 'bloqueio@teste.local', senha: SENHA_TESTE });
  const c = clienteAdmin(srv.base);
  for (let i = 0; i < 5; i++) {
    assert.equal((await c.pedir('POST', '/login', { email: 'bloqueio@teste.local', senha: 'errada-errada-1' })).status, 401);
  }
  assert.equal((await c.pedir('POST', '/login', { email: 'bloqueio@teste.local', senha: SENHA_TESTE })).status, 401);
  const { rows: [u] } = await pool.query("SELECT bloqueado_ate > now() AS bloqueado FROM usuarios_admin WHERE email = 'bloqueio@teste.local'");
  assert.equal(u.bloqueado, true);
});

test('cadastra coleção e peça; sem foto a peça não aparece; a foto é reprocessada', async () => {
  const col = await admin.pedir('POST', '/colecoes', { nome: 'Drop Teste', chamada: 'DROP 02 ✦ TESTE' });
  assert.equal(col.status, 201);
  assert.equal(col.corpo.slug, 'drop-teste');

  const p = await admin.pedir('POST', '/produtos', { nome: 'Nova Peça', cor: 'Preta', colecaoId: col.corpo.id, preco: '129,90' });
  assert.equal(p.status, 201);
  assert.equal(p.corpo.slug, 'nova-peca');
  assert.equal(p.corpo.preco, '129,90');
  assert.equal(p.corpo.visivelNoSite, false);
  assert.ok(p.corpo.pendencias.includes('Sem foto principal'));
  assert.equal((await (await fetch(`${srv.base}/api/produtos?colecao=drop-teste`)).json()).produtos.length, 0);

  const foto = await admin.pedir('PUT', `/produtos/${p.corpo.id}/imagens/0`, undefined, {
    formulario: formularioComArquivo(await imagemPng(), 'image/png')
  });
  assert.equal(foto.status, 200);
  const url = foto.corpo.imagens[0].url;
  assert.match(url, /^\/images\/produtos\/[0-9a-f-]{36}\.webp$/);
  const arquivo = path.join(config.pastaImagens, url.replace('/images/', ''));
  const meta = await sharp(await readFile(arquivo)).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1000, 1000]);

  const site = await (await fetch(`${srv.base}/api/produtos?colecao=drop-teste`)).json();
  assert.equal(site.produtos.length, 1);
  assert.match(site.produtos[0].precoTexto, /R\$\s129,90/);

  assert.equal((await admin.pedir('DELETE', `/produtos/${p.corpo.id}`)).status, 204);
  assert.equal(existsSync(arquivo), false, 'a foto enviada é apagada junto com a peça');
  assert.equal((await admin.pedir('DELETE', `/colecoes/${col.corpo.id}`)).status, 204);
});

test('recusa arquivo que não é imagem e foto do verso antes da principal', async () => {
  const p = await admin.pedir('POST', '/produtos', { nome: 'Sem Foto', cor: 'Cru', colecaoId: 1 });
  const falso = await admin.pedir('PUT', `/produtos/${p.corpo.id}/imagens/0`, undefined, {
    formulario: formularioComArquivo(Buffer.from('<?php echo 1; ?>'), 'image/png')
  });
  assert.equal(falso.status, 415);
  const verso = await admin.pedir('PUT', `/produtos/${p.corpo.id}/imagens/1`, undefined, {
    formulario: formularioComArquivo(await imagemPng(), 'image/png', 'Frente')
  });
  assert.equal(verso.status, 400);
  await admin.pedir('DELETE', `/produtos/${p.corpo.id}`);
});

test('valida os campos e devolve a mensagem de cada um', async () => {
  const vazio = await admin.pedir('POST', '/produtos', { nome: '', cor: 'Preta', colecaoId: 1 });
  assert.equal(vazio.status, 400);
  assert.ok(vazio.corpo.campos.nome);
  const preco = await admin.pedir('POST', '/produtos', { nome: 'X', cor: 'Y', colecaoId: 1, preco: 'abc' });
  assert.equal(preco.status, 400);
  assert.ok(preco.corpo.campos.preco);
  const campoExtra = await admin.pedir('POST', '/colecoes', { nome: 'Z', admin: true });
  assert.equal(campoExtra.status, 400);
  const colecaoInexistente = await admin.pedir('POST', '/produtos', { nome: 'X', cor: 'Y', colecaoId: 9999 });
  assert.equal(colecaoInexistente.status, 400);
  assert.ok(colecaoInexistente.corpo.campos.colecaoId);
});

test('não exclui coleção que ainda tem peças', async () => {
  const r = await admin.pedir('DELETE', '/colecoes/1');
  assert.equal(r.status, 409);
  assert.match(r.corpo.erro, /Mova ou exclua as peças/);
});

test('configurações da loja normalizam WhatsApp, Instagram e preço, e o site reflete', async () => {
  const { opcoes, ...atual } = (await admin.pedir('GET', '/loja')).corpo;
  assert.ok(opcoes.produtos.length > 0);
  const r = await admin.pedir('PUT', '/loja', {
    ...atual, whatsapp: '(11) 98765-4321', instagram: 'https://www.instagram.com/OppeClothing/', precoPadrao: '99,90'
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.whatsapp, '(11) 98765-4321');
  assert.equal(r.corpo.instagram, '@oppeclothing');
  assert.equal(r.corpo.precoPadrao, '99,90');

  const loja = await (await fetch(`${srv.base}/api/loja`)).json();
  assert.equal(loja.whatsappExibicao, '(11) 98765-4321');
  assert.match((await (await fetch(`${srv.base}/api/produtos/drip`)).json()).precoTexto, /99,90/);

  const invalido = await admin.pedir('PUT', '/loja', { ...atual, whatsapp: '123' });
  assert.equal(invalido.status, 400);
  assert.ok(invalido.corpo.campos.whatsapp);

  assert.equal((await admin.pedir('PUT', '/loja', atual)).status, 200);
});

test('admins: ninguém se desativa; troca de senha exige a atual e derruba as outras sessões', async () => {
  const eu = (await admin.pedir('GET', '/usuarios')).corpo.find((u) => u.voce);
  assert.equal((await admin.pedir('PUT', `/usuarios/${eu.id}`, { ativo: false })).status, 400);

  const outroAparelho = clienteAdmin(srv.base);
  assert.equal((await outroAparelho.pedir('POST', '/login', { email: EMAIL, senha: SENHA_TESTE })).status, 200);

  const nova = 'Uma-Nova-Senha-Segura-9';
  const errada = await admin.pedir('PUT', '/conta/senha', { senhaAtual: 'errada', novaSenha: nova });
  assert.equal(errada.status, 400);
  assert.ok(errada.corpo.campos.senhaAtual);
  const fraca = await admin.pedir('PUT', '/conta/senha', { senhaAtual: SENHA_TESTE, novaSenha: '123' });
  assert.ok(fraca.corpo.campos.novaSenha);

  assert.equal((await admin.pedir('PUT', '/conta/senha', { senhaAtual: SENHA_TESTE, novaSenha: nova })).status, 204);
  assert.equal((await outroAparelho.pedir('GET', '/sessao')).status, 401, 'a sessão do outro aparelho caiu');
  assert.equal((await admin.pedir('GET', '/sessao')).status, 200, 'a sessão atual continua');
  assert.equal((await admin.pedir('PUT', '/conta/senha', { senhaAtual: nova, novaSenha: SENHA_TESTE })).status, 204);
});

test('novo admin: senha forte, e-mail único e resposta sem hash', async () => {
  const fraca = await admin.pedir('POST', '/usuarios', { nome: 'Novo', email: 'novo@teste.local', senha: '12345678' });
  assert.equal(fraca.status, 400);
  assert.ok(fraca.corpo.campos.senha);
  const ok = await admin.pedir('POST', '/usuarios', { nome: 'Novo', email: 'Novo@Teste.local', senha: 'Outra-Senha-Bem-Longa-1' });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.email, 'novo@teste.local');
  assert.equal(ok.corpo.senha_hash, undefined);
  assert.equal((await admin.pedir('POST', '/usuarios', { nome: 'Novo', email: 'novo@teste.local', senha: 'Outra-Senha-Bem-Longa-1' })).status, 409);
});

test('configuração: sem TRUST_PROXY não confia em X-Forwarded-For; cookie Secure quando o site é https', () => {
  const producao = montarConfig({ NODE_ENV: 'production', SITE_URL: 'https://oppe.exemplo' });
  assert.equal(producao.trustProxy, false);
  assert.equal(producao.cookieSeguro, true);
  assert.equal(montarConfig({ SITE_URL: 'https://oppe.exemplo' }).cookieSeguro, true, 'https mesmo sem NODE_ENV');
  assert.equal(montarConfig({ SITE_URL: 'http://localhost:5173' }).cookieSeguro, false);
  assert.equal(montarConfig({ TRUST_PROXY: '1' }).trustProxy, 1);
  assert.equal(montarConfig({ TRUST_PROXY: 'loopback' }).trustProxy, 'loopback');
  // IP do visitante: no Render vem do CF-Connecting-IP (gravado pela Cloudflare); fora dele, da conexão
  assert.equal(montarConfig({ RENDER: 'true' }).cabecalhoIp, 'cf-connecting-ip');
  assert.equal(montarConfig({}).cabecalhoIp, '');
  assert.equal(montarConfig({ RENDER: 'true', CLIENT_IP_HEADER: 'nenhum' }).cabecalhoIp, '');
  assert.equal(montarConfig({ CLIENT_IP_HEADER: 'True-Client-IP' }).cabecalhoIp, 'true-client-ip');
  assert.throws(() => montarConfig({ CLIENT_IP_HEADER: 'x y' }), /CLIENT_IP_HEADER/);
  assert.equal(opcoesCookie(true).secure, true);
});

test('SITE_URL e ORIGENS_EXTRAS precisam ser endereços completos', () => {
  const ok = montarConfig({ SITE_URL: 'https://OppeClothing.com/', ORIGENS_EXTRAS: 'https://www.oppeclothing.com, https://oppe.onrender.com' });
  assert.equal(ok.siteUrl, 'https://oppeclothing.com');
  assert.ok(ok.origensPermitidas.includes('https://www.oppeclothing.com'));
  assert.ok(ok.origensPermitidas.includes('https://oppe.onrender.com'));
  for (const errado of ['oppeclothing.com', 'www.oppeclothing.com', 'https://oppeclothing.com/loja', 'ftp://oppeclothing.com']) {
    assert.throws(() => montarConfig({ SITE_URL: errado }), /SITE_URL deve ser o endereço completo/, errado);
  }
  assert.throws(() => montarConfig({ SITE_URL: 'https://oppeclothing.com', ORIGENS_EXTRAS: 'oppe.onrender.com' }), /ORIGENS_EXTRAS/);
});

test('inventar o IP no X-Forwarded-For não escapa do limite de logins', async () => {
  const servidor = await subirServidor(pool, { limiteLogin: 3, config: { trustProxy: montarConfig({ NODE_ENV: 'production' }).trustProxy } });
  try {
    const respostas = [];
    for (let i = 1; i <= 4; i++) {
      const r = await fetch(`${servidor.base}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGEM, 'x-oppe-admin': '1', 'x-forwarded-for': `203.0.113.${i}` },
        body: JSON.stringify({ email: 'ninguem@teste.local', senha: 'qualquer-coisa' })
      });
      respostas.push(r.status);
    }
    assert.deepEqual(respostas, [401, 401, 401, 429]);
  } finally {
    await servidor.fechar();
  }
});

test('com o site em https o cookie da sessão sai com Secure', async () => {
  const servidor = await subirServidor(pool, { config: { cookieSeguro: true } });
  try {
    const r = await clienteAdmin(servidor.base).pedir('POST', '/login', { email: EMAIL, senha: SENHA_TESTE });
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /;\s*Secure/i);
  } finally {
    await servidor.fechar();
  }
});

test('login que falha não grava no registro um texto que não é e-mail (pode ser uma senha)', async () => {
  const c = clienteAdmin(srv.base);
  assert.equal((await c.pedir('POST', '/login', { email: 'minha senha secreta 123', senha: 'x' })).status, 401);
  const lista = (await admin.pedir('GET', '/auditoria')).corpo;
  assert.ok(!JSON.stringify(lista).includes('minha senha secreta'));
  assert.ok(lista.some((a) => a.descricao === 'tentativa de login sem sucesso (e-mail em formato inválido)'));
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM auditoria WHERE detalhes::text LIKE '%minha senha secreta%'");
  assert.equal(rows[0].n, 0);
});

test('id fora do intervalo do banco responde 400, não erro interno', async () => {
  assert.equal((await admin.pedir('GET', '/produtos/99999999999')).status, 400);
  assert.equal((await admin.pedir('DELETE', '/colecoes/99999999999')).status, 400);
  assert.equal((await admin.pedir('GET', '/produtos/1.5')).status, 400);
});

test('pedidos: o painel lista, filtra, mostra os dados do cliente e atualiza o andamento', async () => {
  const pedir = async (itens) => (await (await fazerPedido(srv.base, itens)).json()).codigo;
  const codigo = await pedir([{ id: 'drip', tamanho: 'M', qtd: 2 }, { id: 'flame', tamanho: 'G', qtd: 1 }]);
  await pedir([{ id: 'the-key', tamanho: 'P', qtd: 1 }]);

  assert.equal((await clienteAdmin(srv.base).pedir('GET', '/pedidos')).status, 401);

  const lista = (await admin.pedir('GET', '/pedidos')).corpo;
  assert.equal(lista.pedidos.length, 2);
  assert.deepEqual(lista.filtros.find((f) => f.valor === 'novo'), { valor: 'novo', rotulo: 'Aguardando pagamento', total: 2 });
  const feito = lista.pedidos.find((p) => p.codigo === codigo);
  assert.equal(feito.statusRotulo, 'Aguardando pagamento');
  assert.equal(feito.cliente, 'Maria Teste');
  assert.match(feito.resumo, /^2x Drip \(M\) \+ 1 outra peça$/);
  assert.equal(feito.rotuloPecas, '3 peças');

  const resumo = (await admin.pedir('GET', '/resumo')).corpo;
  assert.equal(resumo.numeros.pedidosNovos, 2);
  assert.ok(resumo.pendencias.some((p) => p.link === '/admin/pedidos?status=novo'));

  const buscar = async (termo) => (await admin.pedir('GET', `/pedidos?busca=${encodeURIComponent(termo)}`)).corpo.pedidos.length;
  assert.equal(await buscar(codigo.toLowerCase()), 1, 'código com hífen e minúsculo');
  assert.equal(await buscar(codigo.replace('-', '')), 1, 'código sem hífen');
  assert.equal(await buscar('maria@exemplo'), 2, 'e-mail');
  assert.equal(await buscar('99999-0000'), 2, 'telefone');
  assert.equal(await buscar('%'), 0, '% é texto, não curinga');
  assert.equal((await admin.pedir('GET', '/pedidos?status=qualquer')).corpo.pedidos.length, 2, 'filtro estranho é ignorado');

  const detalhe = (await admin.pedir('GET', `/pedidos/${feito.id}`)).corpo;
  assert.equal(detalhe.itens.length, 2);
  assert.equal(detalhe.itens[0].linkPeca, '/produto/drip');
  assert.match(detalhe.mensagem, new RegExp(`#${codigo}`));
  assert.deepEqual(detalhe.cliente, {
    nome: 'Maria Teste', email: 'maria@exemplo.com', telefoneTexto: '(35) 99999-0000',
    linkWhatsapp: 'https://wa.me/5535999990000',
    endereco: ['Rua das Flores, 100 — Apto 2', 'Centro', 'Itajubá/MG', 'CEP 37500-000']
  });
  assert.deepEqual(detalhe.opcoesStatus.map((o) => o.valor), ['novo', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado']);
  assert.equal(detalhe.historico.length, 1);

  // andamento: pago → em preparação → enviado (com rastreio); o cliente vê cada etapa
  const mudar = (corpo) => admin.pedir('PUT', `/pedidos/${feito.id}`, corpo);
  const pago = await mudar({ status: 'pago', observacao: '  Pix recebido  ' });
  assert.equal(pago.status, 200);
  assert.equal(pago.corpo.statusRotulo, 'Pagamento confirmado');
  assert.equal(pago.corpo.observacao, 'Pix recebido');
  const soNota = await mudar({ observacao: 'Enviar na sexta' });
  assert.equal(soNota.corpo.statusRotulo, 'Pagamento confirmado', 'só o que foi enviado muda');
  assert.equal(soNota.corpo.historico.length, 2, 'observação não entra no histórico');
  await mudar({ status: 'em_preparacao' });
  const enviado = await mudar({ status: 'enviado', rastreio: 'AA123456789BR' });
  assert.deepEqual(enviado.corpo.historico.map((h) => h.statusRotulo),
    ['Enviado', 'Em preparação', 'Pagamento confirmado', 'Aguardando pagamento']);

  const andamento = await (await consultarPedido(srv.base, codigo)).json();
  assert.deepEqual(andamento.etapas.map((e) => [e.rotulo, e.estado, e.texto]), [
    ['Pagamento', 'feita', 'Pagamento confirmado'],
    ['Preparação', 'feita', 'Pedido pronto'],
    ['Envio', 'atual', 'A caminho'],
    ['Entrega', 'pendente', '']
  ]);
  assert.ok(andamento.etapas.slice(0, 3).every((e) => e.data));
  assert.equal(andamento.rastreio, 'AA123456789BR');

  const dataDoEnvio = andamento.etapas[2].data;
  await mudar({ status: 'entregue' });
  const entregue = await (await consultarPedido(srv.base, codigo)).json();
  assert.deepEqual(entregue.etapas.map((e) => e.estado), ['feita', 'feita', 'feita', 'feita']);
  assert.equal(entregue.etapas[2].texto, 'Enviado');
  assert.equal(entregue.etapas[2].data, dataDoEnvio, 'Envio mostra a data do envio, não a da entrega');
  assert.ok(entregue.etapas[3].data);

  await mudar({ status: 'cancelado' });
  const cancelado = await (await consultarPedido(srv.base, codigo)).json();
  assert.equal(cancelado.cancelado, true);
  assert.deepEqual(cancelado.etapas, []);
  assert.equal(cancelado.rastreio, null);
  assert.equal((await admin.pedir('GET', '/pedidos?status=cancelado')).corpo.pedidos.length, 1);

  assert.equal((await mudar({ status: 'roubado' })).status, 400);
  assert.equal((await mudar({ clienteNome: 'X' })).status, 400, 'campo desconhecido é recusado');
  assert.equal((await mudar({})).status, 400);
  assert.equal((await mudar({ observacao: 'x'.repeat(1001) })).status, 400);
  assert.equal((await admin.pedir('PUT', '/pedidos/999999', { status: 'pago' })).status, 404);
  const semCabecalho = await fetch(`${srv.base}/api/admin/pedidos/${feito.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin: ORIGEM, cookie: admin.cookie }, body: JSON.stringify({ status: 'novo' })
  });
  assert.equal(semCabecalho.status, 403);

  const atividade = (await admin.pedir('GET', '/auditoria')).corpo;
  assert.ok(atividade.some((a) => a.descricao === `atualizou o pedido #${codigo} (Pagamento confirmado)`));
  assert.ok(atividade.some((a) => a.descricao === `atualizou o pedido #${codigo} (Enviado)`));
  assert.ok(atividade.some((a) => a.descricao === `atualizou o pedido #${codigo}`));
});

test('pedidos: o painel corrige os dados de entrega, com as mesmas regras do site', async () => {
  const { codigo } = await (await fazerPedido(srv.base, [{ id: 'drip', tamanho: 'M', qtd: 1 }])).json();
  const id = (await admin.pedir('GET', `/pedidos?busca=${encodeURIComponent(codigo)}`)).corpo.pedidos[0].id;
  const antes = (await admin.pedir('GET', `/pedidos/${id}`)).corpo;
  assert.deepEqual(antes.clienteEdicao, {
    nome: 'Maria Teste', email: 'maria@exemplo.com', telefone: '(35) 99999-0000', cep: '37500-000',
    logradouro: 'Rua das Flores', numero: '100', complemento: 'Apto 2', bairro: 'Centro', cidade: 'Itajubá', uf: 'MG'
  });
  assert.equal(antes.ufs.length, 27);

  const ruim = await admin.pedir('PUT', `/pedidos/${id}`, { cliente: { ...antes.clienteEdicao, cep: '1', uf: 'ZZ' } });
  assert.equal(ruim.status, 400);
  assert.deepEqual(Object.keys(ruim.corpo.campos).sort(), ['cliente.cep', 'cliente.uf']);
  assert.equal((await admin.pedir('PUT', `/pedidos/${id}`, { cliente: { nome: 'Só o nome' } })).status, 400, 'os dados vão completos');

  const ok = await admin.pedir('PUT', `/pedidos/${id}`, { cliente: { ...antes.clienteEdicao, numero: '200', complemento: '' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.corpo.cliente.endereco, ['Rua das Flores, 200', 'Centro', 'Itajubá/MG', 'CEP 37500-000']);
  assert.equal(ok.corpo.statusRotulo, 'Aguardando pagamento');
  assert.equal(ok.corpo.historico.length, 1, 'corrigir o endereço não muda a situação');

  const atividade = (await admin.pedir('GET', '/auditoria')).corpo;
  assert.ok(atividade.some((a) => a.descricao === `atualizou o pedido #${codigo} (dados de entrega)`));
});

test('no Render, cada visitante tem o próprio limite (IP do CF-Connecting-IP), e o X-Forwarded-For não engana', async () => {
  const servidor = await subirServidor(pool, { limiteLogin: 2, config: { cabecalhoIp: 'cf-connecting-ip' } });
  try {
    const tentar = (ip, extra = {}) => fetch(`${servidor.base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGEM, 'x-oppe-admin': '1', 'cf-connecting-ip': ip, ...extra },
      body: JSON.stringify({ email: 'ninguem@teste.local', senha: 'qualquer-coisa' })
    });
    const mesmoVisitante = [
      await tentar('203.0.113.10'),
      await tentar('203.0.113.10'),
      await tentar('203.0.113.10', { 'x-forwarded-for': '198.51.100.7' })
    ].map((r) => r.status);
    assert.deepEqual(mesmoVisitante, [401, 401, 429], 'o mesmo visitante é barrado, mesmo inventando X-Forwarded-For');
    assert.equal((await tentar('203.0.113.20')).status, 401, 'outro visitante não é afetado');

    const { rows: [ultimo] } = await pool.query("SELECT host(ip) AS ip FROM auditoria WHERE acao = 'login_falhou' ORDER BY id DESC LIMIT 1");
    assert.equal(ultimo.ip, '203.0.113.20', 'a atividade registra o IP real do visitante');
  } finally {
    await servidor.fechar();
  }
});

test('a atividade registra as ações do painel', async () => {
  const lista = (await admin.pedir('GET', '/auditoria')).corpo;
  assert.ok(lista.some((a) => a.descricao === 'cadastrou a peça Nova Peça (Preta)'));
  assert.ok(lista.some((a) => a.descricao.startsWith('tentativa de login sem sucesso')));
  assert.ok(lista.some((a) => a.descricao === 'alterou as configurações da loja'));
});

test('logout encerra a sessão no servidor', async () => {
  const cookieAntigo = admin.cookie;
  assert.equal((await admin.pedir('POST', '/logout')).status, 204);
  const reaproveitado = await fetch(`${srv.base}/api/admin/sessao`, { headers: { cookie: cookieAntigo } });
  assert.equal(reaproveitado.status, 401);
});
