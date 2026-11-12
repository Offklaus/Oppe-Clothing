import { Link } from 'react-router';

/** Card da peça: mostra um lado e, ao passar o mouse, o outro. */
export default function ProdutoCard({ produto }) {
  const [frente, verso] = produto.faces;

  return (
    <Link className="card" to={`/produto/${produto.id}`}>
      <div className="card__media">
        <img
          className="card__img card__img--a"
          src={frente.img}
          alt={`Camiseta ${produto.nome}, ${produto.cor}, ${frente.lado.toLowerCase()}`}
          width="1000" height="1000" loading="lazy" decoding="async"
        />
        <img className="card__img card__img--b" src={verso.img} alt="" width="1000" height="1000" loading="lazy" decoding="async" />
        {produto.tag && <span className="card__tag">✦ {produto.tag}</span>}
      </div>
      <div className="card__info">
        <span className="card__name">{produto.nome}</span>
        <span className="card__price">{produto.precoTexto}</span>
        <span className="card__meta">
          {produto.cor}
          <span className="card__cat"> · {produto.colecao}</span>
        </span>
      </div>
    </Link>
  );
}
