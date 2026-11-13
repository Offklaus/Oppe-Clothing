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
        {pedido && <a className="btn" href={pedido.acompanharUrl} target="_blank" rel="noopener">Ver como o cliente ↗</a>}
        <Link className="btn" to="/admin/pedidos">Todos os pedidos</Link>
      </Cabecalho>
      <Alerta>{erro?.message}</Alerta>
      {carregando && !pedido && <p className="adm-texto">Carregando…</p>}
      {pedido && (
        <div className="adm-pedido">
          <div className="adm-pedido__principal">
            <Cliente pedido={pedido} onSalvo={setSalvo} />

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

          <div className="adm-pedido__lateral">
            <FormPedido key={pedido.id} pedido={pedido} onSalvo={setSalvo} />
            <section className="adm-bloco" aria-labelledby="historico-titulo">
              <h2 className="adm-subtitulo" id="historico-titulo">Histórico</h2>
              <ol className="adm-historico">
                {pedido.historico.map((h, n) => (
                  <li key={n}><strong>{h.statusRotulo}</strong><span>{dataHora(h.quando)}</span></li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

/** Dados que o cliente informou ao finalizar (só o painel vê). A loja pode corrigir. */
function Cliente({ pedido, onSalvo }) {
  const { cliente } = pedido;
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <EditarEntrega
        pedido={pedido}
        onCancelar={() => setEditando(false)}
        onSalvo={(atualizado) => { onSalvo(atualizado); setEditando(false); }}
      />
    );
  }

  return (
    <section className="adm-bloco" aria-labelledby="cliente-titulo">
      <div className="adm-bloco__titulo">
        <h2 className="adm-subtitulo" id="cliente-titulo">Cliente e entrega</h2>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Corrigir dados</button>
      </div>
      <div className="adm-cliente">
        <div>
          <span className="adm-cliente__rotulo">Cliente</span>
          <strong>{cliente.nome || '—'}</strong>
          {cliente.email && <a href={`mailto:${cliente.email}`}>{cliente.email}</a>}
          {cliente.telefoneTexto && (
            cliente.linkWhatsapp
              ? <a href={cliente.linkWhatsapp} target="_blank" rel="noopener noreferrer">{cliente.telefoneTexto} · WhatsApp ↗</a>
              : <span>{cliente.telefoneTexto}</span>
          )}
        </div>
        <div>
          <span className="adm-cliente__rotulo">Endereço de entrega</span>
          {cliente.endereco.length
            ? <address>{cliente.endereco.map((linha, n) => <span key={n}>{linha}</span>)}</address>
            : <span className="adm-texto">Não informado.</span>}
        </div>
      </div>
    </section>
  );
}

/** Corrige nome, contato e endereço. O servidor valida com as mesmas regras do site. */
function EditarEntrega({ pedido, onCancelar, onSalvo }) {
  const [form, setForm] = useState(pedido.clienteEdicao);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const campo = (nome, rotulo, props = {}) => (
    <Campo rotulo={rotulo} value={form[nome]} onChange={mudar(nome)} erro={erros[nome]} autoComplete="off" {...props} />
  );

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    try {
      onSalvo(await api.put(`/pedidos/${pedido.id}`, { cliente: form }));
    } catch (falha) {
      const campos = {};
      for (const [chave, texto] of Object.entries(falha.campos ?? {})) campos[chave.replace(/^cliente\./, '')] = texto;
      setErros(campos);
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="adm-bloco" onSubmit={salvar} noValidate>
      <h2 className="adm-subtitulo">Corrigir dados de entrega</h2>
      <p className="adm-texto">Use quando o cliente avisar de um erro. O pedido continua com o mesmo código e a mesma situação.</p>
      <Alerta>{mensagem}</Alerta>
      <div className="adm-grade">
        {campo('nome', 'Nome completo', { maxLength: 80 })}
        {campo('email', 'E-mail', { tipo: 'email', maxLength: 254 })}
        {campo('telefone', 'WhatsApp', { tipo: 'tel', maxLength: 20 })}
        {campo('cep', 'CEP', { maxLength: 9 })}
        {campo('logradouro', 'Rua', { maxLength: 120 })}
        {campo('numero', 'Número', { maxLength: 20 })}
        {campo('complemento', 'Complemento', { maxLength: 80 })}
        {campo('bairro', 'Bairro', { maxLength: 80 })}
        {campo('cidade', 'Cidade', { maxLength: 80 })}
        <Campo
          rotulo="Estado"
          opcoes={[{ valor: '', rotulo: 'UF' }, ...pedido.ufs.map((uf) => ({ valor: uf, rotulo: uf }))]}
          value={form.uf}
          onChange={mudar('uf')}
          erro={erros.uf}
        />
      </div>
      <div className="adm-acoes">
        <button type="submit" className="btn btn--dark" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar dados'}</button>
        <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

const camposDoForm = (p) => ({ status: p.status, rastreio: p.rastreio, observacao: p.observacao });

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
      setAviso('Pedido atualizado. O cliente já vê a nova situação.');
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="adm-bloco" onSubmit={salvar} noValidate>
      <h2 className="adm-subtitulo">Andamento</h2>
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem}</Alerta>
      <Campo
        rotulo="Situação"
        opcoes={pedido.opcoesStatus}
        value={form.status}
        onChange={mudar('status')}
        erro={erros.status}
        ajuda="É o que o cliente vê em Acompanhar pedido: pagamento, preparação, envio e entrega."
      />
      <Campo
        rotulo="Código de rastreio"
        value={form.rastreio}
        onChange={mudar('rastreio')}
        erro={erros.rastreio}
        maxLength={60}
        autoComplete="off"
        ajuda="Aparece para o cliente quando o pedido estiver Enviado."
      />
      <Campo rotulo="Observações" multilinha value={form.observacao} onChange={mudar('observacao')} erro={erros.observacao} maxLength={1000} ajuda="Só a loja vê. Frete, forma de pagamento…" />
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
