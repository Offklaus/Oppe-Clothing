import { Fragment } from 'react';
import { Link } from 'react-router';
import { useLoja } from '../../context/LojaContext.jsx';
import './ColecaoDestaque.css';

/** Faixa preta com a coleção escolhida no painel (Loja → Coleção em destaque). */
export default function ColecaoDestaque() {
  const { loja } = useLoja();
  const destaque = loja?.colecaoDestaque;
  if (!destaque) return null;

  return (
    <section id="colecoes" className="colecao" aria-labelledby="colecao-titulo">
      <div className="container colecao__inner">
        <span className="eyebrow eyebrow--dark colecao__eyebrow">{destaque.chamada}</span>
        <h2 className="display colecao__title" id="colecao-titulo" aria-label={destaque.titulo}>
          {destaque.produtos.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 && <><br />&amp; </>}
              {p.nome}
            </Fragment>
          ))}
        </h2>

        <div className="colecao__imgs">
          {destaque.produtos.map((p) => (
            <Link key={p.id} className="colecao__img" to={`/produto/${p.id}`}>
              <img src={p.faces[0].img} alt={`Camiseta ${p.nome}, ${p.faces[0].lado.toLowerCase()}`} width="1000" height="1000" loading="lazy" />
            </Link>
          ))}
        </div>

        {destaque.frase && <p className="serif colecao__quote">{destaque.frase}</p>}
        {destaque.descricao && <p className="colecao__text">{destaque.descricao}</p>}
        <Link
          className="btn btn--light btn--lg colecao__cta"
          to={{ pathname: '/', search: `?colecao=${encodeURIComponent(destaque.slug)}`, hash: '#catalogo' }}
        >
          Ver {destaque.produtos.length > 1 ? 'o par' : 'a coleção'}
        </Link>
      </div>
    </section>
  );
}
