import ProdutoCard from './ProdutoCard.jsx';
import './ProdutoCard.css';

export default function ProdutoGrid({ produtos, variante }) {
  if (!produtos.length) return <p className="aviso">Nenhuma peça nesta coleção ainda.</p>;
  return (
    <div className={`grid${variante === 'compacta' ? ' grid--rel' : ''}`}>
      {produtos.map((p) => <ProdutoCard key={p.id} produto={p} />)}
    </div>
  );
}
