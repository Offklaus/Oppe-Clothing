// Registro de quem fez o quê no painel.
export async function registrar(db, { usuario = null, acao, entidade, entidadeId = null, detalhes = null, ip = null }) {
  await db.query(
    `INSERT INTO auditoria (usuario_id, usuario_email, acao, entidade, entidade_id, detalhes, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [usuario?.id ?? null, usuario?.email ?? null, acao, entidade, entidadeId == null ? null : String(entidadeId),
      detalhes ? JSON.stringify(detalhes) : null, ip || null]
  );
}

export async function listar(db, limite = 100) {
  const { rows } = await db.query(
    `SELECT a.id, a.acao, a.entidade, a.entidade_id, a.detalhes, a.criado_em, host(a.ip) AS ip,
            COALESCE(u.nome, a.usuario_email) AS usuario
       FROM auditoria a LEFT JOIN usuarios_admin u ON u.id = a.usuario_id
      ORDER BY a.criado_em DESC, a.id DESC LIMIT $1`,
    [limite]
  );
  return rows;
}
