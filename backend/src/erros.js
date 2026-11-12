// Erros que podem ser mostrados ao usuário. Qualquer outro erro vira "Erro interno".
export class ErroHttp extends Error {
  constructor(status, mensagem, campos) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
    this.campos = campos;
  }
}

export const naoEncontrado = (oque = 'Registro') => new ErroHttp(404, `${oque} não encontrado.`);

/** Valida com um esquema zod; em caso de erro devolve 400 com a mensagem de cada campo. */
export function validar(esquema, dados) {
  const resultado = esquema.safeParse(dados);
  if (resultado.success) return resultado.data;
  const campos = {};
  for (const problema of resultado.error.issues) {
    const chave = problema.path.join('.') || '_';
    campos[chave] ??= problema.message;
  }
  throw new ErroHttp(400, 'Confira os campos destacados.', campos);
}
