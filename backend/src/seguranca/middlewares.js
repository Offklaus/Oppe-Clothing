import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
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

/** Limite de requisições por visitante (req.ip — veja config.cabecalhoIp para o IP atrás do proxy). */
export function limitador({ janelaMs, limite, mensagem }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // com o IP vindo do cabeçalho do proxy, o X-Forwarded-For é ignorado de propósito (não é aviso de erro)
    validate: { xForwardedForHeader: !config.cabecalhoIp },
    handler: (req, res) => res.status(429).json({ erro: mensagem })
  });
}

/**
 * Só aceita a requisição vinda das páginas do próprio site (cabeçalho Origin).
 * O navegador sempre manda Origin num POST feito por fetch; um site de terceiros não consegue
 * fingir o da loja. Usado no envio de pedido do site (o painel tem a proteção dele em protegerCsrf).
 */
export function exigirOrigem(origensPermitidas) {
  const permitidas = new Set(origensPermitidas);
  return (req, res, next) => {
    if (!permitidas.has(req.get('origin'))) throw new ErroHttp(403, 'Para fazer o pedido, use o site da loja.');
    next();
  };
}
