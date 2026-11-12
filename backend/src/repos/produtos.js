// SQL das peças e das fotos.
const SELECT_BASE = `
  SELECT p.*, c.slug AS colecao_slug, c.nome AS colecao_nome, c.chamada AS colecao_chamada,
         c.ativa AS colecao_ativa, c.ordem AS colecao_ordem,
         COALESCE((SELECT json_agg(json_build_object('posicao', i.posicao, 'arquivo', i.arquivo, 'lado', i.lado) ORDER BY i.posicao)
                     FROM produto_imagens i WHERE i.produto_id = p.id), '[]'::json) AS imagens
    FROM produtos p JOIN colecoes c ON c.id = p.colecao_id`;

// Regra de visibilidade no site: peça ativa, coleção ativa e com foto principal.
const VISIVEL = `p.ativo AND c.ativa AND EXISTS (SELECT 1 FROM produto_imagens i WHERE i.produto_id = p.id AND i.posicao = 0)`;
const ORDEM = 'ORDER BY c.ordem, p.ordem, p.id';

export async function listarVisiveis(db, { colecaoSlug = null } = {}) {
  const { rows } = await db.query(
    `${SELECT_BASE} WHERE ${VISIVEL} AND ($1::text IS NULL OR c.slug = $1) ${ORDEM}`, [colecaoSlug]
  );
  return rows;
}

export async function visivelPorSlug(db, slug) {
  const { rows } = await db.query(`${SELECT_BASE} WHERE ${VISIVEL} AND p.slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function visiveisPorSlugs(db, slugs) {
  if (!slugs.length) return [];
  const { rows } = await db.query(`${SELECT_BASE} WHERE ${VISIVEL} AND p.slug = ANY($1::text[])`, [slugs]);
  return rows;
}

export async function listarTodos(db) {
  const { rows } = await db.query(`${SELECT_BASE} ${ORDEM}`);
  return rows;
}

export async function porId(db, id) {
  const { rows } = await db.query(`${SELECT_BASE} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function slugEmUso(db, slug, excetoId = null) {
  const { rows } = await db.query('SELECT 1 FROM produtos WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)', [slug, excetoId]);
  return rows.length > 0;
}

const COLUNAS = ['slug', 'nome', 'cor', 'descricao_cor', 'colecao_id', 'tag', 'preco_centavos', 'frase', 'referencia', 'estampa', 'ativo', 'ordem'];
const valores = (p) => [p.slug, p.nome, p.cor, p.descricaoCor, p.colecaoId, p.tag, p.precoCentavos, p.frase, p.referencia, p.estampa, p.ativo, p.ordem];

export async function inserir(db, p) {
  const { rows: [novo] } = await db.query(
    `INSERT INTO produtos (${COLUNAS.join(', ')}) VALUES (${COLUNAS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    valores(p)
  );
  return novo.id;
}

export async function atualizar(db, id, p) {
  await db.query(
    `UPDATE produtos SET ${COLUNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, atualizado_em = now() WHERE id = $1`,
    [id, ...valores(p)]
  );
}

/** Remove a peça e devolve os arquivos de foto que ela usava. */
export async function remover(db, id) {
  const { rows } = await db.query('SELECT arquivo FROM produto_imagens WHERE produto_id = $1', [id]);
  await db.query('DELETE FROM produtos WHERE id = $1', [id]);
  return rows.map((r) => r.arquivo);
}

/** Grava a foto na posição e devolve o arquivo anterior (ou null). */
export async function definirImagem(db, produtoId, posicao, arquivo, lado) {
  const { rows } = await db.query('SELECT arquivo FROM produto_imagens WHERE produto_id = $1 AND posicao = $2', [produtoId, posicao]);
  await db.query(
    `INSERT INTO produto_imagens (produto_id, posicao, arquivo, lado) VALUES ($1, $2, $3, $4)
     ON CONFLICT (produto_id, posicao) DO UPDATE SET arquivo = EXCLUDED.arquivo, lado = EXCLUDED.lado`,
    [produtoId, posicao, arquivo, lado]
  );
  await db.query('UPDATE produtos SET atualizado_em = now() WHERE id = $1', [produtoId]);
  return rows[0]?.arquivo ?? null;
}

export async function alterarLado(db, produtoId, posicao, lado) {
  const { rowCount } = await db.query('UPDATE produto_imagens SET lado = $3 WHERE produto_id = $1 AND posicao = $2', [produtoId, posicao, lado]);
  return rowCount > 0;
}

export async function removerImagem(db, produtoId, posicao) {
  const { rows } = await db.query('DELETE FROM produto_imagens WHERE produto_id = $1 AND posicao = $2 RETURNING arquivo', [produtoId, posicao]);
  return rows[0]?.arquivo ?? null;
}

export async function arquivoEmUso(db, arquivo) {
  const { rows } = await db.query('SELECT 1 FROM produto_imagens WHERE arquivo = $1 LIMIT 1', [arquivo]);
  return rows.length > 0;
}

export async function existe(db, id) {
  const { rows } = await db.query('SELECT 1 FROM produtos WHERE id = $1', [id]);
  return rows.length > 0;
}
