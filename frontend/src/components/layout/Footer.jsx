import { Link } from 'react-router';
import { useLoja } from '../../context/LojaContext.jsx';
import { LINK_CONTATO_WHATSAPP } from '../../api/client.js';
import Estrela from '../ui/Estrela.jsx';
import Selo from '../ui/Selo.jsx';
import logoCru from '../../assets/logo-cru.png';
import './Footer.css';

const ano = new Date().getFullYear();

export default function Footer({ compacto = false }) {
  const { loja } = useLoja();

  if (compacto) {
    return (
      <footer className="footer footer--compact">
        <div className="container footer__inner">
          <img className="footer__logo" src={logoCru} alt="Oppe Clothing" width="91" height="72" loading="lazy" />
          <span className="footer__bottom">© {ano} OPPE CLOTHING ✦ STREETWEAR COM FÉ</span>
          <Selo tamanho={56} />
        </div>
      </footer>
    );
  }

  return (
    <footer id="contato" className="footer">
      <div className="container footer__inner">
        <div className="footer__top">
          <img className="footer__logo" src={logoCru} alt="Oppe Clothing" width="131" height="104" loading="lazy" />

          <a className="btn btn--cru btn--block footer__wa" href={LINK_CONTATO_WHATSAPP} target="_blank" rel="noopener">
            <Estrela tamanho={14} cor="#E01E14" />
            Pedir pelo WhatsApp
          </a>

          <div className="footer__col footer__col--contato">
            <span className="footer__label">CONTATO</span>
            <a href={LINK_CONTATO_WHATSAPP} target="_blank" rel="noopener">
              WhatsApp{loja?.whatsappExibicao ? ` ${loja.whatsappExibicao}` : ''}
            </a>
            {loja?.instagram && (
              <a href={loja.instagram.url} target="_blank" rel="noopener">Instagram {loja.instagram.usuario}</a>
            )}
          </div>

          <div className="footer__col footer__col--nav">
            <span className="footer__label">NAVEGAR</span>
            <Link to="/#catalogo">Catálogo</Link>
            {loja?.colecaoDestaque && <Link to="/#colecoes">Coleções</Link>}
            <Link to="/#sobre">Sobre</Link>
          </div>

          <Selo tamanho={72} className="footer__selo" />
        </div>
        <div className="footer__bottom">© {ano} OPPE CLOTHING ✦ STREETWEAR COM FÉ</div>
      </div>
    </footer>
  );
}
