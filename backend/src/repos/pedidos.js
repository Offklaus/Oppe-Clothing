// Acesso às tabelas pedidos, pedido_itens e pedido_eventos. Toda consulta é parametrizada.

export async function buscarPorChave(db, chave) {
  const { rows } = await db.query(
    'SELECT id, codigo, mensagem, cliente_email, cliente_telefone FROM pedidos WHERE chave = $1', [chave]
  );
  return rows[0] ?? null;
}

const COLUNAS_ITEM = 9;

/** Grava o pedido, a cópia das peças e o primeiro evento. Chamar dentro de uma transação. */
export async function criar(db, { codigo, chave, pecas, totalCentavos, mensagem, cliente, itens }) {
  const { rows: [pedido] } = await db.query(
    `INSERT INTO pedidos (codigo, chave, pecas, total_centavos, mensagem,
                          cliente_nome, cliente_email, cliente_telefone,
                          entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                          entrega_bairro, entrega_cidade, entrega_uf)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id, codigo`,
    [codigo, chave, pecas, totalCentavos, mensagem,
      cliente.nome, cliente.email, cliente.telefone,
      cliente.cep, cliente.logradouro, cliente.numero, cliente.complemento,
      cliente.bairro, cliente.cidade, cliente.uf]
  );
  // todas as peças num INSERT só (no máximo 50 linhas × 9 colunas)
  const valores = itens.flatMap((item, posicao) => [
    pedido.id, posicao, item.produtoId, item.slug, item.nome, item.cor, item.tamanho, item.qtd, item.precoCentavos
  ]);
  const linhas = itens.map((_, i) =>
    `(${Array.from({ length: COLUNAS_ITEM }, (__, c) => `$${i * COLUNAS_ITEM + c + 1}`).join(', ')})`);
  await db.query(
    `INSERT INTO pedido_itens (pedido_id, posicao, produto_id, slug, nome, cor, tamanho, qtd, preco_centavos)
     VALUES ${linhas.join(', ')}`,
    valores
  );
  await db.query("INSERT INTO pedido_eventos (pedido_id, status) VALUES ($1, 'novo')", [pedido.id]);
  return pedido;
}

// a busca vira texto literal no ILIKE: % e _ digitados não funcionam como curinga
const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listar(db, { status = null, busca = null, limite = 300 } = {}) {
  const termo = busca ? `%${escaparLike(busca)}%` : null;
  // código sem o hífen ("K7Q2-MX9P" acha "K7Q2MX9P") e telefone só com os números
  const codigo = busca ? busca.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';
  const digitos = busca ? busca.replace(/\D/g, '') : '';
  const { rows } = await db.query(
    `SELECT p.id, p.codigo, p.status, p.pecas, p.total_centavos, p.cliente_nome, p.criado_em,
            COALESCE((SELECT json_agg(json_build_object('nome', i.nome, 'tamanho', i.tamanho, 'qtd', i.qtd) ORDER BY i.posicao)
                        FROM pedido_itens i WHERE i.pedido_id = p.id), '[]') AS itens
       FROM pedidos p
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::text IS NULL
             OR (length($3::text) >= 3 AND strpos(p.codigo, $3::text) > 0)
             OR p.cliente_nome ILIKE $2 OR p.cliente_email ILIKE $2
             OR (length($4::text) >= 4 AND strpos(p.cliente_telefone, $4::text) > 0))
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT $5`,
    [status, termo, codigo, digitos, limite]
  );
  return rows;
}

export async function contarPorStatus(db) {
  const { rows } = await db.query('SELECT status, count(*)::int AS total FROM pedidos GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}

/** Junta ao pedido as peças e o histórico (as duas consultas em paralelo). */
async function completar(db, pedido) {
  if (!pedido) return null;
  const [{ rows: itens }, { rows: eventos }] = await Promise.all([
    // peça e foto atuais, se ainda existirem (o pedido guarda a cópia de como era na hora)
    db.query(
      `SELECT i.*, pr.slug AS slug_atual, pr.ativo AS produto_ativo, img.arquivo
         FROM pedido_itens i
         LEFT JOIN produtos pr ON pr.id = i.produto_id
         LEFT JOIN produto_imagens img ON img.produto_id = i.produto_id AND img.posicao = 0
        WHERE i.pedido_id = $1
        ORDER BY i.posicao`,
      [pedido.id]
    ),
    db.query('SELECT status, criado_em FROM pedido_eventos WHERE pedido_id = $1 ORDER BY criado_em, id', [pedido.id])
  ]);
  return { ...pedido, itens, eventos };
}

export async function obter(db, id) {
  const { rows: [pedido] } = await db.query('SELECT * FROM pedidos WHERE id = $1', [id]);
  return completar(db, pedido);
}

export async function obterPorCodigo(db, codigo) {
  const { rows: [pedido] } = await db.query('SELECT * FROM pedidos WHERE codigo = $1', [codigo]);
  return completar(db, pedido);
}

/**
 * Atualiza só os campos enviados e registra a mudança de situação no histórico.
 * Chamar dentro de uma transação (a linha fica travada até o fim).
 */
export async function atualizar(db, id, { status, rastreio, observacao, cliente }) {
  const { rows: [atual] } = await db.query('SELECT status FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
  if (!atual) return null;
  const c = cliente ?? {};
  await db.query(
    `UPDATE pedidos
        SET status              = COALESCE($2, status),
            codigo_rastreio     = COALESCE($3, codigo_rastreio),
            observacao          = COALESCE($4, observacao),
            cliente_nome        = COALESCE($5, cliente_nome),
            cliente_email       = COALESCE($6, cliente_email),
            cliente_telefone    = COALESCE($7, cliente_telefone),
            entrega_cep         = COALESCE($8, entrega_cep),
            entrega_logradouro  = COALESCE($9, entrega_logradouro),
            entrega_numero      = COALESCE($10, entrega_numero),
            entrega_complemento = COALESCE($11, entrega_complemento),
            entrega_bairro      = COALESCE($12, entrega_bairro),
            entrega_cidade      = COALESCE($13, entrega_cidade),
            entrega_uf          = COALESCE($14, entrega_uf),
            atualizado_em       = now()
      WHERE id = $1`,
    [id, status ?? null, rastreio ?? null, observacao ?? null,
      c.nome ?? null, c.email ?? null, c.telefone ?? null, c.cep ?? null, c.logradouro ?? null, c.numero ?? null,
      c.complemento ?? null, c.bairro ?? null, c.cidade ?? null, c.uf ?? null]
  );
  const mudou = Boolean(status) && status !== atual.status;
  if (mudou) await db.query('INSERT INTO pedido_eventos (pedido_id, status) VALUES ($1, $2)', [id, status]);
  return { id, mudou };
}
