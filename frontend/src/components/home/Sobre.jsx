import { useLoja } from '../../context/LojaContext.jsx';
import logoPreto from '../../assets/logo-preto.png';
import './Sobre.css';

const PILARES = ['MODELAGEM OVERSIZED', 'ESTAMPA FRENTE E COSTAS', 'PEDIDO PELO WHATSAPP'];

export default function Sobre() {
  const { loja } = useLoja();

  return (
    <section id="sobre" className="container sobre" aria-labelledby="sobre-titulo">
      <div className="sobre__logo">
        <img src={logoPreto} alt="Logo Oppe Clothing" width="564" height="447" loading="lazy" />
      </div>
      <div className="sobre__body">
        <span className="eyebrow">SOBRE A OPPE</span>
        <h2 className="sobre__title" id="sobre-titulo">
          <span className="display sobre__grito">
            Sem regras,<br className="sobre__quebra" />{' '}sem caminhos<br />
            apenas presença.
          </span>
          <span className="serif sobre__frase">Uma marca para quem cria o próprio movimento</span>
        </h2>
        {loja?.sobre && <p className="sobre__text">{loja.sobre}</p>}
        <ul className="sobre__list">
          {PILARES.map((p) => <li key={p}>✦ {p}</li>)}
        </ul>
      </div>
    </section>
  );
}
