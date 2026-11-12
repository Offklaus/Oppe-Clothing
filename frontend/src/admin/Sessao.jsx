import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const SessaoContext = createContext(null);

/** Quem está logado no painel. Quem decide se a sessão vale é sempre o servidor. */
export function SessaoProvider({ children }) {
  const [estado, setEstado] = useState({ status: 'verificando', usuario: null });

  useEffect(() => {
    api.get('/sessao')
      .then(({ usuario }) => setEstado({ status: 'logado', usuario }))
      .catch(() => setEstado({ status: 'anonimo', usuario: null }));
  }, []);

  // qualquer chamada que receba 401 (sessão vencida) volta para o login
  useEffect(() => {
    const expirou = () => setEstado({ status: 'anonimo', usuario: null });
    window.addEventListener('oppe:sessao-expirada', expirou);
    return () => window.removeEventListener('oppe:sessao-expirada', expirou);
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const { usuario } = await api.post('/login', { email, senha });
    setEstado({ status: 'logado', usuario });
  }, []);

  const sair = useCallback(async () => {
    await api.post('/logout').catch(() => {});
    setEstado({ status: 'anonimo', usuario: null });
  }, []);

  const valor = useMemo(() => ({ ...estado, entrar, sair }), [estado, entrar, sair]);
  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}

export function useSessao() {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error('useSessao precisa estar dentro de <SessaoProvider>.');
  return ctx;
}
