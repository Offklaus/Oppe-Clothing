import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const LADOS = ['Costas', 'Frente'];

/** Uma das duas fotos da peça: enviar, trocar, marcar o lado ou remover. */
export default function FotoProduto({ produtoId, foto, onAtualizado }) {
  const [lado, setLado] = useState(foto.lado);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const arquivoRef = useRef(null);

  useEffect(() => { setLado(foto.lado); }, [foto.lado]);

  async function enviar(arquivo, novoLado = lado) {
    setEnviando(true);
    setErro('');
    try {
      onAtualizado(await api.foto(produtoId, foto.posicao, novoLado, arquivo));
    } catch (e) {
      setErro(e.message);
      setLado(foto.lado);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  async function remover() {
    if (!window.confirm('Remover esta foto?')) return;
    setEnviando(true);
    setErro('');
    try {
      onAtualizado(await api.del(`/produtos/${produtoId}/imagens/${foto.posicao}`));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="adm-foto" aria-busy={enviando}>
      <strong className="eyebrow">{foto.titulo}</strong>
      <div className="adm-foto__img">
        {foto.url
          ? <img src={foto.url} alt={`${foto.titulo} (${foto.lado})`} />
          : <span className="adm-foto__vazia">{enviando ? 'ENVIANDO…' : 'SEM FOTO'}</span>}
      </div>

      <div className="adm-campo">
        <label htmlFor={`lado-${foto.posicao}`}>Lado da camiseta</label>
        <select
          id={`lado-${foto.posicao}`}
          value={lado}
          disabled={enviando}
          onChange={(e) => {
            setLado(e.target.value);
            if (foto.url) enviar(null, e.target.value);
          }}
        >
          {LADOS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="adm-acoes">
        <label className="adm-arquivo">
          <span className="btn btn--dark" aria-hidden="true">{enviando ? 'Enviando…' : foto.url ? 'Trocar foto' : 'Enviar foto'}</span>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={enviando || !foto.podeEnviar}
            aria-label={`${foto.url ? 'Trocar' : 'Enviar'} ${foto.titulo.toLowerCase()}`}
            onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
          />
        </label>
        {foto.podeRemover && (
          <button type="button" className="btn btn--perigo" onClick={remover} disabled={enviando}>Remover</button>
        )}
      </div>
      {!foto.podeEnviar && <span className="adm-campo__ajuda">Envie a foto principal primeiro.</span>}
      <span className="adm-campo__ajuda">JPG, PNG ou WebP até 5 MB. A foto é ajustada para 1000×1000.</span>
      {erro && <span className="adm-campo__erro" role="alert">{erro}</span>}
    </div>
  );
}
