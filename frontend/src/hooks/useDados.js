import { useCallback, useEffect, useState } from 'react';

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
  }, [...dependencias, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { ...estado, recarregar };
}
