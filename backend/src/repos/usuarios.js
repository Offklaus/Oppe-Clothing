// SQL dos administradores. senha_hash nunca sai deste módulo para as rotas.
const PUBLICOS = 'id, nome, email, ativo, ultimo_login_em, criado_em, bloqueado_ate';

export async function porEmailComHash(db, email) {
  const { rows } = await db.query(
    'SELECT id, nome, email, ativo, senha_hash, tentativas_falhas, bloqueado_ate FROM usuarios_admin WHERE email = $1', [email]
  );
  return rows[0] ?? null;
}

export async function hashPorId(db, id) {
  const { rows } = await db.query('SELECT senha_hash FROM usuarios_admin WHERE id = $1', [id]);
  return rows[0]?.senha_hash ?? null;
}

export async function porId(db, id) {
  const { rows } = await db.query(`SELECT ${PUBLICOS} FROM usuarios_admin WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listar(db) {
  const { rows } = await db.query(`SELECT ${PUBLICOS} FROM usuarios_admin ORDER BY criado_em`);
  return rows;
}

export async function emailEmUso(db, email) {
  const { rows } = await db.query('SELECT 1 FROM usuarios_admin WHERE email = $1', [email]);
  return rows.length > 0;
}

export async function contarAtivos(db) {
  const { rows: [r] } = await db.query('SELECT count(*)::int AS total FROM usuarios_admin WHERE ativo');
  return r.total;
}

export async function inserir(db, { nome, email, senhaHash }) {
  const { rows: [novo] } = await db.query(
    `INSERT INTO usuarios_admin (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING ${PUBLICOS}`,
    [nome, email, senhaHash]
  );
  return novo;
}

export async function atualizar(db, id, { nome, ativo }) {
  await db.query(
    `UPDATE usuarios_admin SET nome = COALESCE($2, nome), ativo = COALESCE($3, ativo), atualizado_em = now() WHERE id = $1`,
    [id, nome ?? null, ativo ?? null]
  );
}

export async function definirSenha(db, id, senhaHash) {
  await db.query(
    `UPDATE usuarios_admin SET senha_hash = $2, senha_alterada_em = now(), tentativas_falhas = 0, bloqueado_ate = NULL,
            atualizado_em = now() WHERE id = $1`,
    [id, senhaHash]
  );
}

/** Conta a falha; ao chegar no limite, bloqueia por alguns minutos e zera o contador. */
export async function registrarFalha(db, id, limite, minutos) {
  await db.query(
    `UPDATE usuarios_admin SET
        tentativas_falhas = CASE WHEN tentativas_falhas + 1 >= $2 THEN 0 ELSE tentativas_falhas + 1 END,
        bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_ate END
      WHERE id = $1`,
    [id, limite, minutos]
  );
}

export async function registrarSucesso(db, id) {
  await db.query(
    'UPDATE usuarios_admin SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login_em = now() WHERE id = $1', [id]
  );
}
