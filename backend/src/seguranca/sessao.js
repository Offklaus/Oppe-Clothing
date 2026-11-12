// Sessões do painel: token aleatório de 256 bits no cookie; no banco fica só o sha256 dele.
import { createHash, randomBytes } from 'node:crypto';

export const COOKIE_SESSAO = 'oppe_sessao';
export const OCIOSA_MS = 2 * 60 * 60 * 1000;     // 2h sem uso encerra a sessão
export const ABSOLUTA_MS = 12 * 60 * 60 * 1000;  // 12h no máximo, mesmo em uso

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token) => createHash('sha256').update(token).digest();

export function opcoesCookie(producao) {
  return { httpOnly: true, secure: producao, sameSite: 'strict', path: '/api', maxAge: ABSOLUTA_MS };
}

export async function criarSessao(db, usuarioId, { ip, userAgent } = {}) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessoes_admin (usuario_id, token_hash, expira_em, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [usuarioId, hashToken(token), ABSOLUTA_MS / 1000, ip || null, String(userAgent ?? '').slice(0, 300)]
  );
  // aproveita para limpar sessões vencidas
  await db.query(
    'DELETE FROM sessoes_admin WHERE expira_em < now() OR ultimo_uso_em < now() - make_interval(secs => $1)',
    [OCIOSA_MS / 1000]
  );
  return token;
}

/** Devolve { sessaoId, id, nome, email } se o token for válido; renova o "último uso". */
export async function buscarSessao(db, token) {
  if (typeof token !== 'string' || !FORMATO_TOKEN.test(token)) return null;
  const { rows } = await db.query(
    `UPDATE sessoes_admin s SET ultimo_uso_em = now()
       FROM usuarios_admin u
      WHERE s.token_hash = $1 AND u.id = s.usuario_id AND u.ativo
        AND s.expira_em > now() AND s.ultimo_uso_em > now() - make_interval(secs => $2)
    RETURNING s.id AS "sessaoId", u.id, u.nome, u.email`,
    [hashToken(token), OCIOSA_MS / 1000]
  );
  return rows[0] ?? null;
}

export async function encerrarSessao(db, token) {
  if (typeof token !== 'string' || !FORMATO_TOKEN.test(token)) return;
  await db.query('DELETE FROM sessoes_admin WHERE token_hash = $1', [hashToken(token)]);
}

export async function encerrarSessoesDoUsuario(db, usuarioId, { exceto = null } = {}) {
  await db.query('DELETE FROM sessoes_admin WHERE usuario_id = $1 AND ($2::uuid IS NULL OR id <> $2)', [usuarioId, exceto]);
}
