import { useEffect } from 'react';
import { Link } from 'react-router';

export default function NaoEncontrado({ titulo = 'Página não encontrada.' }) {
  useEffect(() => { document.title = 'Não encontrado — Oppe Clothing'; }, []);

  return (
    <div className="container nao-encontrada">
      <span className="eyebrow">ERRO ✦ 404</span>
      <h1 className="display h2">{titulo}</h1>
      <p className="serif nao-encontrada__frase">Talvez ela já tenha saído do varal.</p>
      <Link className="btn btn--dark btn--lg" to="/#catalogo">Ver catálogo</Link>
    </div>
  );
}
