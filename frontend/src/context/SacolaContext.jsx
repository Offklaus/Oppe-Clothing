import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SacolaContext = createContext(null);
const CHAVE = 'oppe-sacola';

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

const CHAVE_ULTIMO = 'oppe-ultimo-pedido';

function lerUltimoPedido() {
  try {
    const p = JSON.parse(window.sessionStorage.getItem(CHAVE_ULTIMO) ?? 'null');
    if (!p || typeof p.codigo !== 'string' || typeof p.acompanharUrl !== 'string') return null;
    const guardado = { codigo: p.codigo, acompanharUrl: p.acompanharUrl };
    window.sessionStorage.setItem(CHAVE_ULTIMO, JSON.stringify(guardado));
    return guardado;
  } catch {
    return null;
  }
}

export function SacolaProvider({ children }) {
  const [itens, setItens] = useState(lerGuardado);
  const [aberta, setAberta] = useState(false);
  const [etapa, setEtapa] = useState('sacola');
  const [ultimoPedido, setUltimoPedido] = useState(lerUltimoPedido);
  const [rascunho, setRascunho] = useState(null);

  const registrarPedido = useCallback((pedido) => {
    const guardado = { codigo: pedido.codigo, acompanharUrl: pedido.acompanharUrl };
    setUltimoPedido({ ...guardado, whatsappUrl: pedido.whatsappUrl });
    setRascunho(null);
    try { window.sessionStorage.setItem(CHAVE_ULTIMO, JSON.stringify(guardado)); } catch { }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { }
  }, [itens]);

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

  const garantir = useCallback((id, tamanho) => {
    setItens((lista) => (lista.some((x) => x.id === id && x.tamanho === tamanho) ? lista : [...lista, { id, tamanho, qtd: 1 }]));
  }, []);

  const alterarQtd = useCallback((indice, delta) => {
    setItens((lista) => lista.flatMap((x, k) => {
      if (k !== indice) return [x];
      return x.qtd + delta < 1 ? [] : [{ ...x, qtd: x.qtd + delta }];
    }));
  }, []);

  const remover = useCallback((indice) => setItens((lista) => lista.filter((_, k) => k !== indice)), []);
  const esvaziar = useCallback(() => setItens([]), []);
  const substituir = useCallback((lista) => setItens(lista.filter(itemBemFormado)), []);
  const abrir = useCallback((qual = 'sacola') => {
    setEtapa(typeof qual === 'string' ? qual : 'sacola');
    setAberta(true);
  }, []);
  const fechar = useCallback(() => {
    setAberta(false);
    setEtapa('sacola');
  }, []);

  const valor = useMemo(() => ({
    itens,
    pecas: itens.reduce((s, it) => s + it.qtd, 0),
    aberta, abrir, fechar, etapa, setEtapa, adicionar, garantir, alterarQtd, remover, esvaziar, substituir,
    ultimoPedido, registrarPedido, rascunho, setRascunho
  }), [itens, aberta, abrir, fechar, etapa, adicionar, garantir, alterarQtd, remover, esvaziar, substituir,
    ultimoPedido, registrarPedido, rascunho]);

  return <SacolaContext.Provider value={valor}>{children}</SacolaContext.Provider>;
}

export function useSacola() {
  const ctx = useContext(SacolaContext);
  if (!ctx) throw new Error('useSacola precisa estar dentro de <SacolaProvider>.');
  return ctx;
}
