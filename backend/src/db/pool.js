import pg from 'pg';
import tls from 'node:tls';

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function configuracaoConexao(url, { caCert = '' } = {}) {
  if (!url) throw new Error('DATABASE_URL não configurada (veja backend/.env.example).');
  const endereco = new URL(url);
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
