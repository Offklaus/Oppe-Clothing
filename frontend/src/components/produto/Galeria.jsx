import { useState } from 'react';
import Selo from '../ui/Selo.jsx';

/** Foto grande da peça com miniaturas dos lados (a lista vem pronta do servidor). */
export default function Galeria({ produto }) {
  const [vista, setVista] = useState(0);
  const fotos = produto.galeria;
  const atual = fotos[vista] ?? fotos[0];

  return (
    <div className="produto__gallery">
      <div className="produto__main">
        {atual && (
          <img
            className="produto__main-img"
            src={atual.img}
            alt={`Camiseta ${produto.nome}, ${produto.cor}, ${atual.lado.toLowerCase()}`}
            width="1000" height="1000"
          />
        )}
        <Selo tamanho={64} />
      </div>
      {fotos.length > 1 && (
        <div className="thumbs" role="group" aria-label="Escolher vista">
          {fotos.map((f, i) => (
            <button
              key={f.img}
              type="button"
              className="thumb"
              aria-pressed={i === vista}
              aria-label={`Ver ${f.lado.toLowerCase()}`}
              onClick={() => setVista(i)}
            >
              <img src={f.img} alt="" width="1000" height="1000" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
