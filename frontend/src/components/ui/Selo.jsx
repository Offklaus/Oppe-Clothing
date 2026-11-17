import logoCru from '../../assets/logo-cru.png';

export default function Selo({ tamanho = 72, className = '' }) {
  return (
    <div className={`selo selo--${tamanho} ${className}`.trim()}>
      <img src={logoCru} alt="" width="564" height="447" />
    </div>
  );
}
