import { Link } from 'react-router';
import ProdutoGrid from './ProdutoGrid.jsx';

/** "Combina com": a escolha das peças é feita pelo servidor. */
export default function Relacionados({ produtos }) {
  if (!produtos?.length) return null;
  return (
    <section className="relacionados" aria-labelledby="rel-titulo">
      <div className="section-head">
        <h2 className="display relacionados__title" id="rel-titulo">Combina com</h2>
        <Link className="relacionados__link" to="/#catalogo">VER CATÁLOGO COMPLETO ✦</Link>
      </div>
      <ProdutoGrid produtos={produtos} variante="compacta" />
    </section>
  );
}
