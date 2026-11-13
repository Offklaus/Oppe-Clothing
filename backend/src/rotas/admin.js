// Rotas do painel. Tudo, exceto o login, exige sessão válida.
// Toda alteração passa por: proteção CSRF → sessão → validação (zod) → regra no serviço → auditoria.
import { Router } from 'express';
import multer from 'multer';
import { validar } from '../erros.js';
import * as esquemas from '../validacao/esquemas.js';
import { carregarAdmin, exigirAdmin, limitador, protegerCsrf, semCache } from '../seguranca/middlewares.js';
import { COOKIE_SESSAO, criarSessao, encerrarSessao, opcoesCookie } from '../seguranca/sessao.js';
import * as auth from '../servicos/autenticacao.js';
import * as catalogo from '../servicos/catalogo.js';
import * as imagens from '../servicos/imagens.js';
import * as pedidos from '../servicos/pedido.js';
import * as repoAuditoria from '../repos/auditoria.js';

const enviarImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, parts: 4 }
}).single('imagem');

const DESCRICOES = {
  login: () => 'entrou no painel',
  login_falhou: (d) => `tentativa de login sem sucesso${d.email ? ` (${d.email})` : d.formatoInvalido ? ' (e-mail em formato inválido)' : ''}`,
  logout: () => 'saiu do painel',
  produto_criado: (d) => `cadastrou a peça ${d.nome} (${d.cor})`,
  produto_editado: (d) => `editou a peça ${d.nome} (${d.cor})`,
  produto_removido: (d) => `excluiu a peça ${d.nome} (${d.cor})`,
  foto_enviada: (d) => `enviou a foto "${d.lado}" da peça ${d.nome}`,
  foto_editada: (d) => `marcou a foto da peça ${d.nome} como "${d.lado}"`,
  foto_removida: (d) => `removeu uma foto da peça ${d.nome}`,
  colecao_criada: (d) => `criou a coleção ${d.nome}`,
  colecao_editada: (d) => `editou a coleção ${d.nome}`,
  colecao_removida: (d) => `excluiu a coleção ${d.nome}`,
  loja_editada: () => 'alterou as configurações da loja',
  usuario_criado: (d) => `cadastrou o admin ${d.email}`,
  usuario_editado: (d) => `alterou o admin ${d.email}`,
  senha_redefinida: (d) => `redefiniu a senha de ${d.email}`,
  senha_trocada: () => 'trocou a própria senha',
  pedido_editado: (d) => {
    const partes = [d.status, d.entrega && 'dados de entrega'].filter(Boolean);
    return `atualizou o pedido #${d.codigo}${partes.length ? ` (${partes.join(', ')})` : ''}`;
  }
};

export function rotasAdmin({ pool, config, limiteLogin = 10 }) {
  const r = Router();
  r.use(semCache, protegerCsrf(config.origensPermitidas), carregarAdmin(pool));

  const registrar = (req, acao, entidade, entidadeId = null, detalhes = null, usuario = req.admin) =>
    repoAuditoria.registrar(pool, { usuario, acao, entidade, entidadeId, detalhes, ip: req.ip });
  const idNumerico = (req) => validar(esquemas.idNumerico, req.params.id);
  const idUsuario = (req) => validar(esquemas.idUuid, req.params.id);

  const limiteLogin15min = limitador({ janelaMs: 15 * 60_000, limite: limiteLogin, mensagem: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
  const limiteSenha = limitador({ janelaMs: 15 * 60_000, limite: Math.max(limiteLogin, 10), mensagem: 'Muitas tentativas. Aguarde 15 minutos.' });

  // ---------- sessão ----------
  r.post('/login', limiteLogin15min, async (req, res) => {
    const dados = validar(esquemas.esquemaLogin, req.body);
    let usuario;
    try {
      usuario = await auth.autenticar(pool, dados);
    } catch (erro) {
      // só grava o texto se tiver formato de e-mail: quem digita a senha no campo errado não a deixa no registro
      const detalhe = esquemas.pareceEmail(dados.email) ? { email: dados.email } : { formatoInvalido: true };
      if (erro.status === 401) await registrar(req, 'login_falhou', 'sessao', null, detalhe, null);
      throw erro;
    }
    await encerrarSessao(pool, req.cookies?.[COOKIE_SESSAO]); // nova sessão a cada login
    const token = await criarSessao(pool, usuario.id, { ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(COOKIE_SESSAO, token, opcoesCookie(config.cookieSeguro));
    await registrar(req, 'login', 'sessao', null, null, usuario);
    res.json({ usuario });
  });

  r.post('/logout', async (req, res) => {
    await encerrarSessao(pool, req.cookies?.[COOKIE_SESSAO]);
    if (req.admin) await registrar(req, 'logout', 'sessao');
    const { maxAge, ...semValidade } = opcoesCookie(config.cookieSeguro);
    res.clearCookie(COOKIE_SESSAO, semValidade);
    res.status(204).end();
  });

  r.get('/sessao', exigirAdmin, (req, res) => {
    res.json({ usuario: { id: req.admin.id, nome: req.admin.nome, email: req.admin.email } });
  });

  // ---------- daqui para baixo, só logado ----------
  r.use(exigirAdmin);

  r.get('/resumo', async (req, res) => res.json(await catalogo.resumoAdmin(pool, config)));

  // ---------- peças ----------
  r.get('/produtos', async (req, res) => res.json(await catalogo.listarProdutosAdmin(pool)));

  r.get('/produtos/:id', async (req, res) => res.json(await catalogo.produtoAdmin(pool, idNumerico(req))));

  r.post('/produtos', async (req, res) => {
    const p = await catalogo.criarProduto(pool, validar(esquemas.esquemaProduto, req.body));
    await registrar(req, 'produto_criado', 'produto', p.id, { nome: p.nome, cor: p.cor });
    res.status(201).json(p);
  });

  r.put('/produtos/:id', async (req, res) => {
    const p = await catalogo.atualizarProduto(pool, idNumerico(req), validar(esquemas.esquemaProduto, req.body));
    await registrar(req, 'produto_editado', 'produto', p.id, { nome: p.nome, cor: p.cor });
    res.json(p);
  });

  r.delete('/produtos/:id', async (req, res) => {
    const id = idNumerico(req);
    const removido = await catalogo.removerProduto(pool, id);
    for (const arquivo of removido.arquivos) await imagens.apagarSeSemUso(pool, arquivo);
    await registrar(req, 'produto_removido', 'produto', id, { nome: removido.nome, cor: removido.cor });
    res.status(204).end();
  });

  // envia (multipart, campo "imagem") ou só troca o lado da foto
  r.put('/produtos/:id/imagens/:posicao', enviarImagem, async (req, res) => {
    const id = idNumerico(req);
    const posicao = validar(esquemas.posicaoImagem, req.params.posicao);
    const { lado } = validar(esquemas.esquemaLado, { lado: req.body?.lado });
    if (req.file) await imagens.salvarFoto(pool, id, posicao, req.file.buffer, lado);
    else await imagens.alterarLado(pool, id, posicao, lado);
    const p = await catalogo.produtoAdmin(pool, id);
    await registrar(req, req.file ? 'foto_enviada' : 'foto_editada', 'produto', id, { nome: p.nome, posicao, lado });
    res.json(p);
  });

  r.delete('/produtos/:id/imagens/:posicao', async (req, res) => {
    const id = idNumerico(req);
    await imagens.removerFoto(pool, id, validar(esquemas.posicaoImagem, req.params.posicao));
    const p = await catalogo.produtoAdmin(pool, id);
    await registrar(req, 'foto_removida', 'produto', id, { nome: p.nome });
    res.json(p);
  });

  // ---------- coleções ----------
  r.get('/colecoes', async (req, res) => res.json(await catalogo.listarColecoesAdmin(pool)));

  r.post('/colecoes', async (req, res) => {
    const c = await catalogo.criarColecao(pool, validar(esquemas.esquemaColecao, req.body));
    await registrar(req, 'colecao_criada', 'colecao', c.id, { nome: c.nome });
    res.status(201).json(c);
  });

  r.put('/colecoes/:id', async (req, res) => {
    const c = await catalogo.atualizarColecao(pool, idNumerico(req), validar(esquemas.esquemaColecao, req.body));
    await registrar(req, 'colecao_editada', 'colecao', c.id, { nome: c.nome });
    res.json(c);
  });

  r.delete('/colecoes/:id', async (req, res) => {
    const id = idNumerico(req);
    const c = await catalogo.removerColecao(pool, id);
    await registrar(req, 'colecao_removida', 'colecao', id, { nome: c.nome });
    res.status(204).end();
  });

  // ---------- pedidos ----------
  r.get('/pedidos', async (req, res) => {
    res.json(await pedidos.listarPedidosAdmin(pool, validar(esquemas.esquemaFiltroPedidos, req.query)));
  });

  r.get('/pedidos/:id', async (req, res) => res.json(await pedidos.pedidoAdmin(pool, idNumerico(req))));

  r.put('/pedidos/:id', async (req, res) => {
    const dados = validar(esquemas.esquemaPedido, req.body);
    const { pedido: p, mudouStatus } = await pedidos.atualizarPedido(pool, idNumerico(req), dados);
    await registrar(req, 'pedido_editado', 'pedido', p.id, {
      codigo: p.codigo, status: mudouStatus ? p.statusRotulo : null, entrega: Boolean(dados.cliente)
    });
    res.json(p);
  });

  // ---------- loja ----------
  r.get('/loja', async (req, res) => res.json(await catalogo.lojaAdmin(pool)));

  r.put('/loja', async (req, res) => {
    const loja = await catalogo.salvarLoja(pool, validar(esquemas.esquemaLoja, req.body));
    await registrar(req, 'loja_editada', 'loja');
    res.json(loja);
  });

  // ---------- admins ----------
  r.get('/usuarios', async (req, res) => res.json(await auth.listarUsuarios(pool, req.admin.id)));

  r.post('/usuarios', async (req, res) => {
    const u = await auth.criarUsuario(pool, req.body, req.admin.id);
    await registrar(req, 'usuario_criado', 'usuario', u.id, { email: u.email });
    res.status(201).json(u);
  });

  r.put('/usuarios/:id', async (req, res) => {
    const u = await auth.atualizarUsuario(pool, idUsuario(req), validar(esquemas.esquemaUsuarioEdicao, req.body), req.admin);
    await registrar(req, 'usuario_editado', 'usuario', u.id, { email: u.email, ativo: u.ativo });
    res.json(u);
  });

  r.put('/usuarios/:id/senha', limiteSenha, async (req, res) => {
    const { novaSenha } = validar(esquemas.esquemaNovaSenha, req.body);
    const alvo = await auth.redefinirSenha(pool, idUsuario(req), novaSenha, req.admin);
    await registrar(req, 'senha_redefinida', 'usuario', alvo.id, { email: alvo.email });
    res.status(204).end();
  });

  r.put('/conta/senha', limiteSenha, async (req, res) => {
    await auth.trocarPropriaSenha(pool, req.admin, validar(esquemas.esquemaTrocaSenha, req.body));
    await registrar(req, 'senha_trocada', 'usuario', req.admin.id);
    res.status(204).end();
  });

  // ---------- atividade ----------
  r.get('/auditoria', async (req, res) => {
    const lista = await repoAuditoria.listar(pool, 150);
    res.json(lista.map((a) => ({
      id: a.id,
      quando: a.criado_em,
      usuario: a.usuario ?? '—',
      descricao: (DESCRICOES[a.acao] ?? (() => a.acao))(a.detalhes ?? {}),
      ip: a.ip
    })));
  });

  return r;
}
