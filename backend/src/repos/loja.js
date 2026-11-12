// Configurações da loja: uma única linha (id = true).
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
        medidas = $10, mensagens = $11, destaque_produto_id = $12, colecao_destaque_id = $13, atualizado_em = now()
      WHERE id`,
    [l.whatsapp, l.instagram, l.precoPadraoCentavos, l.tamanhos, l.modelagem, l.malha, l.tecnicaEstampa,
      l.cuidados, l.sobre, JSON.stringify(l.medidas), JSON.stringify(l.mensagens), l.destaqueProdutoId, l.colecaoDestaqueId]
  );
}
