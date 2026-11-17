export class ErroHttp extends Error {
  constructor(status, mensagem, campos) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
    this.campos = campos;
  }
}

export const naoEncontrado = (oque = 'Registro') => new ErroHttp(404, `${oque} não encontrado.`);

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
