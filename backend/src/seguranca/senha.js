// Senhas: hash Argon2id (recomendação OWASP) e política mínima.
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const OPCOES = Object.freeze({ type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
export const TAMANHO_MINIMO = 12;
export const TAMANHO_MAXIMO = 128;

const COMUNS = new Set([
  '123456789012', '1234567890123', 'senha1234567', 'senhasenha12', 'qwertyuiop12', 'password1234',
  'administrador', 'admin1234567', 'mudar1234567', 'trocar123456', 'abcdefghijkl', 'iloveyou1234'
]);
const SEQUENCIAS = /^(?:0?123456789|qwertyuiop|asdfghjkl|1qaz2wsx|zaq12wsx|abc123abc123)/;

export const gerarHash = (senha) => argon2.hash(senha, OPCOES);

export async function conferir(hash, senha) {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    return false;
  }
}

export const precisaRehash = (hash) => argon2.needsRehash(hash, OPCOES);

// Usado quando o e-mail não existe: gasta o mesmo tempo de uma verificação real,
// para que ninguém descubra quais e-mails estão cadastrados medindo o tempo de resposta.
let hashFalso;
export async function conferirFalso(senha) {
  hashFalso ??= await argon2.hash(randomBytes(32).toString('hex'), OPCOES);
  await conferir(hashFalso, String(senha ?? ''));
  return false;
}

/** Devolve a mensagem do problema, ou null se a senha for aceitável. */
export function problemaNaSenha(senha, { email = '' } = {}) {
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO) return `Use pelo menos ${TAMANHO_MINIMO} caracteres.`;
  if (senha.length > TAMANHO_MAXIMO) return `Use no máximo ${TAMANHO_MAXIMO} caracteres.`;
  if (/^(.)\1+$/.test(senha)) return 'A senha não pode ser um único caractere repetido.';
  const minuscula = senha.toLowerCase();
  if (COMUNS.has(minuscula) || SEQUENCIAS.test(minuscula)) return 'Essa senha é comum demais. Escolha outra.';
  if (minuscula.includes('oppe')) return 'A senha não pode conter o nome da loja.';
  const usuario = email.split('@')[0]?.toLowerCase();
  if (usuario && usuario.length >= 4 && minuscula.includes(usuario)) return 'A senha não pode conter o seu e-mail.';
  return null;
}
