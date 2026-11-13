import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { ErroHttp } from './erros.js';
import { limitador } from './seguranca/middlewares.js';
import { origemDasFotos } from './servicos/armazenamento.js';
import { rotasPublicas } from './rotas/publico.js';
import { rotasAdmin } from './rotas/admin.js';

/**
 * ctx = { pool, config, limiteLogin?, limiteApi? }
 * Se existir o build do Vite (frontend/dist), o Express também serve o site.
 */
export function criarApp(ctx) {
  const { config } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', ...(origemDasFotos() ? [origemDasFotos()] : [])],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': config.producao ? [] : null
      }
    },
    strictTransportSecurity: config.producao ? undefined : false
  }));
  // IP real do visitante vindo do cabeçalho do proxy (ex.: CF-Connecting-IP no Render).
  // Vale para os limites de tentativas e para o registro de atividade.
  if (config.cabecalhoIp) {
    app.use((req, res, next) => {
      const ip = String(req.get(config.cabecalhoIp) ?? '').trim();
      if (isIP(ip)) Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
      next();
    });
  }
  app.use(cookieParser());
  app.use(express.json({ limit: '50kb' }));
  app.use('/images', express.static(config.pastaImagens, { maxAge: '7d', dotfiles: 'deny', index: false }));

  app.use('/api/admin', rotasAdmin(ctx));
  app.use('/api', limitador({ janelaMs: 60_000, limite: ctx.limiteApi ?? 300, mensagem: 'Muitas requisições. Aguarde um minuto.' }), rotasPublicas(ctx));
  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  const dist = config.pastaFrontend;
  if (dist && existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    // qualquer outra rota GET é do React Router (ex.: /produto/i-won-again, /admin)
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/images')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((req, res) => res.status(404).json({ erro: 'Não encontrado.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((erro, req, res, next) => {
    let status = 500;
    let corpo = { erro: 'Erro interno. Tente de novo em instantes.' };

    if (erro instanceof ErroHttp) {
      status = erro.status;
      corpo = { erro: erro.message, ...(erro.campos ? { campos: erro.campos } : {}) };
    } else if (erro instanceof multer.MulterError) {
      status = erro.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      corpo = { erro: erro.code === 'LIMIT_FILE_SIZE' ? 'A imagem pode ter no máximo 5 MB.' : 'Envio de arquivo inválido.' };
    } else if (erro.type === 'entity.parse.failed') {
      status = 400; corpo = { erro: 'JSON inválido.' };
    } else if (erro.type === 'entity.too.large') {
      status = 413; corpo = { erro: 'Conteúdo grande demais.' };
    } else if (erro.code === '23505') {
      status = 409; corpo = { erro: 'Já existe um registro com esse valor.' };
    } else if (erro.code === '23503') {
      status = 409; corpo = { erro: 'Esse registro está ligado a outro e não pode ser alterado assim.' };
    } else if (erro.code === '23514' || erro.code === '22P02' || erro.code === '22001') {
      status = 400; corpo = { erro: 'Valor inválido.' };
    }

    if (status >= 500) console.error(erro);
    res.status(status).json(corpo);
  });

  return app;
}
