import ProdutoCard from './ProdutoCard.jsx';
import './ProdutoCard.css';

/** Grade de cards. variante="compacta" é a do "Combina com". */
export default function ProdutoGrid({ produtos, variante }) {
  if (!produtos.length) return <p className="aviso">Nenhuma peça nesta coleção ainda.</p>;
  return (
    <div className={`grid${variante === 'compacta' ? ' grid--rel' : ''}`}>
      {produtos.map((p) => <ProdutoCard key={p.id} produto={p} />)}
    </div>
  );
}
