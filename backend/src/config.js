import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
}

const semBarraFinal = (s) => s.trim().replace(/\/+$/, '');

function lerTrustProxy(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto || texto === 'false') return false;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero >= 0 ? numero : texto;
}

function lerCabecalhoIp(env) {
  const texto = String(env.CLIENT_IP_HEADER ?? '').trim().toLowerCase();
  if (texto === 'nenhum' || texto === 'false') return '';
  if (!texto) return env.RENDER === 'true' ? 'cf-connecting-ip' : '';
  if (!/^[a-z0-9-]{1,64}$/.test(texto)) throw new Error('CLIENT_IP_HEADER inválido (use o nome do cabeçalho, ex.: cf-connecting-ip).');
  return texto;
}

function lerUrlSupabase(valor) {
  const url = semBarraFinal(String(valor ?? ''));
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error('SUPABASE_URL deve ser a URL do projeto, ex.: https://abcdefgh.supabase.co');
  }
  return url;
}

function lerOrigem(valor, nome) {
  const texto = semBarraFinal(String(valor));
  let url = null;
  try { url = new URL(texto); } catch { }
  const valida = url && ['http:', 'https:'].includes(url.protocol) && url.pathname === '/'
    && !url.search && !url.hash && !url.username && !url.password;
  if (!valida) throw new Error(`${nome} deve ser o endereço completo do site, ex.: https://oppeclothing.com (recebido: "${texto}")`);
  return url.origin;
}

function lerBucket(valor) {
  const bucket = String(valor ?? '').trim() || 'produtos';
  if (!/^[a-z0-9-]{3,63}$/.test(bucket)) throw new Error('SUPABASE_BUCKET inválido (use letras minúsculas, números e hífen).');
  return bucket;
}

export function montarConfig(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const siteUrl = lerOrigem(env.SITE_URL || 'http://localhost:5173', 'SITE_URL');

  const origens = new Set([siteUrl]);
  for (const extra of (env.ORIGENS_EXTRAS ?? '').split(',')) if (extra.trim()) origens.add(lerOrigem(extra, 'ORIGENS_EXTRAS'));
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
    cookieSeguro: producao || siteUrl.startsWith('https://'),
    trustProxy: lerTrustProxy(env.TRUST_PROXY),
    cabecalhoIp: lerCabecalhoIp(env),
    databaseCaCert: String(env.DATABASE_CA_CERT ?? '').replace(/\\n/g, '\n').trim(),
    supabaseUrl: lerUrlSupabase(env.SUPABASE_URL),
    supabaseChave: String(env.SUPABASE_SECRET_KEY ?? '').trim(),
    supabaseBucket: lerBucket(env.SUPABASE_BUCKET),
    pastaImagens: fileURLToPath(new URL('../public/images', import.meta.url)),
    pastaFrontend: fileURLToPath(new URL('../../frontend/dist', import.meta.url))
  });
}

export const config = montarConfig();
