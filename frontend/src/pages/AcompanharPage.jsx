import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { consultarPedido, LINK_CONTATO_WHATSAPP } from '../api/client.js';
import '../components/acompanhar/Acompanhar.css';

const diaMes = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dataCompleta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const LEITOR = { feita: 'concluída', atual: 'etapa atual', pendente: 'ainda não começou' };

/**
 * Acompanhar pedido: o cliente digita o código (ou chega pelo link da mensagem, ?codigo=...)
 * e vê o andamento. Sem login: o código é a chave, e a resposta não traz dados pessoais.
 */
export default function AcompanharPage() {
  const [params, setParams] = useSearchParams();
  const codigoNaUrl = params.get('codigo') ?? '';
  const [texto, setTexto] = useState(codigoNaUrl);
  const [estado, setEstado] = useState({ carregando: false, pedido: null, erro: '' });
  const refResultado = useRef(null);
  // só a consulta mais recente pode mudar a tela (uma resposta lenta e antiga não sobrescreve a nova)
  const ultimaConsulta = useRef(0);

  useEffect(() => { document.title = 'Acompanhar pedido — Oppe Clothing'; }, []);

  const consultar = useCallback(async (codigo) => {
    const esta = ++ultimaConsulta.current;
    setEstado({ carregando: true, pedido: null, erro: '' });
    try {
      const pedido = await consultarPedido(codigo);
      if (esta === ultimaConsulta.current) setEstado({ carregando: false, pedido, erro: '' });
    } catch (falha) {
      if (esta === ultimaConsulta.current) setEstado({ carregando: false, pedido: null, erro: falha.message });
    }
  }, []);

  // A URL manda: chegar pelo link da mensagem (…/acompanhar?codigo=…), pelo "Acompanhar" da gaveta
  // ou trocar o código estando já nesta página consulta de novo.
  useEffect(() => {
    setTexto(codigoNaUrl);
    if (codigoNaUrl) consultar(codigoNaUrl);
    else {
      ultimaConsulta.current += 1;
      setEstado({ carregando: false, pedido: null, erro: '' });
    }
  }, [codigoNaUrl, consultar]);

  useEffect(() => { if (estado.pedido) refResultado.current?.focus(); }, [estado.pedido]);

  function enviar(e) {
    e.preventDefault();
    const codigo = texto.trim();
    if (!codigo) {
      ultimaConsulta.current += 1;
      setEstado({ carregando: false, pedido: null, erro: 'Digite o código do pedido.' });
      return;
    }
    // mesmo código: consulta de novo (a URL não muda); outro código: a URL muda e o efeito acima consulta
    if (codigo === codigoNaUrl) consultar(codigo);
    else setParams({ codigo }, { replace: true });
  }

  const { carregando, pedido, erro } = estado;

  return (
    <div className="container acompanhar">
      <div className="acompanhar__topo">
        <span className="eyebrow">PEDIDOS ✦ ACOMPANHAR</span>
        <h1 className="display acompanhar__titulo">Acompanhar pedido</h1>
        <p className="acompanhar__intro">
          Digite o código que aparece na mensagem do seu pedido no WhatsApp (ex.: K7Q2-MX9P).
        </p>
      </div>

      <form className="acompanhar__form" onSubmit={enviar} noValidate>
        <label className="visually-hidden" htmlFor="codigo-pedido">Código do pedido</label>
        <input
          id="codigo-pedido"
          className="acompanhar__campo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="CÓDIGO DO PEDIDO"
          maxLength={20}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? 'codigo-erro' : undefined}
        />
        <button type="submit" className="btn btn--dark btn--lg" disabled={carregando}>
          {carregando ? 'Consultando…' : 'Consultar'}
        </button>
      </form>
      {erro && <p className="acompanhar__erro" id="codigo-erro" role="alert">{erro}</p>}

      {pedido && (
        <section className="acompanhar__resultado" aria-labelledby="pedido-titulo" ref={refResultado} tabIndex={-1}>
          <div className="acompanhar__cabeca">
            <div>
              <span className="acompanhar__rotulo">Pedido</span>
              <h2 className="acompanhar__codigo" id="pedido-titulo">#{pedido.codigo}</h2>
              <span className="acompanhar__data">Feito em {dataCompleta(pedido.feitoEm)}</span>
            </div>
            <span className={`acompanhar__status acompanhar__status--${pedido.status}`}>{pedido.statusRotulo}</span>
          </div>
          <p className="acompanhar__resumo">{pedido.resumo}</p>

          {pedido.etapas.length > 0 && (
            <ol className="etapas">
              {pedido.etapas.map((e) => (
                <li key={e.chave} className={`etapa etapa--${e.estado}`} aria-current={e.estado === 'atual' ? 'step' : undefined}>
                  <span className="etapa__marca" aria-hidden="true">{e.estado === 'feita' ? '✓' : ''}</span>
                  <span className="etapa__rotulo">{e.rotulo}<span className="visually-hidden"> ({LEITOR[e.estado]})</span></span>
                  {e.texto && <span className="etapa__texto">{e.texto}</span>}
                  {e.data && <span className="etapa__data">{diaMes(e.data)}</span>}
                </li>
              ))}
            </ol>
          )}

          {pedido.rastreio && (
            <p className="acompanhar__rastreio">Código de rastreio: <strong>{pedido.rastreio}</strong></p>
          )}

          <div className="acompanhar__pecas">
            <h3 className="acompanhar__subtitulo">Peças</h3>
            <ul>
              {pedido.itens.map((i, n) => (
                <li key={n} className="acompanhar__peca">
                  <div className="acompanhar__foto">{i.imagem && <img src={i.imagem} alt="" loading="lazy" />}</div>
                  <div>
                    <strong>{i.qtd}x {i.nome}</strong>
                    <span>{i.cor} · Tam. {i.tamanho}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="acompanhar__total">
              <span>{pedido.rotuloPecas.toUpperCase()}</span>
              <strong>{pedido.totalTexto}</strong>
            </div>
          </div>

          <a className="btn btn--lg" href={LINK_CONTATO_WHATSAPP} target="_blank" rel="noopener">Falar com a loja no WhatsApp</a>
        </section>
      )}
    </div>
  );
}
