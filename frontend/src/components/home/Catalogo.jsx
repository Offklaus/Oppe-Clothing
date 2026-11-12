import { useSearchParams } from 'react-router';
import { useLoja } from '../../context/LojaContext.jsx';
import { buscarProdutos } from '../../api/client.js';
import { useDados } from '../../hooks/useDados.js';
import ProdutoGrid from '../produto/ProdutoGrid.jsx';
import './Catalogo.css';

const SO_TODAS = [{ slug: '', nome: 'Todas' }];

/** Grade de peças. O filtro (?colecao=faith) é aplicado pelo servidor. */
export default function Catalogo() {
  const { loja } = useLoja();
  const [params, setParams] = useSearchParams();
  const filtro = params.get('colecao') ?? '';
  const { status, dados, recarregar } = useDados((sinal) => buscarProdutos(filtro, sinal), [filtro]);

  const escolher = (slug) => {
    setParams(slug ? { colecao: slug } : {}, { replace: true, preventScrollReset: true });
  };

  return (
    <section id="catalogo" className="container catalogo" aria-labelledby="catalogo-titulo">
      <div className="section-head">
        <div className="section-head__title">
          <span className="eyebrow">CATÁLOGO ✦ {dados?.rotuloTotal ?? '…'}</span>
          <h2 className="display h2" id="catalogo-titulo">Escolha sua mensagem.</h2>
        </div>
        <div className="chips" role="group" aria-label="Filtrar por coleção">
          {(loja?.filtros ?? SO_TODAS).map((f) => (
            <button key={f.slug || 'todas'} type="button" className="chip" aria-pressed={f.slug === filtro} onClick={() => escolher(f.slug)}>
              {f.nome}
            </button>
          ))}
        </div>
      </div>

      {status === 'carregando' && !dados && <p className="aviso">Carregando as peças…</p>}
      {status === 'erro' && (
        <div className="aviso" role="alert">
          <span>Não deu para carregar o catálogo agora.</span>
          <button type="button" className="btn" onClick={recarregar}>Tentar de novo</button>
        </div>
      )}
      {dados && <ProdutoGrid produtos={dados.produtos} />}
    </section>
  );
}
