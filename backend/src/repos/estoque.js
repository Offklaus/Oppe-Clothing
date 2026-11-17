import { ESTOQUE_MAXIMO } from '../servicos/formatos.js';

const compararTexto = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const ordenarParaTravar = (lista) =>
  [...lista].sort((a, b) => a.produtoId - b.produtoId || compararTexto(a.tamanho, b.tamanho));

async function registrar(db, { produtoId, tamanho, variacao, saldo, motivo, pedidoId = null, usuarioId = null }) {
  await db.query(
    `INSERT INTO estoque_movimentos (produto_id, tamanho, variacao, saldo, motivo, pedido_id, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [produtoId, tamanho, variacao, saldo, motivo, pedidoId, usuarioId]
  );
}

export async function retirar(db, { produtoId, tamanho, qtd, motivo, pedidoId = null, usuarioId = null }) {
  const { rows } = await db.query(
    `UPDATE estoque SET quantidade = quantidade - $3
      WHERE produto_id = $1 AND tamanho = $2 AND quantidade >= $3
      RETURNING quantidade`,
    [produtoId, tamanho, qtd]
  );
  if (!rows.length) return null;
  await registrar(db, { produtoId, tamanho, variacao: -qtd, saldo: rows[0].quantidade, motivo, pedidoId, usuarioId });
  return rows[0].quantidade;
}

export async function travar(db, produtoId, tamanho) {
  const { rows: [linha] } = await db.query(
    `INSERT INTO estoque (produto_id, tamanho, quantidade) VALUES ($1, $2, 0)
     ON CONFLICT (produto_id, tamanho) DO UPDATE SET quantidade = estoque.quantidade
     RETURNING quantidade`,
    [produtoId, tamanho]
  );
  return linha.quantidade;
}

async function gravar(db, produtoId, tamanho, quantidade) {
  await db.query('UPDATE estoque SET quantidade = $3 WHERE produto_id = $1 AND tamanho = $2', [produtoId, tamanho, quantidade]);
}

export async function devolver(db, { produtoId, tamanho, qtd, motivo, pedidoId = null, usuarioId = null }) {
  const antes = await travar(db, produtoId, tamanho);
  const saldo = Math.min(antes + qtd, ESTOQUE_MAXIMO);
  if (saldo === antes) return saldo;
  await gravar(db, produtoId, tamanho, saldo);
  await registrar(db, { produtoId, tamanho, variacao: saldo - antes, saldo, motivo, pedidoId, usuarioId });
  return saldo;
}

export async function quantidade(db, produtoId, tamanho) {
  const { rows } = await db.query('SELECT quantidade FROM estoque WHERE produto_id = $1 AND tamanho = $2', [produtoId, tamanho]);
  return rows[0]?.quantidade ?? 0;
}

export async function ajustar(db, { produtoId, tamanho, de, para, usuarioId }) {
  if (para === de) return;
  await gravar(db, produtoId, tamanho, para);
  await registrar(db, { produtoId, tamanho, variacao: para - de, saldo: para, motivo: 'ajuste', usuarioId });
}

export async function definirControle(db, produtoId, controla) {
  await db.query('UPDATE produtos SET controla_estoque = $2, atualizado_em = now() WHERE id = $1', [produtoId, controla]);
}

export async function movimentos(db, produtoId, limite = 30) {
  const { rows } = await db.query(
    `SELECT m.tamanho, m.variacao, m.saldo, m.motivo, m.criado_em, m.pedido_id, p.codigo AS pedido_codigo,
            u.nome AS usuario_nome
       FROM estoque_movimentos m
       LEFT JOIN pedidos p ON p.id = m.pedido_id
       LEFT JOIN usuarios_admin u ON u.id = m.usuario_id
      WHERE m.produto_id = $1
      ORDER BY m.criado_em DESC, m.id DESC
      LIMIT $2`,
    [produtoId, limite]
  );
  return rows;
}
