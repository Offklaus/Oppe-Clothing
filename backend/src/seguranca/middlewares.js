import rateLimit from 'express-rate-limit';
import { ErroHttp } from '../erros.js';
import { buscarSessao, COOKIE_SESSAO } from './sessao.js';

/** Respostas do painel nunca ficam em cache (navegador ou proxy). */
export function semCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/** Lê o cookie e coloca o admin logado em req.admin (ou null). */
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

/**
 * Proteção contra CSRF em toda alteração (POST/PUT/PATCH/DELETE):
 * 1) exige o cabeçalho X-Oppe-Admin, que um site de terceiros não consegue enviar sem CORS;
 * 2) exige que a origem (Origin ou Referer) seja uma das origens permitidas.
 * O cookie SameSite=Strict é a terceira camada.
 */
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
    handler: (req, res) => res.status(429).json({ erro: mensagem })
  });
}
