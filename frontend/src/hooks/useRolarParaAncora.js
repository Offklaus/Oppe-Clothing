import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Rola até o elemento do #hash da URL (ex.: /#catalogo).
 * Espera `pronto` para rolar depois que o conteúdo carregou e a página parou de mudar de altura.
 */
export function useRolarParaAncora(pronto = true) {
  const { hash, key } = useLocation();

  useEffect(() => {
    if (!pronto || !hash) return;
    const alvo = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, key, pronto]);
}
