// npm run admin:criar — cadastra um administrador do painel.
// Pergunta e-mail, nome e senha (a senha não aparece na tela).
// Também aceita ADMIN_EMAIL, ADMIN_NOME e ADMIN_SENHA no ambiente.
import { createInterface } from 'node:readline/promises';
import { config } from '../config.js';
import { criarPool } from './pool.js';
import { migrar } from './migrar.js';
import { criarUsuario } from '../servicos/autenticacao.js';

async function perguntar(texto) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(texto)).trim(); } finally { rl.close(); }
}

function perguntarSenha(texto) {
  const entrada = process.stdin;
  if (!entrada.isTTY) return perguntar(texto);
  return new Promise((resolve) => {
    process.stdout.write(texto);
    entrada.setRawMode(true);
    entrada.setEncoding('utf8');
    entrada.resume();
    let senha = '';
    const aoDigitar = (pedaco) => {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', aoDigitar);
          process.stdout.write('\n');
          resolve(senha);
          return;
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') senha = senha.slice(0, -1);
        else senha += ch;
      }
    };
    entrada.on('data', aoDigitar);
  });
}

const pool = criarPool(config.databaseUrl);
try {
  await migrar(pool);
  const email = process.env.ADMIN_EMAIL || await perguntar('E-mail do admin: ');
  const nome = process.env.ADMIN_NOME || await perguntar('Nome: ') || 'Administrador';
  let senha = process.env.ADMIN_SENHA;
  if (!senha) {
    senha = await perguntarSenha('Senha (mín. 12 caracteres): ');
    const repetida = await perguntarSenha('Repita a senha: ');
    if (senha !== repetida) throw new Error('As senhas não conferem.');
  }
  const usuario = await criarUsuario(pool, { nome, email, senha });
  console.log(`Admin criado: ${usuario.email}`);
} catch (erro) {
  const detalhe = erro.campos ? ` ${Object.values(erro.campos).join(' ')}` : '';
  console.error(`Não foi possível criar o admin: ${erro.message}${detalhe}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
