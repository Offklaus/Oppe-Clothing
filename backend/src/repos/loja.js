export async function obter(db) {
  const { rows } = await db.query('SELECT * FROM configuracoes_loja WHERE id');
  if (!rows[0]) throw new Error('Configurações da loja ausentes: rode npm run db:preparar.');
  return rows[0];
}

export async function atualizar(db, l) {
  await db.query(
    `UPDATE configuracoes_loja SET
        whatsapp_numero = $1, instagram = $2, preco_padrao_centavos = $3, tamanhos = $4,
        modelagem = $5, malha = $6, tecnica_estampa = $7, cuidados = $8, sobre = $9,
        medidas = $10, mensagens = $11, destaque_produto_id = $12, atualizado_em = now()
      WHERE id`,
    [l.whatsapp, l.instagram, l.precoPadraoCentavos, l.tamanhos, l.modelagem, l.malha, l.tecnicaEstampa,
      l.cuidados, l.sobre, JSON.stringify(l.medidas), JSON.stringify(l.mensagens), l.destaqueProdutoId]
  );
}

export async function destacarColecao(db, colecaoId) {
  const { rowCount } = await db.query(
    `UPDATE configuracoes_loja SET colecao_destaque_id = $1, atualizado_em = now()
      WHERE id AND EXISTS (SELECT 1 FROM colecoes WHERE id = $1 AND ativa)`,
    [colecaoId]
  );
  return rowCount > 0;
}

export async function tirarColecaoDestaque(db, colecaoId) {
  const { rowCount } = await db.query(
    'UPDATE configuracoes_loja SET colecao_destaque_id = NULL, atualizado_em = now() WHERE id AND colecao_destaque_id = $1',
    [colecaoId]
  );
  return rowCount > 0;
}
