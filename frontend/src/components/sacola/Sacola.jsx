import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSacola } from '../../context/SacolaContext.jsx';
import { calcularSacola, LINK_CONTATO_WHATSAPP } from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import Estrela from '../ui/Estrela.jsx';
import SacolaItem from './SacolaItem.jsx';
import FinalizarPedido from './FinalizarPedido.jsx';
import './Sacola.css';

const TITULOS = { sacola: 'Pedidos', dados: 'Finalizar pedido', criado: 'Pedido criado' };

/**
 * Gaveta "Pedidos": a sacola, o atalho para acompanhar um pedido e o passo a passo para finalizar.
 * 1. sacola → 2. dados de entrega (o servidor registra o pedido e gera o código) → 3. código + WhatsApp.
 * O servidor confere a sacola a cada mudança: junta repetidos, tira o que não existe mais e calcula os valores.
 */
export default function Sacola() {
  const {
    itens, aberta, fechar, etapa, setEtapa, alterarQtd, remover, esvaziar, substituir, ultimoPedido, registrarPedido
  } = useSacola();
  const [previa, setPrevia] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const refFechar = useRef(null);
  const chave = JSON.stringify(itens);
  const vazia = itens.length === 0;

  useEffect(() => {
    if (!aberta) return undefined;
    if (itens.length === 0) { setPrevia(null); return undefined; }
    const controle = new AbortController();
    calcularSacola(itens, controle.signal)
      .then((p) => {
        setPrevia(p);
        setFalhou(false);
        const conferidos = p.itens.map(({ id, tamanho, qtd }) => ({ id, tamanho, qtd }));
        if (JSON.stringify(conferidos) !== chave) substituir(conferidos);
      })
      .catch((e) => { if (e.name !== 'AbortError') setFalhou(true); });
    return () => controle.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, chave]);

  // sem peças não há o que finalizar
  useEffect(() => { if (etapa === 'dados' && vazia) setEtapa('sacola'); }, [etapa, vazia, setEtapa]);

  const tirar = (indice) => { remover(indice); refFechar.current?.focus(); };

  /** O servidor registrou o pedido: a sacola esvazia e o cliente vê o código. */
  const pedidoCriado = (pedido) => {
    registrarPedido(pedido);
    esvaziar();
    setEtapa('criado');
    refFechar.current?.focus();
  };

  return (
    <Modal aberto={aberta} onFechar={fechar} className="bag" rotuloId="bag-titulo">
      <div className="bag__inner">
        <div className="bag__head">
          <h2 className="bag__title" id="bag-titulo">{TITULOS[etapa] ?? TITULOS.sacola}</h2>
          <button ref={refFechar} type="button" className="icon-btn" onClick={fechar} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" stroke="#0E0E0E" strokeWidth="2.4" fill="none" /></svg>
          </button>
        </div>

        {etapa === 'criado' && ultimoPedido && <PedidoCriado pedido={ultimoPedido} onFechar={fechar} />}

        {etapa === 'dados' && !vazia && (
          <FinalizarPedido itens={itens} previa={previa} onVoltar={() => setEtapa('sacola')} onCriado={pedidoCriado} />
        )}

        {(etapa === 'sacola' || (etapa === 'criado' && !ultimoPedido)) && (
          <>
            <div className="bag__body">
              <Link className="bag__track" to="/acompanhar" onClick={fechar}>
                <span>Já fez um pedido?</span>
                <strong>Acompanhar pedido →</strong>
              </Link>

              <h3 className="bag__subtitle">Sua sacola</h3>
              {vazia && ultimoPedido && (
                <div className="bag__ultimo">
                  <span>Seu último pedido</span>
                  <strong className="bag__ultimo-codigo">#{ultimoPedido.codigo}</strong>
                  <div className="bag__ultimo-acoes">
                    {ultimoPedido.whatsappUrl && (
                      <a className="btn" href={ultimoPedido.whatsappUrl} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
                    )}
                    <Link className="btn" to={ultimoPedido.acompanharUrl} onClick={fechar}>Acompanhar</Link>
                  </div>
                </div>
              )}
              {vazia && (
                <div className="bag__empty">
                  <p>Sua sacola está vazia. Escolha uma peça no catálogo, ou fale direto com a gente no WhatsApp.</p>
                  <Link className="btn btn--dark btn--lg btn--block" to="/#catalogo" onClick={fechar}>Ver catálogo</Link>
                  <a className="btn btn--lg btn--block" href={LINK_CONTATO_WHATSAPP} target="_blank" rel="noopener">Falar no WhatsApp</a>
                </div>
              )}
              {!vazia && falhou && <p className="bag__note" role="alert">Não deu para atualizar a sacola. Confira sua conexão.</p>}
              {!vazia && !previa && !falhou && <p className="bag__note">Calculando…</p>}
              {!vazia && previa?.removidos.length > 0 && (
                <p className="bag__note" role="status">Algumas peças saíram da sacola porque não estão mais disponíveis.</p>
              )}
              {!vazia && previa && (
                <ul className="bag__list">
                  {previa.itens.map((item, i) => (
                    <SacolaItem
                      key={`${item.id}-${item.tamanho}`}
                      item={item}
                      onMais={() => alterarQtd(i, 1)}
                      onMenos={() => (item.qtd > 1 ? alterarQtd(i, -1) : tirar(i))}
                      onRemover={() => tirar(i)}
                      onAbrirPeca={fechar}
                    />
                  ))}
                </ul>
              )}
            </div>

            {!vazia && previa?.podeFinalizar && (
              <div className="bag__foot">
                <div className="bag__total">
                  <span className="bag__total-label">{previa.rotuloPecas}</span>
                  <span className="bag__total-value">{previa.totalTexto}</span>
                </div>
                <p className="bag__note">No próximo passo você informa seus dados de entrega. Frete e pagamento você combina com a loja pelo WhatsApp.</p>
                <button type="button" className="btn btn--dark btn--xl btn--block" onClick={() => setEtapa('dados')}>
                  <Estrela tamanho={16} cor="#E01E14" />
                  Finalizar pedido
                </button>
                <button type="button" className="bag__clear" onClick={() => { esvaziar(); refFechar.current?.focus(); }}>
                  Esvaziar sacola
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Passo 3: o pedido já está registrado; o cliente guarda o código e envia a mensagem pronta. */
function PedidoCriado({ pedido, onFechar }) {
  return (
    <div className="bag__body bag__criado" role="status">
      <div className="bag__codigo-caixa">
        <span className="bag__codigo-rotulo">Código do seu pedido</span>
        <strong className="bag__codigo">#{pedido.codigo}</strong>
      </div>
      <ol className="bag__passos">
        <li><strong>Envie o pedido no WhatsApp.</strong> A mensagem já vai pronta, com o código.</li>
        <li><strong>Combine o pagamento</strong> com a gente por lá.</li>
        <li><strong>Acompanhe o andamento</strong> em Pedidos → Acompanhar pedido.</li>
      </ol>
      {pedido.whatsappUrl && (
        <a className="btn btn--dark btn--xl btn--block" href={pedido.whatsappUrl} target="_blank" rel="noopener noreferrer">
          <Estrela tamanho={16} cor="#E01E14" />
          Enviar no WhatsApp
        </a>
      )}
      <Link className="btn btn--lg btn--block" to={pedido.acompanharUrl} onClick={onFechar}>Acompanhar pedido</Link>
      <Link className="bag__clear" to="/#catalogo" onClick={onFechar}>Continuar no catálogo</Link>
    </div>
  );
}
