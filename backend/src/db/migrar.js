// Aplica, em ordem, os arquivos de backend/migrations que ainda não rodaram.
import { readdir, readFile } from 'node:fs/promises';

const PASTA = new URL('../../migrations/', import.meta.url);
const TRAVA = 727274; // pg_advisory_lock: impede duas migrações ao mesmo tempo

export async function migrar(pool) {
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [TRAVA]);
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);

    const arquivos = (await readdir(PASTA)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
    const { rows } = await cliente.query('SELECT nome FROM schema_migrations');
    const feitas = new Set(rows.map((r) => r.nome));
    const aplicadas = [];

    for (const arquivo of arquivos) {
      if (feitas.has(arquivo)) continue;
      const sql = await readFile(new URL(arquivo, PASTA), 'utf8');
      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
      } catch (erro) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw new Error(`Falha na migração ${arquivo}: ${erro.message}`);
      }
      aplicadas.push(arquivo);
    }
    return aplicadas;
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [TRAVA]).catch(() => {});
    cliente.release();
  }
}
