import { useCallback, useEffect, useState } from 'react';

/**
 * Busca dados da API e cancela a busca anterior quando as dependências mudam.
 * Enquanto carrega de novo, mantém os dados anteriores na tela (sem piscar).
 */
export function useDados(buscar, dependencias) {
  const [estado, setEstado] = useState({ status: 'carregando', dados: null, erro: null });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const controle = new AbortController();
    setEstado((e) => ({ ...e, status: 'carregando' }));
    buscar(controle.signal)
      .then((dados) => setEstado({ status: 'pronto', dados, erro: null }))
      .catch((erro) => {
        if (erro.name !== 'AbortError') setEstado({ status: 'erro', dados: null, erro });
      });
    return () => controle.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { ...estado, recarregar };
}
