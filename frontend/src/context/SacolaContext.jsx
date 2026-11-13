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

const CHAVE_ULTIMO = 'oppe-ultimo-pedido';

// último pedido feito nesta aba (código e links), para o cliente não perder o código se fechar a gaveta.
// sessionStorage: some quando a aba fecha.
function lerUltimoPedido() {
  try {
    const p = JSON.parse(window.sessionStorage.getItem(CHAVE_ULTIMO) ?? 'null');
    return p && typeof p.codigo === 'string' && typeof p.acompanharUrl === 'string' ? p : null;
  } catch {
    return null;
  }
}

/**
 * Sacola guardada no navegador: [{ id, tamanho, qtd }].
 * etapa: 'sacola' (peças) → 'dados' (nome, contato e entrega) → 'criado' (código do pedido).
 */
export function SacolaProvider({ children }) {
  const [itens, setItens] = useState(lerGuardado);
  const [aberta, setAberta] = useState(false);
  const [etapa, setEtapa] = useState('sacola');
  const [ultimoPedido, setUltimoPedido] = useState(lerUltimoPedido);
  // o que o cliente já digitou em "Finalizar pedido": fechar a gaveta (Esc, ×, clique fora) não apaga.
  // Fica só na memória desta aba (nunca no armazenamento do navegador) e some quando o pedido é criado.
  const [rascunho, setRascunho] = useState(null);

  const registrarPedido = useCallback((pedido) => {
    const resumo = { codigo: pedido.codigo, whatsappUrl: pedido.whatsappUrl, acompanharUrl: pedido.acompanharUrl };
    setUltimoPedido(resumo);
    setRascunho(null);
    try { window.sessionStorage.setItem(CHAVE_ULTIMO, JSON.stringify(resumo)); } catch { /* modo privado */ }
  }, []);

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

  /** Garante a peça na sacola sem somar outra unidade se ela já estiver lá ("Comprar agora"). */
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
  /** Troca pela lista que o servidor conferiu (repetidos juntos, indisponíveis fora). */
  const substituir = useCallback((lista) => setItens(lista.filter(itemBemFormado)), []);
  /** Abre a gaveta; "dados" já abre no formulário de finalizar (botão "Comprar agora"). */
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
