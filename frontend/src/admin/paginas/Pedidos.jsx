import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCarregar } from '../api.js';
import { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Lista de pedidos. Filtro e busca ficam na URL (o Início linka direto para "novos"). */
export default function Pedidos() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const busca = params.get('busca') ?? '';
  const [texto, setTexto] = useState(busca);

  const consulta = new URLSearchParams();
  if (status) consulta.set('status', status);
  if (busca) consulta.set('busca', busca);
  const { dados, erro, carregando } = useCarregar(`/pedidos${consulta.size ? `?${consulta}` : ''}`);

  function mudar(campo, valor) {
    const novos = new URLSearchParams(params);
    if (valor) novos.set(campo, valor);
    else novos.delete(campo);
    setParams(novos, { replace: true });
  }

  function buscar(e) {
    e.preventDefault();
    mudar('busca', texto.trim());
  }

  return (
    <>
      <Cabecalho sobre="VENDAS" titulo="Pedidos" />
      <p className="adm-texto adm-intro">
        Cada pedido entra aqui quando o cliente toca em enviar no site e o WhatsApp abre. Ache a conversa
        pelo código (ex.: #K7Q2MX) e atualize a situação conforme o atendimento.
      </p>
      <Alerta>{erro?.message}</Alerta>

      <div className="adm-barra">
        <div className="adm-filtros" role="group" aria-label="Filtrar por situação">
          {(dados?.filtros ?? [{ valor: '', rotulo: 'Todos' }]).map((f) => (
            <button
              key={f.valor || 'todos'}
              type="button"
              className="adm-filtro"
              aria-pressed={status === f.valor}
              onClick={() => mudar('status', f.valor)}
            >
              {f.rotulo}{f.total != null && <span>{f.total}</span>}
            </button>
          ))}
        </div>
        <form className="adm-busca" role="search" onSubmit={buscar}>
          <label className="visually-hidden" htmlFor="busca-pedido">Buscar por código ou cliente</label>
          <input
            id="busca-pedido"
            type="search"
            className="adm-mini"
            placeholder="Código ou cliente"
            maxLength={40}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="btn">Buscar</button>
          {busca && <button type="button" className="adm-link-botao" onClick={() => { setTexto(''); mudar('busca', ''); }}>Limpar</button>}
        </form>
      </div>

      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && dados.pedidos.length === 0 && (
        <p className="adm-texto adm-vazio">
          {busca || status ? 'Nenhum pedido encontrado com esse filtro.' : 'Nenhum pedido ainda. Eles aparecem aqui assim que um cliente enviar.'}
        </p>
      )}
      {dados && dados.pedidos.length > 0 && (
        <div className="adm-tabela-wrap">
          <table className="adm-tabela">
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Peças</th>
                <th scope="col">Total</th>
                <th scope="col" className="adm-ocultar-celular">Cliente</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.pedidos.map((p) => (
                <tr key={p.id}>
                  <td className="adm-tabela__nome">
                    <span className="adm-codigo">#{p.codigo}</span>
                    <small>{dataHora(p.quando)}</small>
                  </td>
                  <td>{p.resumo}<small className="adm-campo__ajuda"> · {p.rotuloPecas}</small></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.totalTexto}</td>
                  <td className="adm-ocultar-celular">{p.cliente || '—'}</td>
                  <td><span className={`adm-selo adm-status adm-status--${p.status}`}>{p.statusRotulo.toUpperCase()}</span></td>
                  <td><Link className="btn" to={`/admin/pedidos/${p.id}`} aria-label={`Abrir pedido ${p.codigo}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
