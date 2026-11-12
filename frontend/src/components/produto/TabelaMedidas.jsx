import Modal from '../ui/Modal.jsx';

export default function TabelaMedidas({ aberto, onFechar, medidas }) {
  return (
    <Modal aberto={aberto} onFechar={onFechar} className="modal" rotuloId="medidas-titulo">
      <div className="modal__inner">
        <div className="modal__head">
          <h2 className="modal__title" id="medidas-titulo">Tabela de medidas</h2>
          <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar tabela de medidas">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" stroke="#0E0E0E" strokeWidth="2.4" fill="none" /></svg>
          </button>
        </div>
        <table className="tabela">
          <thead>
            <tr>{medidas.colunas.map((c) => <th scope="col" key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {medidas.linhas.map((linha) => (
              <tr key={linha[0]}>{linha.map((v, i) => <td key={i}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="modal__note">Medidas da peça aberta, em centímetros. Modelagem oversized: na dúvida, fique com o seu tamanho de sempre.</p>
      </div>
    </Modal>
  );
}
