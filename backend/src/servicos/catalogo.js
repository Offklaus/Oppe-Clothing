import * as repoProdutos from '../repos/produtos.js';
import * as repoColecoes from '../repos/colecoes.js';
import * as repoLoja from '../repos/loja.js';
import * as repoPedidos from '../repos/pedidos.js';
import * as repoEstoque from '../repos/estoque.js';
import { emTransacao } from '../db/pool.js';
import { ErroHttp, naoEncontrado } from '../erros.js';
import { urlDaImagem } from './armazenamento.js';
import {
  ESTOQUE_MAXIMO, LIMITE_QTD, UFS, centavosParaCampo, formatarCodigo, formatarWhatsapp, gerarSlug, normalizarInstagram, normalizarWhatsapp,
  paraCentavos, plural, precoTexto, temMarcador
} from './formatos.js';

const urlImagem = urlDaImagem;
const camposInvalidos = (campos) => new ErroHttp(400, 'Confira os campos destacados.', campos);

export const precoDoProduto = (p, loja) => p.preco_centavos ?? loja.preco_padrao_centavos ?? null;

export const disponivel = (p, tamanho) => (p.controla_estoque ? Number(p.estoque?.[tamanho] ?? 0) : null);

const tamanhosEsgotados = (p, loja) => (p.controla_estoque ? loja.tamanhos.filter((t) => disponivel(p, t) === 0) : []);

const pecaEsgotada = (p, loja) => p.controla_estoque && tamanhosEsgotados(p, loja).length === loja.tamanhos.length;

const fotoPrincipal = (p) => p.imagens.find((i) => i.posicao === 0) ?? null;

function faces(p) {
  const principal = fotoPrincipal(p);
  if (!principal) return [];
  const verso = p.imagens.find((i) => i.posicao === 1) ?? principal;
  return [principal, verso].map((i) => ({ img: urlImagem(i.arquivo), lado: i.lado }));
}

export function paraCard(p, loja) {
  return {
    id: p.slug,
    nome: p.nome,
    cor: p.cor,
    colecao: p.colecao_nome,
    colecaoSlug: p.colecao_slug,
    tag: p.tag,
    precoTexto: precoTexto(precoDoProduto(p, loja)),
    esgotado: pecaEsgotada(p, loja),
    faces: faces(p)
  };
}

function textoEstampa(p, loja) {
  let texto = p.estampa || (fotoPrincipal(p)?.lado === 'Costas'
    ? 'Estampa grande nas costas e logo no peito.'
    : 'Estampa na frente.');
  if (loja.tecnica_estampa) texto += ` ${loja.tecnica_estampa}.`;
  return texto;
}

const tabelaDeMedidas = (m) => (m?.colunas?.length && m?.linhas?.length ? m : null);

export async function lojaPublica(db) {
  const [loja, colecoes, visiveis] = await Promise.all([
    repoLoja.obter(db), repoColecoes.listarVisiveis(db), repoProdutos.listarVisiveis(db)
  ]);
  const aVendaPrimeiro = (lista) => [
    ...lista.filter((p) => !pecaEsgotada(p, loja)), ...lista.filter((p) => pecaEsgotada(p, loja))
  ];
  const escolhida = visiveis.find((p) => p.id === loja.destaque_produto_id);
  const destaque = aVendaPrimeiro(escolhida ? [escolhida, ...visiveis.filter((p) => p !== escolhida)] : visiveis)[0] ?? null;

  let colecaoDestaque = null;
  const colecao = colecoes.find((c) => c.id === loja.colecao_destaque_id);
  const pecas = aVendaPrimeiro(visiveis.filter((p) => p.colecao_id === loja.colecao_destaque_id)).slice(0, 2);
  if (colecao && pecas.length) {
    colecaoDestaque = {
      slug: colecao.slug,
      nome: colecao.nome,
      chamada: colecao.chamada || colecao.nome.toUpperCase(),
      titulo: pecas.map((p) => p.nome).join(' & '),
      frase: colecao.frase,
      descricao: colecao.descricao,
      produtos: pecas.map((p) => paraCard(p, loja))
    };
  }

  return {
    whatsappExibicao: formatarWhatsapp(loja.whatsapp_numero),
    instagram: loja.instagram ? { usuario: `@${loja.instagram}`, url: `https://www.instagram.com/${loja.instagram}/` } : null,
    sobre: loja.sobre,
    filtros: [{ slug: '', nome: 'Todas' }, ...colecoes.map((c) => ({ slug: c.slug, nome: c.nome }))],
    destaqueId: destaque?.slug ?? null,
    colecaoDestaque,
    qtdMaxima: LIMITE_QTD,
    ufs: UFS
  };
}

export async function listarParaSite(db, colecaoSlug) {
  const [loja, lista] = await Promise.all([
    repoLoja.obter(db), repoProdutos.listarVisiveis(db, { colecaoSlug: colecaoSlug || null })
  ]);
  return { produtos: lista.map((p) => paraCard(p, loja)), rotuloTotal: plural(lista.length, 'PEÇA', 'PEÇAS') };
}

export async function detalheParaSite(db, slug) {
  const p = await repoProdutos.visivelPorSlug(db, slug);
  if (!p) throw naoEncontrado('Peça');
  const [loja, todos] = await Promise.all([repoLoja.obter(db), repoProdutos.listarVisiveis(db)]);

  const outros = todos.filter((x) => x.id !== p.id);
  const relacionados = [
    ...outros.filter((x) => x.colecao_id === p.colecao_id),
    ...outros.filter((x) => x.colecao_id !== p.colecao_id)
  ].slice(0, 4);

  const galeria = [...new Map(p.imagens.map((i) => [i.arquivo, { img: urlImagem(i.arquivo), lado: i.lado }])).values()];
  const ficha = [
    ['MODELAGEM', loja.modelagem], ['MALHA', loja.malha], ['ESTAMPA', textoEstampa(p, loja)], ['CUIDADOS', loja.cuidados]
  ].filter(([, valor]) => valor).map(([rotulo, valor]) => ({ rotulo, valor }));

  return {
    ...paraCard(p, loja),
    descricaoCor: p.descricao_cor || p.cor,
    chamada: p.colecao_chamada || p.colecao_nome.toUpperCase(),
    frase: p.frase,
    referencia: p.referencia,
    galeria,
    ficha,
    tamanhos: loja.tamanhos,
    tamanhosEsgotados: tamanhosEsgotados(p, loja),
    medidas: tabelaDeMedidas(loja.medidas),
    relacionados: relacionados.map((x) => paraCard(x, loja))
  };
}

function pendenciasDaPeca(p, loja) {
  const lista = [];
  if (!fotoPrincipal(p)) lista.push('Sem foto principal');
  if (precoDoProduto(p, loja) == null) lista.push('Sem preço');
  if (!p.colecao_ativa) lista.push('Coleção desativada');
  const esgotados = tamanhosEsgotados(p, loja);
  if (pecaEsgotada(p, loja)) lista.push('Esgotada');
  else if (esgotados.length) lista.push(`Esgotado: ${esgotados.join(', ')}`);
  return lista;
}

function estoqueDaPeca(p, loja) {
  const tamanhos = loja.tamanhos.map((tamanho) => ({ tamanho, quantidade: Number(p.estoque?.[tamanho] ?? 0) }));
  const total = tamanhos.reduce((s, t) => s + t.quantidade, 0);
  return {
    controla: p.controla_estoque,
    tamanhos,
    total,
    maximo: ESTOQUE_MAXIMO,
    texto: p.controla_estoque
      ? `${tamanhos.map((t) => `${t.tamanho} ${t.quantidade}`).join(' · ')} (${plural(total, 'peça', 'peças')})`
      : 'Não controlado'
  };
}

const visivelNoSite = (p) => p.ativo && p.colecao_ativa && Boolean(fotoPrincipal(p));

function paraAdminResumo(p, loja) {
  const principal = fotoPrincipal(p);
  return {
    id: p.id,
    nome: p.nome,
    cor: p.cor,
    colecao: p.colecao_nome,
    ativo: p.ativo,
    precoTexto: precoTexto(precoDoProduto(p, loja)),
    usaPrecoPadrao: p.preco_centavos == null && loja.preco_padrao_centavos != null,
    imagem: principal ? urlImagem(principal.arquivo) : null,
    visivelNoSite: visivelNoSite(p),
    urlNoSite: `/produto/${p.slug}`,
    estoqueTexto: estoqueDaPeca(p, loja).texto,
    pendencias: pendenciasDaPeca(p, loja)
  };
}

const MOTIVOS_ESTOQUE = { ajuste: 'Ajuste', pedido: 'Pedido', cancelamento: 'Pedido cancelado', reativacao: 'Pedido reativado' };

const paraMovimento = (m) => ({
  quando: m.criado_em,
  tamanho: m.tamanho,
  variacaoTexto: m.variacao > 0 ? `+${m.variacao}` : String(m.variacao),
  entrada: m.variacao > 0,
  saldo: m.saldo,
  motivo: MOTIVOS_ESTOQUE[m.motivo] ?? m.motivo,
  pedido: m.pedido_id ? { id: m.pedido_id, codigo: formatarCodigo(m.pedido_codigo) } : null,
  quem: m.usuario_nome ?? (m.motivo === 'pedido' ? 'Site' : '—')
});

function paraAdminDetalhe(p, loja) {
  return {
    id: p.id,
    slug: p.slug,
    nome: p.nome,
    cor: p.cor,
    descricaoCor: p.descricao_cor,
    colecaoId: p.colecao_id,
    tag: p.tag,
    preco: centavosParaCampo(p.preco_centavos),
    precoPadraoTexto: loja.preco_padrao_centavos == null ? null : precoTexto(loja.preco_padrao_centavos),
    frase: p.frase,
    referencia: p.referencia,
    estampa: p.estampa,
    estampaPadrao: textoEstampa({ ...p, estampa: '' }, { tecnica_estampa: '' }),
    ordem: p.ordem,
    ativo: p.ativo,
    imagens: [0, 1].map((posicao) => {
      const foto = p.imagens.find((i) => i.posicao === posicao);
      return {
        posicao,
        titulo: posicao === 0 ? 'Foto principal' : 'Outro lado',
        url: foto ? urlImagem(foto.arquivo) : null,
        lado: foto?.lado ?? (posicao === 0 ? 'Costas' : 'Frente'),
        podeRemover: posicao === 1 && Boolean(foto),
        podeEnviar: posicao === 0 || Boolean(fotoPrincipal(p))
      };
    }),
    visivelNoSite: visivelNoSite(p),
    urlNoSite: `/produto/${p.slug}`,
    estoque: estoqueDaPeca(p, loja),
    pendencias: pendenciasDaPeca(p, loja)
  };
}

export async function listarProdutosAdmin(db) {
  const [loja, lista] = await Promise.all([repoLoja.obter(db), repoProdutos.listarTodos(db)]);
  return lista.map((p) => paraAdminResumo(p, loja));
}

export async function produtoAdmin(db, id, { comMovimentos = false } = {}) {
  const p = await repoProdutos.porId(db, id);
  if (!p) throw naoEncontrado('Peça');
  const [loja, movimentos] = await Promise.all([repoLoja.obter(db), comMovimentos ? repoEstoque.movimentos(db, id) : null]);
  const detalhe = paraAdminDetalhe(p, loja);
  return movimentos ? { ...detalhe, movimentosEstoque: movimentos.map(paraMovimento) } : detalhe;
}

export async function salvarEstoque(pool, id, { controla, quantidades, anteriores = {} }, usuario) {
  const tem = Object.hasOwn;
  const resumo = await emTransacao(pool, async (db) => {
    const [p, loja] = await Promise.all([repoProdutos.dadosDoEstoque(db, id), repoLoja.obter(db)]);
    if (!p) throw naoEncontrado('Peça');

    const desconhecidos = Object.keys(quantidades).filter((t) => !loja.tamanhos.includes(t));
    if (desconhecidos.length) throw camposInvalidos({ quantidades: `Tamanho que a loja não vende: ${desconhecidos.join(', ')}.` });

    const atuais = {};
    const tocados = loja.tamanhos.filter((t) => tem(quantidades, t) || tem(anteriores, t)).map((tamanho) => ({ produtoId: id, tamanho }));
    for (const { tamanho } of repoEstoque.ordenarParaTravar(tocados)) atuais[tamanho] = await repoEstoque.travar(db, id, tamanho);

    const mudaram = loja.tamanhos.filter((t) => tem(anteriores, t) && anteriores[t] !== atuais[t]);
    if (mudaram.length) {
      throw new ErroHttp(409, `O estoque de ${mudaram.join(', ')} mudou enquanto você editava (entrou ou saiu um pedido). Confira os números e salve de novo.`);
    }

    const mudancas = [];
    for (const tamanho of loja.tamanhos) {
      if (!tem(quantidades, tamanho)) continue;
      const de = atuais[tamanho];
      const para = quantidades[tamanho];
      await repoEstoque.ajustar(db, { produtoId: id, tamanho, de, para, usuarioId: usuario?.id ?? null });
      if (de !== para) mudancas.push(`${tamanho} ${de}→${para}`);
    }
    if (controla !== p.controla_estoque) {
      await repoEstoque.definirControle(db, id, controla);
      mudancas.unshift(controla ? 'passou a controlar' : 'deixou de controlar');
    }
    return { nome: p.nome, cor: p.cor, mudancas };
  });
  return { produto: await produtoAdmin(pool, id, { comMovimentos: true }), resumo };
}

async function slugLivre(db, candidatos, emUso, excetoId) {
  for (const c of candidatos) {
    const slug = gerarSlug(c);
    if (!(await emUso(db, slug, excetoId))) return slug;
  }
  const base = gerarSlug(candidatos[0]).slice(0, 74);
  for (let n = 2; ; n++) {
    const slug = `${base}-${n}`;
    if (!(await emUso(db, slug, excetoId))) return slug;
  }
}

async function prepararPeca(db, dados, id = null) {
  if (!(await repoColecoes.porId(db, dados.colecaoId))) throw camposInvalidos({ colecaoId: 'Coleção não encontrada.' });
  const precoCentavos = paraCentavos(dados.preco, 'preco');

  let slug = dados.slug;
  if (slug) {
    if (await repoProdutos.slugEmUso(db, slug, id)) throw new ErroHttp(409, 'Esse endereço já é usado por outra peça.', { slug: 'Já existe uma peça com esse endereço.' });
  } else if (id) {
    slug = (await repoProdutos.porId(db, id)).slug;
  } else {
    slug = await slugLivre(db, [dados.nome, `${dados.nome} ${dados.cor}`], repoProdutos.slugEmUso, null);
  }
  return { ...dados, slug, precoCentavos };
}

export async function criarProduto(db, dados) {
  const id = await repoProdutos.inserir(db, await prepararPeca(db, dados));
  return produtoAdmin(db, id);
}

export async function atualizarProduto(db, id, dados) {
  if (!(await repoProdutos.existe(db, id))) throw naoEncontrado('Peça');
  await repoProdutos.atualizar(db, id, await prepararPeca(db, dados, id));
  return produtoAdmin(db, id);
}

export async function removerProduto(db, id) {
  const p = await repoProdutos.porId(db, id);
  if (!p) throw naoEncontrado('Peça');
  const arquivos = await repoProdutos.remover(db, id);
  return { nome: p.nome, cor: p.cor, arquivos };
}

function avisoDoDestaque(c) {
  if (!c.ativa) return 'Não aparece no site: a coleção está desativada.';
  if (!c.pecas_no_site) return 'Não aparece no site: nenhuma peça desta coleção está visível.';
  return null;
}

function paraColecaoAdmin(c, destaqueId) {
  const destaque = c.id === destaqueId;
  return {
    id: c.id, slug: c.slug, nome: c.nome, chamada: c.chamada, frase: c.frase, descricao: c.descricao,
    ordem: c.ordem, ativa: c.ativa, totalProdutos: c.total_produtos ?? 0,
    podeExcluir: (c.total_produtos ?? 0) === 0,
    destaque,
    podeDestacar: c.ativa,
    destaqueAviso: destaque ? avisoDoDestaque(c) : null
  };
}

export async function listarColecoesAdmin(db) {
  const [colecoes, loja] = await Promise.all([repoColecoes.listarTodas(db), repoLoja.obter(db)]);
  return colecoes.map((c) => paraColecaoAdmin(c, loja.colecao_destaque_id));
}

export async function destacarColecao(db, id) {
  const c = await repoColecoes.porId(db, id);
  if (!c) throw naoEncontrado('Coleção');
  if (!(await repoLoja.destacarColecao(db, id))) {
    throw new ErroHttp(409, `Ative a coleção "${c.nome}" antes de destacar.`);
  }
  return { colecao: c, colecoes: await listarColecoesAdmin(db) };
}

export async function tirarDestaque(db, id) {
  const c = await repoColecoes.porId(db, id);
  if (!c) throw naoEncontrado('Coleção');
  const mudou = await repoLoja.tirarColecaoDestaque(db, id);
  return { colecao: c, mudou, colecoes: await listarColecoesAdmin(db) };
}

async function prepararColecao(db, dados, id = null) {
  if (await repoColecoes.nomeEmUso(db, dados.nome, id)) {
    throw new ErroHttp(409, 'Já existe uma coleção com esse nome.', { nome: 'Já existe uma coleção com esse nome.' });
  }
  let slug = dados.slug;
  if (slug) {
    if (await repoColecoes.slugEmUso(db, slug, id)) throw new ErroHttp(409, 'Esse endereço já é usado.', { slug: 'Já existe uma coleção com esse endereço.' });
  } else if (id) {
    slug = (await repoColecoes.porId(db, id)).slug;
  } else {
    slug = await slugLivre(db, [dados.nome], repoColecoes.slugEmUso, null);
  }
  return { ...dados, slug };
}

async function colecaoAdmin(db, id) {
  const c = (await listarColecoesAdmin(db)).find((x) => x.id === id);
  if (!c) throw naoEncontrado('Coleção');
  return c;
}

export async function criarColecao(db, dados) {
  const id = await repoColecoes.inserir(db, await prepararColecao(db, dados));
  return colecaoAdmin(db, id);
}

export async function atualizarColecao(db, id, dados) {
  if (!(await repoColecoes.porId(db, id))) throw naoEncontrado('Coleção');
  await repoColecoes.atualizar(db, id, await prepararColecao(db, dados, id));
  return colecaoAdmin(db, id);
}

export async function removerColecao(db, id) {
  const c = await repoColecoes.porId(db, id);
  if (!c) throw naoEncontrado('Coleção');
  const total = await repoColecoes.contarProdutos(db, id);
  if (total > 0) {
    throw new ErroHttp(409, `A coleção "${c.nome}" tem ${plural(total, 'peça', 'peças')}. Mova ou exclua as peças antes de excluir a coleção.`);
  }
  await repoColecoes.remover(db, id);
  return c;
}

export async function lojaAdmin(db) {
  const [l, produtos] = await Promise.all([repoLoja.obter(db), repoProdutos.listarTodos(db)]);
  return {
    whatsapp: formatarWhatsapp(l.whatsapp_numero) ?? '',
    instagram: l.instagram ? `@${l.instagram}` : '',
    precoPadrao: centavosParaCampo(l.preco_padrao_centavos),
    tamanhos: l.tamanhos,
    modelagem: l.modelagem,
    malha: l.malha,
    tecnicaEstampa: l.tecnica_estampa,
    cuidados: l.cuidados,
    sobre: l.sobre,
    medidas: l.medidas,
    mensagens: { saudacao: '', pedido: '', fechamento: '', contato: '', ...l.mensagens },
    destaqueProdutoId: l.destaque_produto_id,
    opcoes: {
      produtos: produtos.map((p) => ({ id: p.id, nome: `${p.nome} — ${p.cor}` }))
    }
  };
}

export async function salvarLoja(db, dados) {
  const normalizado = {
    ...dados,
    whatsapp: normalizarWhatsapp(dados.whatsapp),
    instagram: normalizarInstagram(dados.instagram),
    precoPadraoCentavos: paraCentavos(dados.precoPadrao, 'precoPadrao'),
    tamanhos: dados.tamanhos.map((t) => t.toUpperCase())
  };
  if (normalizado.destaqueProdutoId && !(await repoProdutos.existe(db, normalizado.destaqueProdutoId))) {
    throw camposInvalidos({ destaqueProdutoId: 'Peça não encontrada.' });
  }
  await repoLoja.atualizar(db, normalizado);
  return lojaAdmin(db);
}

export async function resumoAdmin(db, { siteUrl, producao }) {
  const [loja, produtos, colecoes, pedidosPorStatus] = await Promise.all([
    repoLoja.obter(db), repoProdutos.listarTodos(db), repoColecoes.listarTodas(db), repoPedidos.contarPorStatus(db)
  ]);
  const pendencias = [];
  const avisar = (texto, link) => pendencias.push({ texto, link });
  const pedidosNovos = pedidosPorStatus.novo ?? 0;

  if (pedidosNovos) avisar(`${plural(pedidosNovos, 'pedido aguardando', 'pedidos aguardando')} pagamento.`, '/admin/pedidos?status=novo');
  const comEsgotado = produtos.filter((p) => p.ativo && tamanhosEsgotados(p, loja).length).length;
  if (comEsgotado) avisar(`${plural(comEsgotado, 'peça tem', 'peças têm')} tamanho esgotado. Reponha o estoque ou confira.`, '/admin/produtos');
  const destaqueEsgotado = produtos.find((p) => p.id === loja.destaque_produto_id && pecaEsgotada(p, loja));
  if (destaqueEsgotado) {
    avisar(`A peça em destaque (${destaqueEsgotado.nome}) está esgotada, então o varal abre em outra peça. Reponha o estoque ou escolha outro destaque.`, '/admin/loja');
  }

  if (!loja.whatsapp_numero) avisar('Cadastre o WhatsApp que recebe os pedidos.', '/admin/loja');
  const semPreco = produtos.filter((p) => precoDoProduto(p, loja) == null).length;
  if (semPreco) avisar(`${plural(semPreco, 'peça está', 'peças estão')} sem preço (aparecem como "Sob consulta").`, '/admin/produtos');
  const semFoto = produtos.filter((p) => !fotoPrincipal(p)).length;
  if (semFoto) avisar(`${plural(semFoto, 'peça está', 'peças estão')} sem foto principal e não aparecem no site.`, '/admin/produtos');
  if (!loja.malha || temMarcador(loja.malha)) avisar('Preencha a composição da malha.', '/admin/loja');
  if (temMarcador(JSON.stringify(loja.medidas))) avisar('Preencha a tabela de medidas.', '/admin/loja');
  if (!loja.sobre || temMarcador(loja.sobre)) avisar('Escreva a história da Oppe (seção Sobre).', '/admin/loja');
  if (producao && /localhost|127\.0\.0\.1/.test(siteUrl)) avisar('Configure SITE_URL com o domínio da loja no servidor.', null);

  return {
    numeros: {
      pedidosNovos,
      pecasNoSite: produtos.filter(visivelNoSite).length,
      pecasOcultas: produtos.filter((p) => !visivelNoSite(p)).length,
      colecoes: colecoes.length
    },
    pendencias
  };
}
