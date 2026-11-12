import pg from 'pg';
import tls from 'node:tls';

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Banco na própria máquina: sem SSL.
 * Banco remoto (Supabase): SSL sempre, conferindo o certificado do servidor, para ninguém
 * conseguir se passar pelo banco no caminho. O Supabase usa um certificado próprio: cole o
 * conteúdo dele em DATABASE_CA_CERT (Dashboard → Database → Settings → SSL Configuration).
 */
export function configuracaoConexao(url, { caCert = '' } = {}) {
  if (!url) throw new Error('DATABASE_URL não configurada (veja backend/.env.example).');
  const endereco = new URL(url);
  // o SSL é decidido aqui; parâmetros na URL sobrescreveriam essa configuração
  for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) endereco.searchParams.delete(p);

  if (HOSTS_LOCAIS.has(endereco.hostname)) return { connectionString: endereco.toString(), ssl: false };

  return {
    connectionString: endereco.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(caCert ? { ca: [...tls.rootCertificates, caCert] } : {})
    }
  };
}

export function criarPool(url, { caCert = '', max = 10 } = {}) {
  return new pg.Pool({
    ...configuracaoConexao(url, { caCert }),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

/** Roda `fn(cliente)` dentro de uma transação; desfaz tudo se algo falhar. */
export async function emTransacao(pool, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}
