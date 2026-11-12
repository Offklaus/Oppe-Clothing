import { Link } from 'react-router';
import { useCarregar } from '../api.js';
import { Alerta, Cabecalho } from '../componentes/Campo.jsx';

export default function Produtos() {
  const { dados, erro, carregando } = useCarregar('/produtos');

  return (
    <>
      <Cabecalho sobre="CATÁLOGO" titulo="Peças">
        <Link className="btn btn--dark" to="/admin/produtos/novo">Nova peça</Link>
      </Cabecalho>
      <Alerta>{erro?.message}</Alerta>
      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && (
        <div className="adm-tabela-wrap">
          <table className="adm-tabela">
            <thead>
              <tr>
                <th scope="col"><span className="visually-hidden">Foto</span></th>
                <th scope="col">Peça</th>
                <th scope="col" className="adm-ocultar-celular">Coleção</th>
                <th scope="col">Preço</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="adm-miniatura">
                      {p.imagem ? <img src={p.imagem} alt="" loading="lazy" /> : <span>SEM FOTO</span>}
                    </div>
                  </td>
                  <td className="adm-tabela__nome">{p.nome}<small>{p.cor}</small></td>
                  <td className="adm-ocultar-celular">{p.colecao}</td>
                  <td>{p.precoTexto}{p.usaPrecoPadrao && <small className="adm-campo__ajuda"> (padrão)</small>}</td>
                  <td>
                    <div className="adm-selos">
                      {p.visivelNoSite
                        ? <span className="adm-selo adm-selo--ok">NO SITE</span>
                        : <span className="adm-selo adm-selo--off">{p.ativo ? 'OCULTA' : 'DESATIVADA'}</span>}
                      {p.pendencias.map((t) => <span key={t} className="adm-selo adm-selo--aviso">{t.toUpperCase()}</span>)}
                    </div>
                  </td>
                  <td><Link className="btn" to={`/admin/produtos/${p.id}`} aria-label={`Editar ${p.nome} ${p.cor}`}>Editar</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
