import { Fragment } from 'react';
import Estrela from '../ui/Estrela.jsx';
import './Faixa.css';

const FRASES = ['Walk by faith', 'Not by sight', "It's never luck", "It's always God", 'Chaos also builds', 'I won again'];

/** Faixa vermelha corrida com as frases da marca (o grupo se repete para o loop não ter emenda). */
export default function Faixa({ frases = FRASES }) {
  const grupo = (chave) => (
    <div className="faixa__group" key={chave}>
      {frases.map((frase) => (
        <Fragment key={frase}>
          <span>{frase}</span>
          <Estrela tamanho={18} cor="#0E0E0E" />
        </Fragment>
      ))}
    </div>
  );

  return (
    <div className="faixa" aria-hidden="true">
      <div className="faixa__track">{[grupo('a'), grupo('b')]}</div>
    </div>
  );
}
