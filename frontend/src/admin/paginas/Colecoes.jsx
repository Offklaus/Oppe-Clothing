import { useState } from 'react';
import { api, useCarregar } from '../api.js';
import Campo, { Alerta, Cabecalho, Marcar } from '../componentes/Campo.jsx';

const VAZIA = { nome: '', chamada: '', frase: '', descricao: '', ordem: 0, ativa: true, slug: '' };

export default function Colecoes() {
  const { dados, erro, carregando, recarregar } = useCarregar('/colecoes');
  const [editando, setEditando] = useState(null); // null | 'nova' | id
  const [form, setForm] = useState(VAZIA);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  function abrir(colecao) {
    setErros({});
    setMensagem('');
    setAviso('');
    if (colecao) {
      setEditando(colecao.id);
      setForm({ nome: colecao.nome, chamada: colecao.chamada, frase: colecao.frase, descricao: colecao.descricao, ordem: colecao.ordem, ativa: colecao.ativa, slug: colecao.slug });
    } else {
      setEditando('nova');
      setForm(VAZIA);
    }
  }

  const mudar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    const corpo = { ...form, ordem: Number(form.ordem) || 0 };
    if (editando === 'nova') delete corpo.slug;
    try {
      const c = editando === 'nova' ? await api.post('/colecoes', corpo) : await api.put(`/colecoes/${editando}`, corpo);
      setAviso(`Coleção "${c.nome}" salva.`);
      setEditando(null);
      recarregar();
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(colecao) {
    if (!window.confirm(`Excluir a coleção "${colecao.nome}"?`)) return;
    setMensagem('');
    try {
      await api.del(`/colecoes/${colecao.id}`);
      setAviso(`Coleção "${colecao.nome}" excluída.`);
      if (editando === colecao.id) setEditando(null);
      recarregar();
    } catch (falha) {
      setMensagem(falha.message);
    }
  }

  return (
    <>
      <Cabecalho sobre="CATÁLOGO" titulo="Coleções">
        <button type="button" className="btn btn--dark" onClick={() => abrir(null)}>Nova coleção</button>
      </Cabecalho>
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem || erro?.message}</Alerta>

      {editando !== null && (
        <form className="adm-bloco" onSubmit={salvar} noValidate>
          <h2 className="adm-subtitulo">{editando === 'nova' ? 'Nova coleção' : 'Editar coleção'}</h2>
          <div className="adm-grade">
            <Campo rotulo="Nome" value={form.nome} onChange={mudar('nome')} erro={erros.nome} ajuda="Aparece nos filtros do catálogo." required maxLength={60} />
            <Campo rotulo="Chamada" value={form.chamada} onChange={mudar('chamada')} erro={erros.chamada} ajuda="Linha acima do nome na página da peça. Ex.: DROP 01 ✦ FAITH COLLECTION" maxLength={80} />
            <Campo rotulo="Frase de destaque" multilinha value={form.frase} onChange={mudar('frase')} erro={erros.frase} ajuda="Usada quando a coleção está em destaque na página inicial." maxLength={300} />
            <Campo rotulo="Descrição" multilinha value={form.descricao} onChange={mudar('descricao')} erro={erros.descricao} maxLength={300} />
            <Campo rotulo="Ordem" tipo="number" min={0} max={9999} value={form.ordem} onChange={mudar('ordem')} erro={erros.ordem} ajuda="Menor aparece primeiro." />
            {editando !== 'nova' && (
              <Campo rotulo="Endereço" value={form.slug} onChange={mudar('slug')} erro={erros.slug} ajuda={`Filtro: /?colecao=${form.slug || '…'}`} maxLength={80} />
            )}
            <Marcar rotulo="Ativa" ajuda="Coleção desativada esconde todas as peças dela do site." checked={form.ativa} onChange={mudar('ativa')} />
          </div>
          <div className="adm-acoes">
            <button type="submit" className="btn btn--dark" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" className="btn" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {carregando && !dados && <p className="adm-texto">Carregando…</p>}
      {dados && (
        <div className="adm-tabela-wrap">
          <table className="adm-tabela">
            <thead>
              <tr>
                <th scope="col">Coleção</th>
                <th scope="col">Peças</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.map((c) => (
                <tr key={c.id}>
                  <td className="adm-tabela__nome">{c.nome}<small>{c.chamada}</small></td>
                  <td>{c.totalProdutos}</td>
                  <td>
                    {c.ativa ? <span className="adm-selo adm-selo--ok">ATIVA</span> : <span className="adm-selo adm-selo--off">DESATIVADA</span>}
                  </td>
                  <td>
                    <div className="adm-acoes adm-acoes--fim">
                      <button type="button" className="btn" onClick={() => abrir(c)}>Editar</button>
                      <button
                        type="button"
                        className="btn btn--perigo"
                        onClick={() => excluir(c)}
                        disabled={!c.podeExcluir}
                        title={c.podeExcluir ? undefined : 'Mova ou exclua as peças desta coleção antes'}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
