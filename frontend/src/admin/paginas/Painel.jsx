import { Link } from 'react-router';
import { useCarregar } from '../api.js';
import { useSessao } from '../Sessao.jsx';
import { Alerta, Cabecalho } from '../componentes/Campo.jsx';

export default function Painel() {
  const { usuario } = useSessao();
  const { dados, erro, carregando } = useCarregar('/resumo');

  return (
    <>
      <Cabecalho sobre={`OLÁ, ${usuario.nome.toUpperCase()}`} titulo="Visão geral">
        <Link className="btn btn--dark" to="/admin/produtos/novo">Nova peça</Link>
        <Link className="btn" to="/admin/colecoes">Coleções</Link>
      </Cabecalho>
      <Alerta>{erro?.message}</Alerta>
      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && (
        <>
          <div className="adm-numeros">
            <Link className="adm-numero adm-numero--link" to="/admin/pedidos?status=novo">
              <strong>{dados.numeros.pedidosNovos}</strong><span>Pedidos novos →</span>
            </Link>
            <div className="adm-numero"><strong>{dados.numeros.pecasNoSite}</strong><span>Peças no site</span></div>
            <div className="adm-numero"><strong>{dados.numeros.pecasOcultas}</strong><span>Peças ocultas</span></div>
            <div className="adm-numero"><strong>{dados.numeros.colecoes}</strong><span>Coleções</span></div>
          </div>
          <section className="adm-bloco" aria-labelledby="pendencias-titulo">
            <h2 className="adm-subtitulo" id="pendencias-titulo">O que falta configurar</h2>
            {dados.pendencias.length === 0
              ? <p className="adm-texto">Tudo pronto. ✦</p>
              : (
                <ul className="adm-pendencias">
                  {dados.pendencias.map((p) => (
                    <li key={p.texto}>
                      <span>{p.texto}</span>
                      {p.link && <Link className="btn" to={p.link}>Resolver</Link>}
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </>
      )}
    </>
  );
}
