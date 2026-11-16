import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { Alerta, Marcar } from './Campo.jsx';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const campos = (estoque) => Object.fromEntries(estoque.tamanhos.map((t) => [t.tamanho, String(t.quantidade)]));
const numeros = (estoque) => Object.fromEntries(estoque.tamanhos.map((t) => [t.tamanho, t.quantidade]));

/**
 * Estoque da peça por tamanho. Ao salvar, manda também os números que estavam na tela:
 * se entrou um pedido nesse meio-tempo, o servidor avisa em vez de apagar a reserva.
 */
export default function EstoqueProduto({ produto, onAtualizado }) {
  const [controla, setControla] = useState(produto.estoque.controla);
  const [valores, setValores] = useState(() => campos(produto.estoque));
  const [anteriores, setAnteriores] = useState(() => numeros(produto.estoque));
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [conflito, setConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function aplicar(p) {
    onAtualizado(p);
    setControla(p.estoque.controla);
    setValores(campos(p.estoque));
    setAnteriores(numeros(p.estoque));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMensagem('');
    setAviso('');
    setConflito(false);
    const quantidades = Object.fromEntries(Object.entries(valores).map(([t, v]) => [t, v === '' ? 0 : Number(v)]));
    try {
      aplicar(await api.put(`/produtos/${produto.id}/estoque`, { controla, quantidades, anteriores }));
      setAviso('Estoque salvo.');
    } catch (falha) {
      setMensagem(Object.values(falha.campos ?? {})[0] ?? falha.message);
      setConflito(falha.status === 409);
    } finally {
      setSalvando(false);
    }
  }

  async function recarregar() {
    try {
      aplicar(await api.get(`/produtos/${produto.id}`));
      setMensagem('');
      setConflito(false);
      setAviso('Números atualizados. Confira e salve de novo.');
    } catch (falha) {
      setMensagem(falha.message);
    }
  }

  return (
    <section className="adm-bloco" aria-labelledby="estoque-titulo">
      <div className="adm-bloco__titulo">
        <h2 className="adm-subtitulo" id="estoque-titulo">Estoque</h2>
        <span className="adm-texto">{produto.estoque.texto}</span>
      </div>
      <form onSubmit={salvar} noValidate className="adm-estoque-form">
        <Alerta tipo="ok">{aviso}</Alerta>
        <Alerta>{mensagem}</Alerta>
        {conflito && <button type="button" className="btn" onClick={recarregar}>Atualizar números</button>}

        <Marcar
          rotulo="Controlar estoque desta peça"
          ajuda="Cada pedido retira as peças; pedido cancelado devolve. Tamanho com 0 aparece como esgotado no site. Desmarcado, a peça vende sem limite."
          checked={controla}
          onChange={(e) => setControla(e.target.checked)}
        />

        <fieldset className="adm-estoque" disabled={!controla}>
          <legend className="visually-hidden">Quantidade por tamanho</legend>
          {Object.entries(valores).map(([tamanho, valor]) => (
            <label key={tamanho} className="adm-estoque__tamanho">
              <span>{tamanho}</span>
              <input
                className="adm-mini"
                type="number"
                inputMode="numeric"
                min={0}
                max={99999}
                step={1}
                value={valor}
                onChange={(e) => setValores((v) => ({ ...v, [tamanho]: e.target.value }))}
                aria-label={`Quantidade do tamanho ${tamanho}`}
              />
            </label>
          ))}
        </fieldset>

        <div className="adm-acoes">
          <button type="submit" className="btn btn--dark" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar estoque'}</button>
        </div>
      </form>

      {produto.movimentosEstoque.length > 0 && (
        <div className="adm-estoque__historico">
          <h3 className="adm-campo__ajuda">Últimas entradas e saídas</h3>
          <div className="adm-tabela-wrap">
            <table className="adm-tabela">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Tam.</th>
                  <th scope="col">Mudança</th>
                  <th scope="col">Ficou</th>
                  <th scope="col">Motivo</th>
                  <th scope="col" className="adm-ocultar-celular">Quem</th>
                </tr>
              </thead>
              <tbody>
                {produto.movimentosEstoque.map((m, n) => (
                  <tr key={n}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataHora(m.quando)}</td>
                    <td>{m.tamanho}</td>
                    <td className={m.entrada ? 'adm-estoque__entrada' : 'adm-estoque__saida'}>{m.variacaoTexto}</td>
                    <td>{m.saldo}</td>
                    <td>
                      {m.motivo}
                      {m.pedido && <> · <Link to={`/admin/pedidos/${m.pedido.id}`}>#{m.pedido.codigo}</Link></>}
                    </td>
                    <td className="adm-ocultar-celular">{m.quem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
