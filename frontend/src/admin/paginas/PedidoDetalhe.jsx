import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, useCarregar } from '../api.js';
import Campo, { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function PedidoDetalhe() {
  const { id } = useParams();
  const { dados, erro, carregando } = useCarregar(`/pedidos/${encodeURIComponent(id)}`);
  const [salvo, setSalvo] = useState(null);
  const pedido = salvo ?? dados;

  return (
    <>
      <Cabecalho sobre="PEDIDO" titulo={pedido ? `#${pedido.codigo}` : 'Pedido'}>
        <Link className="btn" to="/admin/pedidos">Todos os pedidos</Link>
      </Cabecalho>
      <Alerta>{erro?.message}</Alerta>
      {carregando && !pedido && <p className="adm-texto">Carregando…</p>}
      {pedido && (
        <div className="adm-pedido">
          <div className="adm-pedido__principal">
            <section className="adm-bloco" aria-labelledby="pecas-titulo">
              <div className="adm-bloco__titulo">
                <h2 className="adm-subtitulo" id="pecas-titulo">Peças</h2>
                <span className="adm-texto">Feito em {dataHora(pedido.quando)}</span>
              </div>
              <ul className="adm-itens">
                {pedido.itens.map((i, n) => (
                  <li key={n} className="adm-item">
                    <div className="adm-miniatura">
                      {i.imagem ? <img src={i.imagem} alt="" loading="lazy" /> : <span>SEM FOTO</span>}
                    </div>
                    <div className="adm-item__info">
                      <strong>{i.qtd}x {i.nome}</strong>
                      <span className="adm-texto">{i.cor} · Tam. {i.tamanho} · {i.precoTexto} cada</span>
                      <span className="adm-item__links">
                        {i.linkPeca && <a href={i.linkPeca} target="_blank" rel="noopener">Ver no site ↗</a>}
                        {i.linkEditar && <Link to={i.linkEditar}>Editar peça</Link>}
                      </span>
                    </div>
                    <span className="adm-item__subtotal">{i.subtotalTexto}</span>
                  </li>
                ))}
              </ul>
              <div className="adm-total">
                <span>{pedido.rotuloPecas.toUpperCase()}</span>
                <strong>{pedido.totalTexto}</strong>
              </div>
            </section>

            <Mensagem texto={pedido.mensagem} />
          </div>

          <FormPedido key={pedido.id} pedido={pedido} onSalvo={setSalvo} />
        </div>
      )}
    </>
  );
}

const camposDoForm = (p) => ({ status: p.status, clienteNome: p.clienteNome, clienteContato: p.clienteContato, observacao: p.observacao });

function FormPedido({ pedido, onSalvo }) {
  const [form, setForm] = useState(() => camposDoForm(pedido));
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    setAviso('');
    try {
      const atualizado = await api.put(`/pedidos/${pedido.id}`, form);
      onSalvo(atualizado);
      setForm(camposDoForm(atualizado)); // mostra o que o servidor guardou (ex.: sem espaços sobrando)
      setAviso('Pedido atualizado.');
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="adm-bloco adm-pedido__lateral" onSubmit={salvar} noValidate>
      <h2 className="adm-subtitulo">Atendimento</h2>
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem}</Alerta>
      <Campo
        rotulo="Situação"
        opcoes={pedido.opcoesStatus}
        value={form.status}
        onChange={mudar('status')}
        erro={erros.status}
        ajuda="Novo: o cliente abriu o WhatsApp com o pedido. Confira se a mensagem chegou."
      />
      <Campo rotulo="Nome do cliente" value={form.clienteNome} onChange={mudar('clienteNome')} erro={erros.clienteNome} maxLength={80} autoComplete="off" />
      <Campo rotulo="Contato" value={form.clienteContato} onChange={mudar('clienteContato')} erro={erros.clienteContato} maxLength={80} autoComplete="off" ajuda="WhatsApp ou Instagram do cliente." />
      <Campo rotulo="Observações" multilinha value={form.observacao} onChange={mudar('observacao')} erro={erros.observacao} maxLength={1000} ajuda="Frete, pagamento, endereço de entrega…" />
      <button type="submit" className="btn btn--dark" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </form>
  );
}

function Mensagem({ texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sem permissão: o texto continua visível para copiar à mão */ }
  }

  return (
    <section className="adm-bloco" aria-labelledby="mensagem-titulo">
      <div className="adm-bloco__titulo">
        <h2 className="adm-subtitulo" id="mensagem-titulo">Mensagem do WhatsApp</h2>
        <button type="button" className="btn" onClick={copiar}>{copiado ? 'Copiada ✓' : 'Copiar'}</button>
      </div>
      <pre className="adm-mensagem">{texto}</pre>
    </section>
  );
}
