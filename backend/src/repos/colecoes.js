// SQL das coleções. Sempre com parâmetros ($1, $2...), nunca concatenando valores.
const CAMPOS = 'c.id, c.slug, c.nome, c.chamada, c.frase, c.descricao, c.ordem, c.ativa';

export async function listarTodas(db) {
  const { rows } = await db.query(
    `SELECT ${CAMPOS}, count(p.id)::int AS total_produtos
       FROM colecoes c LEFT JOIN produtos p ON p.colecao_id = c.id
      GROUP BY c.id ORDER BY c.ordem, c.nome`
  );
  return rows;
}

/** Coleções que aparecem no site: ativas e com pelo menos uma peça visível. */
export async function listarVisiveis(db) {
  const { rows } = await db.query(
    `SELECT ${CAMPOS} FROM colecoes c
      WHERE c.ativa AND EXISTS (
        SELECT 1 FROM produtos p JOIN produto_imagens i ON i.produto_id = p.id AND i.posicao = 0
         WHERE p.colecao_id = c.id AND p.ativo)
      ORDER BY c.ordem, c.nome`
  );
  return rows;
}

export async function porId(db, id) {
  const { rows } = await db.query(`SELECT ${CAMPOS} FROM colecoes c WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function slugEmUso(db, slug, excetoId = null) {
  const { rows } = await db.query('SELECT 1 FROM colecoes WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)', [slug, excetoId]);
  return rows.length > 0;
}

export async function nomeEmUso(db, nome, excetoId = null) {
  const { rows } = await db.query('SELECT 1 FROM colecoes WHERE lower(nome) = lower($1) AND ($2::int IS NULL OR id <> $2)', [nome, excetoId]);
  return rows.length > 0;
}

export async function contarProdutos(db, id) {
  const { rows: [r] } = await db.query('SELECT count(*)::int AS total FROM produtos WHERE colecao_id = $1', [id]);
  return r.total;
}

export async function inserir(db, c) {
  const { rows: [nova] } = await db.query(
    `INSERT INTO colecoes (slug, nome, chamada, frase, descricao, ordem, ativa)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [c.slug, c.nome, c.chamada, c.frase, c.descricao, c.ordem, c.ativa]
  );
  return nova.id;
}

export async function atualizar(db, id, c) {
  await db.query(
    `UPDATE colecoes SET slug = $2, nome = $3, chamada = $4, frase = $5, descricao = $6, ordem = $7, ativa = $8,
            atualizado_em = now() WHERE id = $1`,
    [id, c.slug, c.nome, c.chamada, c.frase, c.descricao, c.ordem, c.ativa]
  );
}

export async function remover(db, id) {
  await db.query('DELETE FROM colecoes WHERE id = $1', [id]);
}
