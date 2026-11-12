/** Modelagem, malha, estampa e cuidados, montados pelo servidor. */
export default function FichaTecnica({ ficha }) {
  if (!ficha?.length) return null;
  return (
    <dl className="ficha">
      {ficha.map(({ rotulo, valor }) => (
        <div className="ficha__row" key={rotulo}>
          <dt>{rotulo}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}
