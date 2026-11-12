// Configuração lida do ambiente (backend/.env em desenvolvimento).
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // sem .env: usa só as variáveis do ambiente
}

const semBarraFinal = (s) => s.trim().replace(/\/+$/, '');

/**
 * TRUST_PROXY só deve ser definido quando existe um proxy na frente (Render, Railway, Nginx).
 * Sem proxy, confiar no X-Forwarded-For deixaria qualquer um inventar o próprio IP
 * e escapar do limite de tentativas de login.
 */
function lerTrustProxy(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto || texto === 'false') return false;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero >= 0 ? numero : texto; // número de proxies ou ex.: "loopback"
}

function lerUrlSupabase(valor) {
  const url = semBarraFinal(String(valor ?? ''));
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error('SUPABASE_URL deve ser a URL do projeto, ex.: https://abcdefgh.supabase.co');
  }
  return url;
}

function lerBucket(valor) {
  const bucket = String(valor ?? '').trim() || 'produtos';
  if (!/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error('SUPABASE_BUCKET inválido (use letras minúsculas, números e hífen).');
  return bucket;
}

export function montarConfig(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const siteUrl = semBarraFinal(env.SITE_URL ?? 'http://localhost:5173');

  // Origens de onde o painel pode enviar alterações (proteção contra CSRF).
  const origens = new Set([siteUrl]);
  for (const extra of (env.ORIGENS_EXTRAS ?? '').split(',')) if (extra.trim()) origens.add(semBarraFinal(extra));
  if (!producao) {
    origens.add('http://localhost:5173');
    origens.add('http://127.0.0.1:5173');
  }

  return Object.freeze({
    producao,
    siteUrl,
    databaseUrl: env.DATABASE_URL ?? '',
    databaseUrlTeste: env.DATABASE_URL_TESTE ?? '',
    origensPermitidas: [...origens],
    // o cookie do painel só trafega por HTTPS em produção ou quando o site é https,
    // mesmo que alguém esqueça de definir NODE_ENV
    cookieSeguro: producao || siteUrl.startsWith('https://'),
    trustProxy: lerTrustProxy(env.TRUST_PROXY),
    // certificado do Supabase para conferir o SSL do banco (aceita "\n" escrito em uma linha só)
    databaseCaCert: String(env.DATABASE_CA_CERT ?? '').replace(/\\n/g, '\n').trim(),
    // fotos do painel no Supabase Storage (sem estas duas, ficam no disco local)
    supabaseUrl: lerUrlSupabase(env.SUPABASE_URL),
    supabaseChave: String(env.SUPABASE_SECRET_KEY ?? '').trim(),
    supabaseBucket: lerBucket(env.SUPABASE_BUCKET),
    pastaImagens: fileURLToPath(new URL('../public/images', import.meta.url)),
    pastaFrontend: fileURLToPath(new URL('../../frontend/dist', import.meta.url))
  });
}

export const config = montarConfig();
