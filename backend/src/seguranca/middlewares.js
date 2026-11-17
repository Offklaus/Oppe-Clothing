import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { buscarSessao, COOKIE_SESSAO } from './sessao.js';

export function semCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

export function carregarAdmin(db) {
  return async (req, res, next) => {
    req.admin = await buscarSessao(db, req.cookies?.[COOKIE_SESSAO]);
    next();
  };
}

export function exigirAdmin(req, res, next) {
  if (!req.admin) throw new ErroHttp(401, 'Faça login para continuar.');
  next();
}

function origemDe(url) {
  try { return url ? new URL(url).origin : null; } catch { return null; }
}

export function protegerCsrf(origensPermitidas) {
  const permitidas = new Set(origensPermitidas);
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origem = req.get('origin') ?? origemDe(req.get('referer'));
    if (req.get('x-oppe-admin') !== '1' || !origem || !permitidas.has(origem)) {
      throw new ErroHttp(403, 'Requisição recusada.');
    }
    next();
  };
}

export function limitador({ janelaMs, limite, mensagem }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { xForwardedForHeader: !config.cabecalhoIp },
    handler: (req, res) => res.status(429).json({ erro: mensagem })
  });
}

export function exigirOrigem(origensPermitidas) {
  const permitidas = new Set(origensPermitidas);
  return (req, res, next) => {
    if (!permitidas.has(req.get('origin'))) throw new ErroHttp(403, 'Para fazer o pedido, use o site da loja.');
    next();
  };
}
