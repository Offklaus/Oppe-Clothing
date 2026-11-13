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

/** Limite de requisições por IP. `pagina` (opcional) responde em HTML, para rotas abertas no navegador. */
export function limitador({ janelaMs, limite, mensagem, pagina }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => (pagina
      ? res.status(429).type('html').send(pagina(mensagem))
      : res.status(429).json({ erro: mensagem }))
  });
}

/**
 * Pedido só é registrado quando o cliente abre o link a partir do próprio site.
 * Um site de terceiros não consegue criar pedido falso embutindo o link (imagem, script, iframe)
 * nem levando o visitante até ele. Navegadores antigos não mandam estes cabeçalhos: aí vale o limite por IP.
 */
export function navegacaoDoSite(req) {
  const site = req.get('sec-fetch-site');
  const destino = req.get('sec-fetch-dest');
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) return false;
  if (destino && destino !== 'document') return false;
  return true;
}
