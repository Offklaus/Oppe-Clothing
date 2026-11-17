export default function SeletorTamanho({ tamanhos, esgotados = [], valor, onEscolher, erro, refPrimeiro, onVerMedidas }) {
  const status = erro ? 'Escolha um tamanho antes de pedir' : valor ? `Escolhido: ${valor}` : 'Escolha um tamanho';
  const primeiroDisponivel = tamanhos.find((t) => !esgotados.includes(t));

  return (
    <div className="tamanho">
      <div className="tamanho__head">
        <span className="tamanho__label" id="tamanho-label">TAMANHO</span>
        <span className={`tamanho__status${erro ? ' is-erro' : ''}`} aria-live="polite">{status}</span>
      </div>
      <div className={`sizes${erro ? ' is-erro' : ''}`} role="group" aria-labelledby="tamanho-label">
        {tamanhos.map((t) => {
          const esgotado = esgotados.includes(t);
          return (
            <button
              key={t}
              ref={t === primeiroDisponivel ? refPrimeiro : undefined}
              type="button"
              className={`size${esgotado ? ' is-esgotado' : ''}`}
              aria-pressed={t === valor}
              aria-label={esgotado ? `${t}, esgotado` : undefined}
              title={esgotado ? 'Esgotado' : undefined}
              disabled={esgotado}
              onClick={() => onEscolher(t)}
            >
              {t}
            </button>
          );
        })}
      </div>
      {onVerMedidas && (
        <button type="button" className="link-btn" onClick={onVerMedidas}>Ver tabela de medidas</button>
      )}
    </div>
  );
}
