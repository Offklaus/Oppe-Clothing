// Rotas do site (sem login).
import { Router } from 'express';
import { ErroHttp } from '../erros.js';
import { limitador } from '../seguranca/middlewares.js';
import * as catalogo from '../servicos/catalogo.js';
import * as pedido from '../servicos/pedido.js';

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPE[c]);
const paginaDeErro = (mensagem) =>
  '<!doctype html><meta charset="utf-8"><title>Pedido inválido — Oppe Clothing</title>' +
  `<p style="font-family:sans-serif">${esc(mensagem)}</p><p><a href="/">Voltar ao catálogo</a></p>`;

export function rotasPublicas({ pool, config }) {
  const r = Router();
  const limitePedidos = limitador({ janelaMs: 60_000, limite: 60, mensagem: 'Muitas requisições. Aguarde um minuto.' });
  const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  r.get('/saude', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  r.get('/loja', async (req, res) => res.json(await catalogo.lojaPublica(pool)));

  r.get('/produtos', async (req, res) => {
    res.json(await catalogo.listarParaSite(pool, texto(req.query.colecao, 80)));
  });

  r.get('/produtos/:slug', async (req, res) => {
    res.json(await catalogo.detalheParaSite(pool, texto(req.params.slug, 80)));
  });

  // a sacola manda { itens: [{ id, tamanho, qtd }] } e recebe tudo calculado
  r.post('/pedidos/previa', limitePedidos, async (req, res) => {
    res.json(await pedido.previa(pool, req.body?.itens));
  });

  r.post('/pedidos', limitePedidos, async (req, res) => {
    res.json(await pedido.montarPedido(pool, req.body?.itens, config));
  });

  // link dos botões do site: valida, monta a mensagem e redireciona para o WhatsApp
  r.get('/pedidos/whatsapp', limitePedidos, async (req, res) => {
    try {
      const montado = await pedido.montarPedido(pool, pedido.lerItensDaQuery(req.query.itens), config);
      res.redirect(302, montado.whatsappUrl);
    } catch (erro) {
      if (!(erro instanceof ErroHttp)) throw erro;
      res.status(erro.status).type('html').send(paginaDeErro(erro.message));
    }
  });

  r.get('/contato/whatsapp', async (req, res) => {
    res.redirect(302, await pedido.linkContato(pool));
  });

  return r;
}
