import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { SessaoProvider, useSessao } from './Sessao.jsx';
import Layout from './componentes/Layout.jsx';
import Login from './paginas/Login.jsx';
import Painel from './paginas/Painel.jsx';
import Produtos from './paginas/Produtos.jsx';
import ProdutoForm from './paginas/ProdutoForm.jsx';
import Colecoes from './paginas/Colecoes.jsx';
import Loja from './paginas/Loja.jsx';
import Usuarios from './paginas/Usuarios.jsx';
import Conta from './paginas/Conta.jsx';
import Atividade from './paginas/Atividade.jsx';
import './admin.css';

/** Painel em /admin. Carregado sob demanda: o código do painel não vai para quem só visita o site. */
export default function AdminApp() {
  useEffect(() => {
    document.title = 'Painel — Oppe Clothing';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  return (
    <SessaoProvider>
      <Portao />
    </SessaoProvider>
  );
}

function Portao() {
  const { status } = useSessao();
  if (status === 'verificando') return <p className="adm-carregando">Verificando acesso…</p>;
  if (status === 'anonimo') return <Login />;

  return (
    <Layout>
      <Routes>
        <Route index element={<Painel />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="produtos/novo" element={<ProdutoForm />} />
        <Route path="produtos/:id" element={<ProdutoForm />} />
        <Route path="colecoes" element={<Colecoes />} />
        <Route path="loja" element={<Loja />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="atividade" element={<Atividade />} />
        <Route path="conta" element={<Conta />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Layout>
  );
}
