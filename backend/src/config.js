// Configuração lida do ambiente (backend/.env em desenvolvimento).
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // sem .env: usa só as variáveis do ambiente
}

const producao = process.env.NODE_ENV === 'production';
const semBarraFinal = (s) => s.trim().replace(/\/+$/, '');
const siteUrl = semBarraFinal(process.env.SITE_URL ?? 'http://localhost:5173');

// Origens de onde o painel pode enviar alterações (proteção contra CSRF).
const origens = new Set([siteUrl]);
for (const extra of (process.env.ORIGENS_EXTRAS ?? '').split(',')) if (extra.trim()) origens.add(semBarraFinal(extra));
if (!producao) {
  origens.add('http://localhost:5173');
  origens.add('http://127.0.0.1:5173');
}

export const config = Object.freeze({
  producao,
  siteUrl,
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseUrlTeste: process.env.DATABASE_URL_TESTE ?? '',
  origensPermitidas: [...origens],
  // atrás de proxy (Render, Railway, Nginx) o IP real vem do cabeçalho X-Forwarded-For
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : (producao ? 1 : false),
  pastaImagens: fileURLToPath(new URL('../public/images', import.meta.url)),
  pastaFrontend: fileURLToPath(new URL('../../frontend/dist', import.meta.url))
});
