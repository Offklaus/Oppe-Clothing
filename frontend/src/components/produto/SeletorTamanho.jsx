/** Botões de tamanho. `erro` destaca o grupo quando o cliente tenta pedir sem escolher. */
export default function SeletorTamanho({ tamanhos, valor, onEscolher, erro, refPrimeiro, onVerMedidas }) {
  const status = erro ? 'Escolha um tamanho antes de pedir' : valor ? `Escolhido: ${valor}` : 'Escolha um tamanho';

  return (
    <div className="tamanho">
      <div className="tamanho__head">
        <span className="tamanho__label" id="tamanho-label">TAMANHO</span>
        <span className={`tamanho__status${erro ? ' is-erro' : ''}`} aria-live="polite">{status}</span>
      </div>
      <div className={`sizes${erro ? ' is-erro' : ''}`} role="group" aria-labelledby="tamanho-label">
        {tamanhos.map((t, i) => (
          <button
            key={t}
            ref={i === 0 ? refPrimeiro : undefined}
            type="button"
            className="size"
            aria-pressed={t === valor}
            onClick={() => onEscolher(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {onVerMedidas && (
        <button type="button" className="link-btn" onClick={onVerMedidas}>Ver tabela de medidas</button>
      )}
    </div>
  );
}
