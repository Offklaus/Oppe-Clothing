import pg from 'pg';

export function criarPool(url) {
  if (!url) throw new Error('DATABASE_URL não configurada (veja backend/.env.example).');
  return new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
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
