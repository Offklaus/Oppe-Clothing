import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSacola } from '../context/SacolaContext.jsx';
import { buscarProduto, linkPedidoWhatsapp, novaChavePedido } from '../api/client.js';
import { useDados } from '../hooks/useDados.js';
import Estrela from '../components/ui/Estrela.jsx';
import Galeria from '../components/produto/Galeria.jsx';
import SeletorTamanho from '../components/produto/SeletorTamanho.jsx';
import FichaTecnica from '../components/produto/FichaTecnica.jsx';
import TabelaMedidas from '../components/produto/TabelaMedidas.jsx';
import Relacionados from '../components/produto/Relacionados.jsx';
import NaoEncontrado from './NaoEncontrado.jsx';
import '../components/produto/Produto.css';

export default function ProdutoPage() {
  const { id } = useParams();
  const { status, dados: produto, erro, recarregar } = useDados((sinal) => buscarProduto(id, sinal), [id]);

  if (status === 'erro') {
    if (erro?.status === 404) return <NaoEncontrado titulo="Peça não encontrada." />;
    return (
      <div className="container produto">
        <div className="aviso" role="alert">
          <span>Não deu para carregar a peça agora.</span>
          <button type="button" className="btn" onClick={recarregar}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!produto) return <div className="container produto"><p className="aviso">Carregando a peça…</p></div>;

  // key: ao ir de uma peça para outra, o tamanho escolhido zera
  return <DetalheProduto key={produto.id} produto={produto} />;
}

function DetalheProduto({ produto }) {
  const { adicionar, abrir } = useSacola();
  const [tamanho, setTamanho] = useState('');
  const [erroTamanho, setErroTamanho] = useState(false);
  const [medidasAbertas, setMedidasAbertas] = useState(false);
  const refPrimeiroTamanho = useRef(null);
  // um pedido por peça + tamanho: tocar de novo no botão reabre o mesmo pedido
  const chavePedido = useMemo(() => novaChavePedido(), [tamanho]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = `${produto.nome} (${produto.cor}) — Oppe Clothing`;
  }, [produto]);

  const escolher = (t) => { setTamanho(t); setErroTamanho(false); };
  const exigirTamanho = () => {
    if (tamanho) return true;
    setErroTamanho(true);
    refPrimeiroTamanho.current?.focus();
    return false;
  };

  return (
    <div className="container produto">
      <nav className="crumbs" aria-label="Caminho">
        <Link to="/#catalogo">Catálogo</Link>
        {' ✦ '}
        <Link to={{ pathname: '/', search: `?colecao=${encodeURIComponent(produto.colecaoSlug)}`, hash: '#catalogo' }}>{produto.colecao}</Link>
        {' ✦ '}
        <span aria-current="page">{produto.nome}</span>
      </nav>

      <div className="produto__grid">
        <Galeria produto={produto} />

        <div className="produto__info">
          <span className="eyebrow">{produto.chamada}</span>
          <h1 className="display produto__title">{produto.nome}</h1>
          <div className="produto__price-row">
            <span className="produto__price">{produto.precoTexto}</span>
            <span className="produto__cor">{produto.descricaoCor}</span>
          </div>
          {produto.frase && <p className="serif produto__quote">{produto.frase}</p>}
          {produto.referencia && <span className="produto__ref">{produto.referencia}</span>}

          <SeletorTamanho
            tamanhos={produto.tamanhos}
            valor={tamanho}
            onEscolher={escolher}
            erro={erroTamanho}
            refPrimeiro={refPrimeiroTamanho}
            onVerMedidas={produto.medidas ? () => setMedidasAbertas(true) : undefined}
          />

          <div className="produto__acoes">
            <a
              className="btn btn--dark btn--xl btn--block"
              href={tamanho ? linkPedidoWhatsapp([{ id: produto.id, tamanho, qtd: 1 }], chavePedido) : '#'}
              target="_blank"
              rel="noopener"
              onClick={(e) => { if (!exigirTamanho()) e.preventDefault(); }}
            >
              <Estrela tamanho={16} cor="#E01E14" />
              Pedir pelo WhatsApp
            </a>
            <button
              type="button"
              className="btn btn--lg btn--block"
              onClick={() => { if (exigirTamanho()) { adicionar(produto.id, tamanho); abrir(); } }}
            >
              Adicionar à sacola
            </button>
          </div>

          <FichaTecnica ficha={produto.ficha} />
        </div>
      </div>

      <Relacionados produtos={produto.relacionados} />

      {produto.medidas && (
        <TabelaMedidas aberto={medidasAbertas} onFechar={() => setMedidasAbertas(false)} medidas={produto.medidas} />
      )}
    </div>
  );
}
