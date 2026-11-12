// Chamadas do painel. A sessão vai num cookie httpOnly (o JavaScript não lê);
// o cabeçalho X-Oppe-Admin faz parte da proteção contra CSRF no servidor.
import { useCallback, useEffect, useState } from 'react';

export class ErroApi extends Error {
  constructor(status, mensagem, campos = {}) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

async function pedir(metodo, caminho, corpo, { formulario } = {}) {
  const headers = { accept: 'application/json', 'X-Oppe-Admin': '1' };
  let body;
  if (formulario) body = formulario;
  else if (corpo !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(`/api/admin${caminho}`, { method: metodo, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Tente de novo.');
  }
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 401 && caminho !== '/login') window.dispatchEvent(new Event('oppe:sessao-expirada'));
    throw new ErroApi(resposta.status, dados.erro ?? 'Algo deu errado. Tente de novo.', dados.campos ?? {});
  }
  return dados;
}

export const api = {
  get: (caminho) => pedir('GET', caminho),
  post: (caminho, corpo) => pedir('POST', caminho, corpo),
  put: (caminho, corpo) => pedir('PUT', caminho, corpo),
  del: (caminho) => pedir('DELETE', caminho),
  /** Envia (ou só troca o lado de) uma foto da peça. Sem arquivo, só atualiza o lado. */
  foto(produtoId, posicao, lado, arquivo) {
    const formulario = new FormData();
    formulario.append('lado', lado);
    if (arquivo) formulario.append('imagem', arquivo);
    return pedir('PUT', `/produtos/${produtoId}/imagens/${posicao}`, undefined, { formulario });
  }
};

/** Carrega um recurso do painel; `recarregar()` busca de novo. */
export function useCarregar(caminho) {
  const [estado, setEstado] = useState({ carregando: true, dados: null, erro: null });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    api.get(caminho)
      .then((dados) => ativo && setEstado({ carregando: false, dados, erro: null }))
      .catch((erro) => ativo && setEstado({ carregando: false, dados: null, erro }));
    return () => { ativo = false; };
  }, [caminho, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { ...estado, recarregar };
}
