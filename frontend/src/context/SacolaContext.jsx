import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SacolaContext = createContext(null);
const CHAVE = 'oppe-sacola';

// só confere o formato do que está guardado; quem valida peça, tamanho e quantidade é o servidor
const itemBemFormado = (it) =>
  it && typeof it.id === 'string' && typeof it.tamanho === 'string' && Number.isInteger(it.qtd) && it.qtd > 0;

function lerGuardado() {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(lista) ? lista.filter(itemBemFormado) : [];
  } catch {
    return [];
  }
}

/** Sacola guardada no navegador: [{ id, tamanho, qtd }]. */
export function SacolaProvider({ children }) {
  const [itens, setItens] = useState(lerGuardado);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* modo privado */ }
  }, [itens]);

  // a sacola pode mudar em outra aba
  useEffect(() => {
    const aoMudar = (e) => { if (e.key === CHAVE) setItens(lerGuardado()); };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const adicionar = useCallback((id, tamanho) => {
    setItens((lista) => {
      const i = lista.findIndex((x) => x.id === id && x.tamanho === tamanho);
      if (i < 0) return [...lista, { id, tamanho, qtd: 1 }];
      return lista.map((x, k) => (k === i ? { ...x, qtd: x.qtd + 1 } : x));
    });
  }, []);

  const alterarQtd = useCallback((indice, delta) => {
    setItens((lista) => lista.flatMap((x, k) => {
      if (k !== indice) return [x];
      return x.qtd + delta < 1 ? [] : [{ ...x, qtd: x.qtd + delta }];
    }));
  }, []);

  const remover = useCallback((indice) => setItens((lista) => lista.filter((_, k) => k !== indice)), []);
  const esvaziar = useCallback(() => setItens([]), []);
  /** Troca pela lista que o servidor conferiu (repetidos juntos, indisponíveis fora). */
  const substituir = useCallback((lista) => setItens(lista.filter(itemBemFormado)), []);
  const abrir = useCallback(() => setAberta(true), []);
  const fechar = useCallback(() => setAberta(false), []);

  const valor = useMemo(() => ({
    itens,
    pecas: itens.reduce((s, it) => s + it.qtd, 0),
    aberta, abrir, fechar, adicionar, alterarQtd, remover, esvaziar, substituir
  }), [itens, aberta, abrir, fechar, adicionar, alterarQtd, remover, esvaziar, substituir]);

  return <SacolaContext.Provider value={valor}>{children}</SacolaContext.Provider>;
}

export function useSacola() {
  const ctx = useContext(SacolaContext);
  if (!ctx) throw new Error('useSacola precisa estar dentro de <SacolaProvider>.');
  return ctx;
}
