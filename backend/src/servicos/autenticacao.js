// Login, usuários do painel e senhas.
import * as repoUsuarios from '../repos/usuarios.js';
import { ErroHttp, naoEncontrado, validar } from '../erros.js';
import { esquemaUsuarioNovo } from '../validacao/esquemas.js';
import { conferir, conferirFalso, gerarHash, precisaRehash, problemaNaSenha } from '../seguranca/senha.js';
import { encerrarSessoesDoUsuario } from '../seguranca/sessao.js';

export const MAX_FALHAS = 5;
export const BLOQUEIO_MINUTOS = 15;

// Mesma mensagem para e-mail inexistente, senha errada, conta inativa ou bloqueada:
// assim ninguém descobre quais e-mails existem.
const falhaDeLogin = () => new ErroHttp(
  401, `E-mail ou senha incorretos. Após ${MAX_FALHAS} tentativas erradas, o acesso fica bloqueado por ${BLOQUEIO_MINUTOS} minutos.`
);

export async function autenticar(db, { email, senha }) {
  const usuario = await repoUsuarios.porEmailComHash(db, email);
  if (!usuario) {
    await conferirFalso(senha);
    throw falhaDeLogin();
  }
  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    await conferirFalso(senha);
    throw falhaDeLogin();
  }
  const senhaCorreta = await conferir(usuario.senha_hash, senha);
  if (!senhaCorreta || !usuario.ativo) {
    await repoUsuarios.registrarFalha(db, usuario.id, MAX_FALHAS, BLOQUEIO_MINUTOS);
    throw falhaDeLogin();
  }
  await repoUsuarios.registrarSucesso(db, usuario.id);
  // se os parâmetros do Argon2 mudarem, o hash é atualizado no próximo login
  if (precisaRehash(usuario.senha_hash)) await repoUsuarios.definirSenha(db, usuario.id, await gerarHash(senha));
  return { id: usuario.id, nome: usuario.nome, email: usuario.email };
}

function exigirSenhaForte(senha, email, campo) {
  const problema = problemaNaSenha(senha, { email });
  if (problema) throw new ErroHttp(400, 'Confira os campos destacados.', { [campo]: problema });
}

const bloqueado = (u) => Boolean(u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date());

export function paraUsuarioPublico(u, idAtual) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    ativo: u.ativo,
    bloqueado: bloqueado(u),
    ultimoLoginEm: u.ultimo_login_em,
    criadoEm: u.criado_em,
    voce: u.id === idAtual
  };
}

export async function criarUsuario(db, entrada, idAtual = null) {
  const { nome, email, senha } = validar(esquemaUsuarioNovo, entrada);
  if (await repoUsuarios.emailEmUso(db, email)) {
    throw new ErroHttp(409, 'Já existe um admin com esse e-mail.', { email: 'Já existe um admin com esse e-mail.' });
  }
  exigirSenhaForte(senha, email, 'senha');
  const novo = await repoUsuarios.inserir(db, { nome, email, senhaHash: await gerarHash(senha) });
  return paraUsuarioPublico(novo, idAtual);
}

export async function listarUsuarios(db, idAtual) {
  return (await repoUsuarios.listar(db)).map((u) => paraUsuarioPublico(u, idAtual));
}

export async function atualizarUsuario(db, alvoId, dados, ator) {
  const alvo = await repoUsuarios.porId(db, alvoId);
  if (!alvo) throw naoEncontrado('Admin');
  if (dados.ativo === false && alvo.ativo) {
    if (alvoId === ator.id) throw new ErroHttp(400, 'Você não pode desativar a própria conta.');
    if ((await repoUsuarios.contarAtivos(db)) <= 1) throw new ErroHttp(400, 'O painel precisa de pelo menos um admin ativo.');
  }
  await repoUsuarios.atualizar(db, alvoId, dados);
  if (dados.ativo === false) await encerrarSessoesDoUsuario(db, alvoId);
  return paraUsuarioPublico(await repoUsuarios.porId(db, alvoId), ator.id);
}

export async function trocarPropriaSenha(db, ator, { senhaAtual, novaSenha }) {
  const hash = await repoUsuarios.hashPorId(db, ator.id);
  if (!hash || !(await conferir(hash, senhaAtual))) {
    throw new ErroHttp(400, 'Confira os campos destacados.', { senhaAtual: 'Senha atual incorreta.' });
  }
  if (senhaAtual === novaSenha) {
    throw new ErroHttp(400, 'Confira os campos destacados.', { novaSenha: 'A nova senha precisa ser diferente da atual.' });
  }
  exigirSenhaForte(novaSenha, ator.email, 'novaSenha');
  await repoUsuarios.definirSenha(db, ator.id, await gerarHash(novaSenha));
  // derruba as sessões em outros aparelhos; a atual continua
  await encerrarSessoesDoUsuario(db, ator.id, { exceto: ator.sessaoId });
}

export async function redefinirSenha(db, alvoId, novaSenha, ator) {
  if (alvoId === ator.id) throw new ErroHttp(400, 'Para trocar a sua própria senha, use "Minha conta".');
  const alvo = await repoUsuarios.porId(db, alvoId);
  if (!alvo) throw naoEncontrado('Admin');
  exigirSenhaForte(novaSenha, alvo.email, 'novaSenha');
  await repoUsuarios.definirSenha(db, alvoId, await gerarHash(novaSenha));
  await encerrarSessoesDoUsuario(db, alvoId);
  return alvo;
}
