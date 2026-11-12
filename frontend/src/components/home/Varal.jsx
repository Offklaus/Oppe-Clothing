import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { doisDigitos } from '../../lib/formato.js';
import './Varal.css';

const encaixar = (a) => Math.round(a / 180) * 180;

// transição da rotação da peça ativa em cada modo
const TRANSICAO = {
  parado: undefined, // usa a do CSS
  arrastando: 'none',
  trocando: 'none',
  girando: 'transform 1.4s cubic-bezier(0.45, 0, 0.2, 1)'
};

/**
 * O varal: as peças penduradas balançam; a do centro é grande e gira em 3D
 * (arrastar, "ver frente/costas" ou "girar 360°").
 */
export default function Varal({ produtos, destaqueId }) {
  const n = produtos.length;
  const [idx, setIdx] = useState(() => Math.max(0, produtos.findIndex((p) => p.id === destaqueId)));
  const [angulo, setAngulo] = useState(0);
  const [modo, setModo] = useState('parado');
  const [deslocamento, setDeslocamento] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const raiz = useRef(null);
  const arraste = useRef(null);

  // as medidas vêm das variáveis CSS (--v-small, --v-active, --v-gap), que mudam no celular
  const medir = useCallback(() => {
    const el = raiz.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const ler = (nome, padrao) => parseFloat(cs.getPropertyValue(nome)) || padrao;
    setDeslocamento(idx * (ler('--v-small', 120) + ler('--v-gap', 28)) + ler('--v-active', 340) / 2);
  }, [idx]);

  useLayoutEffect(medir, [medir]);

  useEffect(() => {
    const quadro = requestAnimationFrame(() => setPronto(true));
    return () => cancelAnimationFrame(quadro);
  }, []);

  useEffect(() => {
    let espera;
    const aoRedimensionar = () => { clearTimeout(espera); espera = setTimeout(medir, 60); };
    window.addEventListener('resize', aoRedimensionar);
    return () => { window.removeEventListener('resize', aoRedimensionar); clearTimeout(espera); };
  }, [medir]);

  const ir = (i) => {
    const novo = (i + n) % n;
    arraste.current = null;
    setIdx(novo);
    setAngulo(0);
    setModo('trocando');
    const p = produtos[novo];
    setAnuncio(`${p.nome}, ${p.cor}. Peça ${novo + 1} de ${n}.`);
  };
  const virar = () => { setModo('parado'); setAngulo((a) => encaixar(a) + 180); };
  const girar = () => { setModo('girando'); setAngulo((a) => encaixar(a) + 360); };

  const aoPressionar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    arraste.current = { x: e.clientX, a: angulo };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    setModo('arrastando');
  };
  const aoMover = (e) => {
    const inicio = arraste.current;
    if (!inicio) return;
    const fator = window.matchMedia('(max-width: 759px)').matches ? 1.1 : 0.9;
    setAngulo(inicio.a + (e.clientX - inicio.x) * fator);
  };
  const aoSoltar = () => {
    if (!arraste.current) return;
    arraste.current = null;
    setModo('parado');
    setAngulo((a) => encaixar(a));
  };

  const atual = produtos[idx];
  const normal = ((angulo % 360) + 360) % 360;
  const lado = normal < 90 || normal > 270 ? 0 : 1;

  return (
    <div className="varal" ref={raiz} role="region" aria-roledescription="carrossel" aria-label="Varal de camisetas">
      <div className="varal__stage">
        <div className="varal__top">
          <span>O VARAL ✦ {doisDigitos(idx + 1)} / {n}</span>
          <span className="varal__hint">
            <span className="varal__hint-longa">ARRASTE A PEÇA PARA GIRAR</span>
            <span className="varal__hint-curta">ARRASTE PARA GIRAR</span>
          </span>
        </div>
        <div className="varal__rope" aria-hidden="true" />

        <ul
          className={`varal__track${pronto ? ' is-ready' : ''}`}
          aria-hidden="true"
          style={{ transform: `translateX(${-deslocamento}px)` }}
        >
          {produtos.map((p, i) => {
            const ativo = i === idx;
            const eventos = ativo ? {
              onPointerDown: aoPressionar,
              onPointerMove: aoMover,
              onPointerUp: aoSoltar,
              onPointerCancel: aoSoltar,
              onLostPointerCapture: aoSoltar
            } : {};
            return (
              <li
                key={p.id}
                className={`varal__item${ativo ? ' is-active' : ''}`}
                style={{ '--d': `${((i * 0.37) % 1.6).toFixed(2)}s` }}
              >
                <span className="pin pin--l" />
                <span className="pin pin--r" />
                <div className={`varal__card3d${ativo && modo === 'arrastando' ? ' is-dragging' : ''}`} {...eventos}>
                  <div
                    className="varal__rot"
                    style={{ transform: `rotateY(${ativo ? angulo : 0}deg)`, transition: ativo ? TRANSICAO[modo] : 'none' }}
                  >
                    <img className="face face--a" src={p.faces[0].img} alt="" draggable={false} width="1000" height="1000" />
                    <img className="face face--b" src={p.faces[1].img} alt="" draggable={false} width="1000" height="1000" />
                  </div>
                </div>
                {!ativo && (
                  <button
                    type="button"
                    className="varal__pick"
                    tabIndex={-1}
                    onClick={() => ir(i)}
                    aria-label={`Ver ${p.nome} (${p.cor}) no varal`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="varal__panel">
        <div className="varal__info">
          <span className="varal__meta">{atual.colecao.toUpperCase()} ✦ VENDO: {atual.faces[lado].lado.toUpperCase()}</span>
          <span className="varal__name">{atual.nome}</span>
          <div className="varal__row">
            <span className="varal__color">{atual.cor} · {atual.precoTexto}</span>
            <Link className="varal__link" to={`/produto/${atual.id}`} aria-label={`Ver a peça ${atual.nome}, ${atual.cor}`}>
              VER PEÇA ✦
            </Link>
          </div>
        </div>
        <div className="varal__controls">
          <button type="button" className="vbtn vbtn--icon" onClick={() => ir(idx - 1)} aria-label="Camiseta anterior">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5L8 12L15 19" stroke="#F2EEE3" strokeWidth="2.2" fill="none" /></svg>
          </button>
          <button type="button" className="vbtn" onClick={virar}>VER {atual.faces[1 - lado].lado.toUpperCase()}</button>
          <button type="button" className="vbtn" onClick={girar}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12A8 8 0 1 1 17.7 6.3M20 4V9H15" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
            GIRAR 360°
          </button>
          <button type="button" className="vbtn vbtn--icon" onClick={() => ir(idx + 1)} aria-label="Próxima camiseta">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L16 12L9 19" stroke="#F2EEE3" strokeWidth="2.2" fill="none" /></svg>
          </button>
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">{anuncio}</p>
    </div>
  );
}
