import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buscarLoja, buscarProdutos } from '../api/client.js';

const LojaContext = createContext(null);

/** Dados públicos da loja e as peças do varal, carregados uma vez. */
export function LojaProvider({ children }) {
  const [estado, setEstado] = useState({ status: 'carregando', loja: null, produtos: [] });

  const carregar = useCallback(async () => {
    setEstado((e) => ({ ...e, status: 'carregando' }));
    try {
      const [loja, catalogo] = await Promise.all([buscarLoja(), buscarProdutos()]);
      setEstado({ status: 'pronto', loja, produtos: catalogo.produtos });
    } catch (erro) {
      console.error(erro);
      setEstado((e) => ({ ...e, status: 'erro' }));
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const valor = useMemo(() => ({ ...estado, recarregar: carregar }), [estado, carregar]);
  return <LojaContext.Provider value={valor}>{children}</LojaContext.Provider>;
}

export function useLoja() {
  const ctx = useContext(LojaContext);
  if (!ctx) throw new Error('useLoja precisa estar dentro de <LojaProvider>.');
  return ctx;
}
