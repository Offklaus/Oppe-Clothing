import { useId } from 'react';

/** Campo com rótulo, ajuda e a mensagem de erro que veio do servidor. */
export default function Campo({ rotulo, erro, ajuda, tipo = 'text', multilinha = false, opcoes, className = '', ...props }) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const descritores = [ajuda && idAjuda, erro && idErro].filter(Boolean).join(' ') || undefined;
  const comuns = { id, 'aria-invalid': erro ? true : undefined, 'aria-describedby': descritores, ...props };

  let controle;
  if (multilinha) controle = <textarea rows={3} {...comuns} />;
  else if (opcoes) {
    controle = (
      <select {...comuns}>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    );
  } else controle = <input type={tipo} {...comuns} />;

  return (
    <div className={`adm-campo${erro ? ' adm-campo--erro' : ''} ${className}`.trim()}>
      <label htmlFor={id}>{rotulo}</label>
      {controle}
      {ajuda && <span id={idAjuda} className="adm-campo__ajuda">{ajuda}</span>}
      {erro && <span id={idErro} className="adm-campo__erro">{erro}</span>}
    </div>
  );
}

export function Marcar({ rotulo, ajuda, ...props }) {
  const id = useId();
  return (
    <div className="adm-check">
      <input type="checkbox" id={id} {...props} />
      <label htmlFor={id}>{rotulo}{ajuda && <small>{ajuda}</small>}</label>
    </div>
  );
}

export function Alerta({ tipo = 'erro', children }) {
  if (!children) return null;
  return (
    <div className={`adm-alerta adm-alerta--${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Cabecalho({ titulo, children, sobre }) {
  return (
    <div className="adm-cabecalho">
      <div>
        {sobre && <span className="eyebrow">{sobre}</span>}
        <h1 className="adm-titulo">{titulo}</h1>
      </div>
      {children && <div className="adm-cabecalho__acoes">{children}</div>}
    </div>
  );
}
