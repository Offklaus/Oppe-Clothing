import { Link } from 'react-router';

/** Uma linha da sacola, com os valores já calculados pelo servidor. */
export default function SacolaItem({ item, onMais, onMenos, onRemover, onAbrirPeca }) {
  const destino = `/produto/${item.id}`;

  return (
    <li className="bag-item">
      <Link className="bag-item__img" to={destino} tabIndex={-1} aria-hidden="true" onClick={onAbrirPeca}>
        <img src={item.imagem} alt="" width="1000" height="1000" />
      </Link>
      <div className="bag-item__body">
        <Link className="bag-item__name" to={destino} onClick={onAbrirPeca}>{item.nome}</Link>
        <span className="bag-item__meta">{item.cor} · Tam. {item.tamanho} · {item.precoTexto}</span>
        <div className="bag-item__row">
          <div className="qty" role="group" aria-label={`Quantidade de ${item.nome}, tamanho ${item.tamanho}`}>
            <button type="button" onClick={onMenos} aria-label="Diminuir quantidade">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12H19" stroke="currentColor" strokeWidth="2.4" fill="none" /></svg>
            </button>
            <output aria-live="polite">{item.qtd}</output>
            <button type="button" onClick={onMais} aria-label="Aumentar quantidade" disabled={!item.podeAumentar}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12H19M12 5V19" stroke="currentColor" strokeWidth="2.4" fill="none" /></svg>
            </button>
          </div>
          <button type="button" className="bag-item__remove" onClick={onRemover}>REMOVER</button>
        </div>
      </div>
    </li>
  );
}
