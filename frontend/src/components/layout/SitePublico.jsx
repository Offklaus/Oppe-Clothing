import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { LojaProvider } from '../../context/LojaContext.jsx';
import { SacolaProvider } from '../../context/SacolaContext.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import Sacola from '../sacola/Sacola.jsx';
import Home from '../../pages/Home.jsx';
import ProdutoPage from '../../pages/ProdutoPage.jsx';
import AcompanharPage from '../../pages/AcompanharPage.jsx';
import NaoEncontrado from '../../pages/NaoEncontrado.jsx';

/** Ao trocar de página (sem âncora), volta para o topo. */
function RolarAoTopo() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
    // só reage à troca de página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}

/** O site da loja: cabeçalho, páginas, rodapé e sacola. */
export default function SitePublico() {
  const { pathname } = useLocation();
  const emProduto = pathname.startsWith('/produto/');

  return (
    <LojaProvider>
      <SacolaProvider>
        <a className="skip" href="#conteudo">Pular para o conteúdo</a>
        <RolarAoTopo />
        <Header />
        <main id="conteudo">
          <Routes>
            <Route index element={<Home />} />
            <Route path="produto/:id" element={<ProdutoPage />} />
            <Route path="acompanhar" element={<AcompanharPage />} />
            <Route path="*" element={<NaoEncontrado />} />
          </Routes>
        </main>
        <Footer compacto={emProduto} />
        <Sacola />
      </SacolaProvider>
    </LojaProvider>
  );
}
