import { useCarregar } from '../api.js';
import { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export default function Atividade() {
  const { dados, erro, carregando } = useCarregar('/auditoria');

  return (
    <>
      <Cabecalho sobre="SEGURANÇA" titulo="Atividade" />
      <p className="adm-texto" style={{ marginBottom: 20 }}>As últimas ações feitas no painel, inclusive tentativas de login que falharam.</p>
      <Alerta>{erro?.message}</Alerta>
      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && (
        <div className="adm-tabela-wrap">
          <table className="adm-tabela">
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">O quê</th>
                <th scope="col" className="adm-ocultar-celular">IP</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dataHora(a.quando)}</td>
                  <td>{a.usuario}</td>
                  <td>{a.descricao}</td>
                  <td className="adm-ocultar-celular">{a.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
