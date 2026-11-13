// Acesso às tabelas pedidos e pedido_itens. Toda consulta é parametrizada.

export async function buscarPorChave(db, chave) {
  const { rows } = await db.query('SELECT id, codigo, mensagem FROM pedidos WHERE chave = $1', [chave]);
  return rows[0] ?? null;
}

/** Grava o pedido e a cópia das peças. Chamar dentro de uma transação. */
export async function criar(db, { codigo, chave, pecas, totalCentavos, mensagem, itens }) {
  const { rows: [pedido] } = await db.query(
    `INSERT INTO pedidos (codigo, chave, pecas, total_centavos, mensagem)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, codigo`,
    [codigo, chave, pecas, totalCentavos, mensagem]
  );
  for (const [posicao, item] of itens.entries()) {
    await db.query(
      `INSERT INTO pedido_itens (pedido_id, posicao, produto_id, slug, nome, cor, tamanho, qtd, preco_centavos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pedido.id, posicao, item.produtoId, item.slug, item.nome, item.cor, item.tamanho, item.qtd, item.precoCentavos]
    );
  }
  return pedido;
}

// a busca vira texto literal no ILIKE: % e _ digitados não funcionam como curinga
const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listar(db, { status = null, busca = null, limite = 300 } = {}) {
  const termo = busca ? `%${escaparLike(busca)}%` : null;
  const { rows } = await db.query(
    `SELECT p.id, p.codigo, p.status, p.pecas, p.total_centavos, p.cliente_nome, p.cliente_contato, p.criado_em,
            COALESCE((SELECT json_agg(json_build_object('nome', i.nome, 'tamanho', i.tamanho, 'qtd', i.qtd) ORDER BY i.posicao)
                        FROM pedido_itens i WHERE i.pedido_id = p.id), '[]') AS itens
       FROM pedidos p
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::text IS NULL OR p.codigo ILIKE $2 OR p.cliente_nome ILIKE $2 OR p.cliente_contato ILIKE $2)
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT $3`,
    [status, termo, limite]
  );
  return rows;
}

export async function contarPorStatus(db) {
  const { rows } = await db.query('SELECT status, count(*)::int AS total FROM pedidos GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}

export async function obter(db, id) {
  const { rows: [pedido] } = await db.query('SELECT * FROM pedidos WHERE id = $1', [id]);
  if (!pedido) return null;
  // peça e foto atuais, se ainda existirem (o pedido guarda a cópia de como era na hora)
  const { rows: itens } = await db.query(
    `SELECT i.*, pr.slug AS slug_atual, pr.ativo AS produto_ativo, img.arquivo
       FROM pedido_itens i
       LEFT JOIN produtos pr ON pr.id = i.produto_id
       LEFT JOIN produto_imagens img ON img.produto_id = i.produto_id AND img.posicao = 0
      WHERE i.pedido_id = $1
      ORDER BY i.posicao`,
    [id]
  );
  return { ...pedido, itens };
}

/** Atualiza só os campos enviados. */
export async function atualizar(db, id, { status, clienteNome, clienteContato, observacao }) {
  const { rows } = await db.query(
    `UPDATE pedidos
        SET status          = COALESCE($2, status),
            cliente_nome    = COALESCE($3, cliente_nome),
            cliente_contato = COALESCE($4, cliente_contato),
            observacao      = COALESCE($5, observacao),
            atualizado_em   = now()
      WHERE id = $1
      RETURNING id`,
    [id, status ?? null, clienteNome ?? null, clienteContato ?? null, observacao ?? null]
  );
  return rows[0] ?? null;
}
