import logoCru from '../../assets/logo-cru.png';

/** A etiqueta: quadrado vermelho com o logo cru. Tamanhos: 52, 56, 64 ou 72. */
export default function Selo({ tamanho = 72, className = '' }) {
  return (
    <div className={`selo selo--${tamanho} ${className}`.trim()}>
      <img src={logoCru} alt="" width="564" height="447" />
    </div>
  );
}
