import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Campo, { Alerta, Cabecalho } from '../componentes/Campo.jsx';

const paraFormulario = (l) => ({
  whatsapp: l.whatsapp, instagram: l.instagram, precoPadrao: l.precoPadrao,
  tamanhos: l.tamanhos.join(', '),
  modelagem: l.modelagem, malha: l.malha, tecnicaEstampa: l.tecnicaEstampa, cuidados: l.cuidados, sobre: l.sobre,
  medidas: l.medidas, mensagens: l.mensagens,
  destaqueProdutoId: l.destaqueProdutoId == null ? '' : String(l.destaqueProdutoId),
  colecaoDestaqueId: l.colecaoDestaqueId == null ? '' : String(l.colecaoDestaqueId)
});

export default function Loja() {
  const [form, setForm] = useState(null);
  const [opcoes, setOpcoes] = useState({ produtos: [], colecoes: [] });
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  function carregar(l) {
    setForm(paraFormulario(l));
    setOpcoes(l.opcoes);
  }

  useEffect(() => {
    api.get('/loja').then(carregar).catch((e) => setMensagem(e.message));
  }, []);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const mudarMensagem = (campo) => (e) => setForm((f) => ({ ...f, mensagens: { ...f.mensagens, [campo]: e.target.value } }));

  // ---- tabela de medidas ----
  const medidas = form?.medidas ?? { colunas: [], linhas: [] };
  const definirMedidas = (m) => setForm((f) => ({ ...f, medidas: m }));
  const mudarColuna = (j, valor) => definirMedidas({ ...medidas, colunas: medidas.colunas.map((c, k) => (k === j ? valor : c)) });
  const mudarCelula = (i, j, valor) => definirMedidas({
    ...medidas, linhas: medidas.linhas.map((l, k) => (k === i ? l.map((c, m) => (m === j ? valor : c)) : l))
  });
  const novaLinha = () => definirMedidas({ ...medidas, linhas: [...medidas.linhas, medidas.colunas.map(() => '')] });
  const tirarLinha = (i) => definirMedidas({ ...medidas, linhas: medidas.linhas.filter((_, k) => k !== i) });
  const novaColuna = () => definirMedidas({ colunas: [...medidas.colunas, 'Nova medida'], linhas: medidas.linhas.map((l) => [...l, '']) });
  const tirarColuna = (j) => definirMedidas({
    colunas: medidas.colunas.filter((_, k) => k !== j), linhas: medidas.linhas.map((l) => l.filter((_, k) => k !== j))
  });

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    setAviso('');
    const corpo = {
      ...form,
      tamanhos: form.tamanhos.split(',').map((t) => t.trim()).filter(Boolean),
      destaqueProdutoId: form.destaqueProdutoId ? Number(form.destaqueProdutoId) : null,
      colecaoDestaqueId: form.colecaoDestaqueId ? Number(form.colecaoDestaqueId) : null
    };
    try {
      carregar(await api.put('/loja', corpo));
      setAviso('Configurações salvas. O site já mostra as mudanças.');
    } catch (falha) {
      setErros(falha.campos ?? {});
      setMensagem(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!form) {
    return (
      <>
        <Cabecalho sobre="CONFIGURAÇÕES" titulo="Loja" />
        <Alerta>{mensagem}</Alerta>
        {!mensagem && <p className="adm-texto">Carregando…</p>}
      </>
    );
  }

  const erroDe = (prefixo) => Object.entries(erros).find(([k]) => k === prefixo || k.startsWith(`${prefixo}.`))?.[1];

  return (
    <>
      <Cabecalho sobre="CONFIGURAÇÕES" titulo="Loja" />
      <Alerta tipo="ok">{aviso}</Alerta>
      <Alerta>{mensagem}</Alerta>

      <form onSubmit={salvar} noValidate>
        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Contato e pedidos</h2>
          <div className="adm-grade">
            <Campo rotulo="WhatsApp que recebe os pedidos" tipo="tel" value={form.whatsapp} onChange={mudar('whatsapp')} erro={erros.whatsapp} ajuda="DDD + número. Ex.: (35) 99765-3327" />
            <Campo rotulo="Instagram" value={form.instagram} onChange={mudar('instagram')} erro={erros.instagram} ajuda="@usuario ou o link do perfil" />
            <Campo rotulo="Preço padrão (R$)" inputMode="decimal" value={form.precoPadrao} onChange={mudar('precoPadrao')} erro={erros.precoPadrao} ajuda='Usado nas peças sem preço próprio. Vazio = "Sob consulta".' placeholder="129,90" />
            <Campo rotulo="Tamanhos" value={form.tamanhos} onChange={mudar('tamanhos')} erro={erroDe('tamanhos')} ajuda="Separados por vírgula, na ordem em que aparecem." />
          </div>
        </section>

        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Mensagens do WhatsApp</h2>
          <div className="adm-grade">
            <Campo rotulo="Saudação" value={form.mensagens.saudacao} onChange={mudarMensagem('saudacao')} erro={erros['mensagens.saudacao']} maxLength={200} />
            <Campo rotulo="Abertura do pedido" value={form.mensagens.pedido} onChange={mudarMensagem('pedido')} erro={erros['mensagens.pedido']} maxLength={200} />
            <Campo rotulo="Fechamento do pedido" multilinha value={form.mensagens.fechamento} onChange={mudarMensagem('fechamento')} erro={erros['mensagens.fechamento']} maxLength={300} />
            <Campo rotulo="Mensagem do botão de contato" multilinha value={form.mensagens.contato} onChange={mudarMensagem('contato')} erro={erros['mensagens.contato']} maxLength={300} />
          </div>
        </section>

        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Ficha técnica (todas as peças)</h2>
          <div className="adm-grade">
            <Campo rotulo="Modelagem" value={form.modelagem} onChange={mudar('modelagem')} erro={erros.modelagem} maxLength={200} />
            <Campo rotulo="Malha" value={form.malha} onChange={mudar('malha')} erro={erros.malha} ajuda="Composição e gramatura. Ex.: 100% algodão, 30.1 penteado" maxLength={200} />
            <Campo rotulo="Técnica de estampa" value={form.tecnicaEstampa} onChange={mudar('tecnicaEstampa')} erro={erros.tecnicaEstampa} ajuda="Opcional. Ex.: Silk, DTF" maxLength={60} />
            <Campo rotulo="Cuidados" value={form.cuidados} onChange={mudar('cuidados')} erro={erros.cuidados} maxLength={200} />
          </div>
        </section>

        <section className="adm-bloco">
          <div className="adm-bloco__titulo">
            <h2 className="adm-subtitulo">Tabela de medidas</h2>
            <div className="adm-acoes">
              <button type="button" className="btn" onClick={novaLinha}>+ Linha</button>
              <button type="button" className="btn" onClick={novaColuna}>+ Coluna</button>
            </div>
          </div>
          {erroDe('medidas') && <span className="adm-campo__erro" role="alert">{erroDe('medidas')}</span>}
          <div className="adm-tabela-wrap">
            <table className="adm-medidas">
              <thead>
                <tr>
                  {medidas.colunas.map((c, j) => (
                    <th key={j} scope="col">
                      <input className="adm-mini" aria-label={`Nome da coluna ${j + 1}`} value={c} onChange={(e) => mudarColuna(j, e.target.value)} />
                      {medidas.colunas.length > 1 && (
                        <button type="button" className="adm-remover-mini" onClick={() => tirarColuna(j)} aria-label={`Remover coluna ${c}`}>×</button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {medidas.linhas.map((linha, i) => (
                  <tr key={i}>
                    {linha.map((valor, j) => (
                      <td key={j}>
                        <input className="adm-mini" aria-label={`${medidas.colunas[j]}, linha ${i + 1}`} value={valor} onChange={(e) => mudarCelula(i, j, e.target.value)} />
                      </td>
                    ))}
                    <td><button type="button" className="adm-remover-mini" onClick={() => tirarLinha(i)} aria-label={`Remover linha ${i + 1}`}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="adm-bloco">
          <h2 className="adm-subtitulo">Página inicial</h2>
          <div className="adm-grade">
            <Campo rotulo="Sobre a Oppe" multilinha className="adm-larga" value={form.sobre} onChange={mudar('sobre')} erro={erros.sobre} ajuda="Texto da seção “Sobre”." maxLength={600} />
            <Campo
              rotulo="Peça que abre o varal" opcoes={[{ valor: '', rotulo: 'A primeira do catálogo' }, ...opcoes.produtos.map((p) => ({ valor: String(p.id), rotulo: p.nome }))]}
              value={form.destaqueProdutoId} onChange={mudar('destaqueProdutoId')} erro={erros.destaqueProdutoId}
            />
            <Campo
              rotulo="Coleção em destaque" opcoes={[{ valor: '', rotulo: 'Nenhuma (esconde a seção)' }, ...opcoes.colecoes.map((c) => ({ valor: String(c.id), rotulo: c.nome }))]}
              value={form.colecaoDestaqueId} onChange={mudar('colecaoDestaqueId')} erro={erros.colecaoDestaqueId}
              ajuda="Mostra as duas primeiras peças dela na faixa preta."
            />
          </div>
        </section>

        <button type="submit" className="btn btn--dark btn--lg" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar configurações'}</button>
      </form>
    </>
  );
}
