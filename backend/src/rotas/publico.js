// Rotas do site (sem login).
import { Router } from 'express';
import { validar } from '../erros.js';
import { exigirOrigem, limitador, semCache } from '../seguranca/middlewares.js';
import { esquemaConsulta, esquemaNovoPedido } from '../validacao/esquemas.js';
import * as catalogo from '../servicos/catalogo.js';
import * as pedido from '../servicos/pedido.js';

export function rotasPublicas({ pool, config }) {
  const r = Router();
  const limitePedidos = limitador({ janelaMs: 60_000, limite: 60, mensagem: 'Muitas requisições. Aguarde um minuto.' });
  const limiteNovosPedidos = limitador({
    janelaMs: 10 * 60_000, limite: 30,
    mensagem: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos ou fale com a gente direto no WhatsApp.'
  });
  const limiteConsultas = limitador({ janelaMs: 60_000, limite: 30, mensagem: 'Muitas consultas. Aguarde um minuto.' });
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

  // Finalizar pedido: peças + dados do cliente. Os dados pessoais vão no corpo (nunca na URL),
  // e só o próprio site pode enviar (Origin conferido; um site de terceiros não cria pedido falso).
  r.post('/pedidos', semCache, exigirOrigem(config.origensPermitidas), limitePedidos, limiteNovosPedidos, async (req, res) => {
    const dados = validar(esquemaNovoPedido, req.body);
    const criado = await pedido.criarPedido(pool, dados, config);
    res.status(criado.novo ? 201 : 200).json(criado);
  });

  // Acompanhar pedido: o código vai no corpo para não ficar em históricos e registros de acesso.
  r.post('/pedidos/consulta', semCache, limiteConsultas, async (req, res) => {
    const { codigo } = validar(esquemaConsulta, req.body);
    res.json(await pedido.consultarPedido(pool, codigo));
  });

  r.get('/contato/whatsapp', async (req, res) => {
    res.redirect(302, await pedido.linkContato(pool));
  });

  return r;
}
