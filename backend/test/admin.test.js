import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { criarUsuario } from '../src/servicos/autenticacao.js';
import { clienteAdmin, ORIGEM, prepararBanco, SENHA_TESTE, subirServidor } from './ajuda.js';

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
  for (const caminho of ['/sessao', '/resumo', '/produtos', '/colecoes', '/loja', '/usuarios', '/auditoria']) {
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
