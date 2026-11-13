import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useSacola } from '../../context/SacolaContext.jsx';
import { plural } from '../../lib/formato.js';
import logoPreto from '../../assets/logo-preto.png';
import './Header.css';

const LINKS = [
  ['/#catalogo', 'Catálogo'],
  ['/#colecoes', 'Coleções'],
  ['/#sobre', 'Sobre'],
  ['/#contato', 'Contato']
];

export default function Header() {
  const { pecas, abrir } = useSacola();
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => { setMenuAberto(false); }, [pathname]);

  return (
    <>
      <div className="topbar">NOVO DROP ✦ FAITH COLLECTION</div>
      <header className={`header${menuAberto ? ' is-open' : ''}`}>
        <div className="container header__inner">
          <Link className="header__logo" to="/#topo" aria-label="Oppe Clothing — início">
            <img src={logoPreto} alt="Oppe Clothing" width="71" height="56" />
          </Link>

          <nav className="header__nav" id="menu-principal" aria-label="Principal">
            {LINKS.map(([destino, rotulo]) => (
              <Link key={destino} to={destino} onClick={() => setMenuAberto(false)}>{rotulo}</Link>
            ))}
          </nav>

          <div className="header__actions">
            <button
              type="button"
              className="btn btn--dark header__cta"
              onClick={() => abrir()}
              aria-label={pecas ? `Pedidos: sacola com ${plural(pecas, 'peça', 'peças')} e acompanhar pedido` : 'Pedidos: sacola e acompanhar pedido'}
            >
              <span>Pedidos</span>
              {pecas > 0 && <span className="bag-count">{pecas}</span>}
            </button>
            <button
              type="button"
              className="header__burger"
              aria-expanded={menuAberto}
              aria-controls="menu-principal"
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7H21M3 12H21M3 17H21" stroke="#0E0E0E" strokeWidth="2" fill="none" />
              </svg>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
