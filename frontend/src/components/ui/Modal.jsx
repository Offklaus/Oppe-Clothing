import { useEffect, useRef } from 'react';

/**
 * <dialog> nativo controlado por estado: prende o foco, fecha com Esc
 * e fecha ao clicar fora (no fundo escuro).
 */
export default function Modal({ aberto, onFechar, className, rotuloId, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    }
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={rotuloId}
      onClose={onFechar}
      onClick={(e) => { if (e.target === ref.current) onFechar(); }}
    >
      {children}
    </dialog>
  );
}
