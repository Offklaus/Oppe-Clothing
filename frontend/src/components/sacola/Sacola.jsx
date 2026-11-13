import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSacola } from '../../context/SacolaContext.jsx';
import { calcularSacola, LINK_CONTATO_WHATSAPP } from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import Estrela from '../ui/Estrela.jsx';
import SacolaItem from './SacolaItem.jsx';
import './Sacola.css';

/**
 * Gaveta lateral com as peças escolhidas.
 * O servidor confere a sacola a cada mudança: junta repetidos, tira o que não existe mais,
 * calcula os valores e devolve o link do pedido.
 */
export default function Sacola() {
  const { itens, aberta, fechar, alterarQtd, remover, esvaziar, substituir } = useSacola();
  const [previa, setPrevia] = useState(null);
  const [falhou, setFalhou] = useState(false);
  // link do último pedido enviado: a sacola esvazia, mas o cliente ainda pode reabrir o WhatsApp
  const [enviado, setEnviado] = useState(null);
  const refFechar = useRef(null);
  const chave = JSON.stringify(itens);

  useEffect(() => { if (!aberta) setEnviado(null); }, [aberta]);

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

  const tirar = (indice) => { remover(indice); refFechar.current?.focus(); };
  const vazia = itens.length === 0;

  /** O link abre o WhatsApp numa nova aba; logo depois a sacola esvazia. */
  const enviarPedido = () => {
    const link = previa.linkWhatsapp;
    setTimeout(() => {
      setEnviado(link);
      esvaziar();
      refFechar.current?.focus();
    }, 0);
  };

  return (
    <Modal aberto={aberta} onFechar={fechar} className="bag" rotuloId="bag-titulo">
      <div className="bag__inner">
        <div className="bag__head">
          <h2 className="bag__title" id="bag-titulo">Sua sacola</h2>
          <button ref={refFechar} type="button" className="icon-btn" onClick={fechar} aria-label="Fechar sacola">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" stroke="#0E0E0E" strokeWidth="2.4" fill="none" /></svg>
          </button>
        </div>

        <div className="bag__body">
          {vazia && enviado && (
            <div className="bag__empty" role="status">
              <p className="bag__sent">Pedido enviado!</p>
              <p>Agora é só continuar a conversa com a gente no WhatsApp para combinar frete e pagamento.</p>
              <a className="btn btn--lg btn--block" href={enviado} target="_blank" rel="noopener">
                Abrir o WhatsApp de novo
              </a>
              <Link className="btn btn--dark btn--lg btn--block" to="/#catalogo" onClick={fechar}>Continuar no catálogo</Link>
            </div>
          )}
          {vazia && !enviado && (
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

        {!vazia && previa?.linkWhatsapp && (
          <div className="bag__foot">
            <div className="bag__total">
              <span className="bag__total-label">{previa.rotuloPecas}</span>
              <span className="bag__total-value">{previa.totalTexto}</span>
            </div>
            <p className="bag__note">O pedido abre no WhatsApp com as peças e os tamanhos. Frete e pagamento você combina direto com a loja.</p>
            <a className="btn btn--dark btn--xl btn--block" href={previa.linkWhatsapp} target="_blank" rel="noopener" onClick={enviarPedido}>
              <Estrela tamanho={16} cor="#E01E14" />
              Enviar pedido no WhatsApp
            </a>
            <button type="button" className="bag__clear" onClick={() => { esvaziar(); refFechar.current?.focus(); }}>
              Esvaziar sacola
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
