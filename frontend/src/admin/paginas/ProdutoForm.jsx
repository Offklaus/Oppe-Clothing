import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, useCarregar } from '../api.js';
import Campo, { Alerta, Cabecalho, Marcar } from '../componentes/Campo.jsx';
import FotoProduto from '../componentes/FotoProduto.jsx';

const VAZIO = {
  nome: '', cor: '', descricaoCor: '', colecaoId: '', tag: '', preco: '',
  frase: '', referencia: '', estampa: '', ordem: 0, ativo: true, slug: ''
};

const paraFormulario = (p) => ({
  nome: p.nome, cor: p.cor, descricaoCor: p.descricaoCor, colecaoId: String(p.colecaoId), tag: p.tag,
  preco: p.preco, frase: p.frase, referencia: p.referencia, estampa: p.estampa, ordem: p.ordem, ativo: p.ativo, slug: p.slug
});

export default function ProdutoForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navegar = useNavigate();
  const { state } = useLocation();
  const colecoes = useCarregar('/colecoes');

  const [produto, setProduto] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState(state?.aviso ?? '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setErros({});
    setMensagem('');
    if (!editando) { setProduto(null); setForm(VAZIO); return; }
    api.get(`/produtos/${id}`)
      .then((p) => { setProduto(p); setForm(paraFormulario(p)); })
      .catch((e) => setMensagem(e.message));
  }, [id, editando]);

  const mudar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    setAviso('');
    const corpo = { ...form, colecaoId: Number(form.colecaoId) || 0, ordem: Number(form.ordem) || 0 };
    if (!editando) delete corpo.slug;
    try {
      if (editando) {
        const p = await api.put(`/produtos/${id}`, corpo);
        setProduto(p);
        setForm(paraFormulario(p));
        setAviso('Peça salva.');
      } else {
        const p = await api.post('/produtos', corpo);
        navegar(`/admin/produtos/${p.id}`, { replace: true, state: { aviso: 'Peça criada. Agora envie as fotos para ela aparecer no site.' } });
      }
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir a peça "${produto.nome}"? Isso não pode ser desfeito.`)) return;
    try {
      await api.del(`/produtos/${id}`);
      navegar('/admin/produtos', { replace: true });
    } catch (falha) {
      setMensagem(falha.message);
    }
  }

  const opcoesColecao = [
    { valor: '', rotulo: 'Escolha a coleção' },
    ...(colecoes.dados ?? []).map((c) => ({ valor: String(c.id), rotulo: c.ativa ? c.nome : `${c.nome} (desativada)` }))
  ];

  return (
    <>
      <Cabecalho sobre="PEÇAS" titulo={editando ? (produto ? `${produto.nome}` : 'Carregando…') : 'Nova peça'}>
        {produto?.visivelNoSite && <a className="btn" href={produto.urlNoSite} target="_blank" rel="noopener">Ver no site ↗</a>}
        <Link className="btn" to="/admin/produtos">Voltar</Link>
      </Cabecalho>

      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem}</Alerta>
      {produto?.pendencias.length > 0 && (
        <div className="adm-selos" style={{ marginBottom: 18 }}>
          {produto.pendencias.map((t) => <span key={t} className="adm-selo adm-selo--aviso">{t.toUpperCase()}</span>)}
        </div>
      )}

      <form onSubmit={salvar} noValidate>
        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Dados da peça</h2>
          <div className="adm-grade">
            <Campo rotulo="Nome da estampa" value={form.nome} onChange={mudar('nome')} erro={erros.nome} required maxLength={80} />
            <Campo rotulo="Cor" value={form.cor} onChange={mudar('cor')} erro={erros.cor} ajuda="Ex.: Preta / Ouro" required maxLength={60} />
            <Campo rotulo="Coleção" opcoes={opcoesColecao} value={form.colecaoId} onChange={mudar('colecaoId')} erro={erros.colecaoId} required />
            <Campo
              rotulo="Preço (R$)" inputMode="decimal" value={form.preco} onChange={mudar('preco')} erro={erros.preco}
              ajuda={produto?.precoPadraoTexto ? `Vazio = preço padrão (${produto.precoPadraoTexto}).` : 'Vazio = "Sob consulta".'}
              placeholder="129,90"
            />
            <Campo rotulo="Descrição da cor" value={form.descricaoCor} onChange={mudar('descricaoCor')} erro={erros.descricaoCor} ajuda="Opcional. Ex.: Cru com estampa vinho" maxLength={120} />
            <Campo rotulo="Selo" value={form.tag} onChange={mudar('tag')} erro={erros.tag} ajuda="Opcional. Ex.: NOVO" maxLength={20} />
          </div>
        </section>

        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Mensagem</h2>
          <div className="adm-grade">
            <Campo rotulo="Frase ou versículo" multilinha className="adm-larga" value={form.frase} onChange={mudar('frase')} erro={erros.frase} maxLength={300} />
            <Campo rotulo="Referência" value={form.referencia} onChange={mudar('referencia')} erro={erros.referencia} ajuda="Ex.: ROMANOS 12:21" maxLength={60} />
            <Campo
              rotulo="Estampa" value={form.estampa} onChange={mudar('estampa')} erro={erros.estampa}
              ajuda={`Vazio = "${produto?.estampaPadrao ?? 'texto padrão'}"`} maxLength={300}
            />
          </div>
        </section>

        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Exibição</h2>
          <div className="adm-grade">
            <Campo rotulo="Ordem" tipo="number" min={0} max={9999} value={form.ordem} onChange={mudar('ordem')} erro={erros.ordem} ajuda="Menor aparece primeiro dentro da coleção." />
            {editando && (
              <Campo rotulo="Endereço da peça" value={form.slug} onChange={mudar('slug')} erro={erros.slug} ajuda={`Aparece em /produto/${form.slug || '…'}`} maxLength={80} />
            )}
            <Marcar rotulo="Ativa" ajuda="Desmarque para esconder do site sem excluir." checked={form.ativo} onChange={mudar('ativo')} />
          </div>
        </section>

        <div className="adm-acoes" style={{ marginBottom: 32 }}>
          <button type="submit" className="btn btn--dark btn--lg" disabled={salvando}>{salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar peça'}</button>
          {editando && produto && <button type="button" className="btn btn--perigo btn--lg" onClick={excluir}>Excluir peça</button>}
        </div>
      </form>

      {editando && produto && (
        <section className="adm-bloco" aria-labelledby="fotos-titulo">
          <h2 className="adm-subtitulo" id="fotos-titulo">Fotos</h2>
          <p className="adm-texto">A foto principal aparece no catálogo e no varal. O outro lado aparece ao girar a peça.</p>
          <div className="adm-fotos">
            {produto.imagens.map((foto) => (
              <FotoProduto key={foto.posicao} produtoId={produto.id} foto={foto} onAtualizado={setProduto} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
