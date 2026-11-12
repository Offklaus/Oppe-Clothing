/** A estrela de quatro pontas que já aparece nas estampas. */
export default function Estrela({ tamanho = 16, cor = 'currentColor' }) {
  return (
    <svg className="estrela" width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C12.6 7 17 11.4 24 12C17 12.6 12.6 17 12 24C11.4 17 7 12.6 0 12C7 11.4 11.4 7 12 0Z" fill={cor} />
    </svg>
  );
}
