import { Link, NavLink } from 'react-router';
import { useSessao } from '../Sessao.jsx';
import logoCru from '../../assets/logo-cru.png';

const LINKS = [
  ['/admin', 'Início', true],
  ['/admin/pedidos', 'Pedidos'],
  ['/admin/produtos', 'Peças'],
  ['/admin/colecoes', 'Coleções'],
  ['/admin/loja', 'Loja'],
  ['/admin/usuarios', 'Admins'],
  ['/admin/atividade', 'Atividade'],
  ['/admin/conta', 'Minha conta']
];

export default function Layout({ children }) {
  const { usuario, sair } = useSessao();

  return (
    <div className="adm">
      <aside className="adm__lateral">
        <Link to="/admin" className="adm__marca" aria-label="Painel Oppe Clothing — início">
          <img src={logoCru} alt="" width="564" height="447" />
          <span>PAINEL</span>
        </Link>
        <nav className="adm__nav" aria-label="Painel">
          {LINKS.map(([destino, rotulo, exato]) => (
            <NavLink key={destino} to={destino} end={exato}>{rotulo}</NavLink>
          ))}
        </nav>
        <div className="adm__rodape">
          <span className="adm__usuario">
            {usuario.nome}
            <small>{usuario.email}</small>
          </span>
          <a className="adm__link" href="/" target="_blank" rel="noopener">Ver o site ↗</a>
          <button type="button" className="btn btn--light" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="adm__conteudo" id="conteudo">{children}</main>
    </div>
  );
}
