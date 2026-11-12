import { Link } from 'react-router';
import { useLoja } from '../../context/LojaContext.jsx';
import Varal from './Varal.jsx';
import './Hero.css';

export default function Hero() {
  const { status, produtos, loja } = useLoja();

  return (
    <section id="topo" className="container hero" aria-labelledby="hero-titulo">
      <span className="eyebrow hero__tag">DROP 01 — FAITH COLLECTION</span>
      <h1 className="display hero__title" id="hero-titulo">Streetwear<br />com fé.</h1>
      <p className="serif hero__verse">Walk by faith, not by sight.</p>

      {status === 'pronto' && produtos.length > 0
        ? <Varal produtos={produtos} destaqueId={loja?.destaqueId} />
        : <div className="varal varal--vazio" aria-hidden="true" />}

      <p className="hero__text">
        Camisetas oversized com mensagens nas costas e o logo no peito. Escolha a sua e peça direto pelo WhatsApp.
      </p>
      <div className="hero__cta">
        <Link className="btn btn--dark btn--lg" to="/#catalogo">Ver catálogo</Link>
        <Link className="btn btn--lg" to="/#colecoes">Key &amp; Heart</Link>
      </div>
    </section>
  );
}
