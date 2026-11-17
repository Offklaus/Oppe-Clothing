import { randomInt } from 'node:crypto';
import * as repoProdutos from '../repos/produtos.js';
import * as repoLoja from '../repos/loja.js';
import * as repoPedidos from '../repos/pedidos.js';
import { emTransacao } from '../db/pool.js';
import { ErroHttp, naoEncontrado } from '../erros.js';
import * as repoEstoque from '../repos/estoque.js';
import { disponivel, precoDoProduto } from './catalogo.js';
import { urlDaImagem } from './armazenamento.js';
import {
  LIMITE_QTD, UFS, formatarBRL, formatarCep, formatarCodigo, formatarWhatsapp, linkWhatsapp, plural, precoTexto
} from './formatos.js';

export const LIMITE_ITENS = 50;

export const STATUS = {
  novo: 'Aguardando pagamento',
  pago: 'Pagamento confirmado',
  em_preparacao: 'Em preparação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
};

const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const gerarCodigo = () => Array.from({ length: 8 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');

export { formatarCodigo };

export function normalizarCodigo(texto) {
  const limpo = String(texto ?? '').slice(0, 40).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return /^[2-9A-HJ-NP-Z]{6}$|^[2-9A-HJ-NP-Z]{8}$/.test(limpo) ? limpo : null;
}

function conferirLista(itens) {
  if (!Array.isArray(itens)) throw new ErroHttp(400, 'Pedido inválido.');
  if (itens.length > LIMITE_ITENS) throw new ErroHttp(400, 'Pedido grande demais.');
}

async function carregar(db, itens) {
  const slugs = [...new Set(itens.map((i) => (typeof i?.id === 'string' ? i.id.slice(0, 80) : '')).filter(Boolean))];
  const [produtos, loja] = await Promise.all([repoProdutos.visiveisPorSlugs(db, slugs), repoLoja.obter(db)]);
  return { mapa: new Map(produtos.map((p) => [p.slug, p])), loja };
}

function normalizar(itens, { mapa, loja }, estrito) {
  const linhas = new Map();
  const removidos = [];
  for (const item of itens) {
    const produto = mapa.get(item?.id);
    const tamanho = typeof item?.tamanho === 'string' ? item.tamanho : '';
    let qtd = Number(item?.qtd);
    let motivo = null;
    if (!produto) motivo = 'Peça indisponível';
    else if (!loja.tamanhos.includes(tamanho)) motivo = 'Tamanho indisponível';
    else if (!Number.isInteger(qtd) || qtd < 1 || (estrito && qtd > LIMITE_QTD)) motivo = 'Quantidade inválida';

    if (motivo) {
      if (estrito) throw new ErroHttp(400, produto ? `${motivo}: ${produto.nome}.` : `${motivo}. Volte à sacola e confira.`);
      removidos.push({ id: String(item?.id ?? '').slice(0, 80), tamanho: tamanho.slice(0, 8), motivo });
      continue;
    }
    qtd = Math.min(qtd, LIMITE_QTD);
    const chave = `${produto.slug}|${tamanho}`;
    const existente = linhas.get(chave);
    if (existente) existente.qtd = Math.min(LIMITE_QTD, existente.qtd + qtd);
    else linhas.set(chave, { produto, tamanho, qtd });
  }

  const conferidas = [];
  const avisos = [];
  for (const linha of linhas.values()) {
    const disp = disponivel(linha.produto, linha.tamanho);
    if (disp == null || linha.qtd <= disp) { conferidas.push(linha); continue; }
    if (estrito) throw semEstoque(`${linha.produto.nome} (${linha.tamanho})`, disp);
    if (disp === 0) {
      removidos.push({ id: linha.produto.slug, tamanho: linha.tamanho, motivo: 'Esgotado' });
    } else {
      avisos.push(`${linha.produto.nome} (${linha.tamanho}): ${restam(disp)}, a quantidade foi ajustada.`);
      conferidas.push({ ...linha, qtd: disp });
    }
  }
  return { linhas: conferidas, removidos, avisos };
}

const restam = (n) => (n === 1 ? 'só resta 1 peça' : `só restam ${n} peças`);

const semEstoque = (rotulo, disp) => new ErroHttp(409, disp
  ? `${rotulo}: ${restam(disp)}. Volte à sacola e ajuste a quantidade.`
  : `${rotulo} esgotou. Volte à sacola para tirar a peça.`);

function somar(linhas, loja) {
  let total = 0;
  let pecas = 0;
  let todosComPreco = true;
  for (const l of linhas) {
    const centavos = precoDoProduto(l.produto, loja);
    if (centavos == null) todosComPreco = false;
    else total += centavos * l.qtd;
    pecas += l.qtd;
  }
  return { pecas, totalCentavos: todosComPreco ? total : null };
}

export async function previa(db, itens) {
  conferirLista(itens);
  if (itens.length === 0) {
    return {
      itens: [], removidos: [], avisos: [], pecas: 0, rotuloPecas: plural(0, 'PEÇA', 'PEÇAS'), totalTexto: formatarBRL(0), podeFinalizar: false
    };
  }
  const contexto = await carregar(db, itens);
  const { linhas, removidos, avisos } = normalizar(itens, contexto, false);
  const { pecas, totalCentavos } = somar(linhas, contexto.loja);

  return {
    itens: linhas.map(({ produto, tamanho, qtd }) => {
      const centavos = precoDoProduto(produto, contexto.loja);
      const foto = produto.imagens.find((i) => i.posicao === 0);
      return {
        id: produto.slug,
        nome: produto.nome,
        cor: produto.cor,
        tamanho,
        qtd,
        imagem: urlDaImagem(foto.arquivo),
        precoTexto: precoTexto(centavos),
        podeAumentar: qtd < Math.min(LIMITE_QTD, disponivel(produto, tamanho) ?? LIMITE_QTD)
      };
    }),
    removidos,
    avisos,
    pecas,
    rotuloPecas: plural(pecas, 'PEÇA', 'PEÇAS'),
    totalTexto: totalCentavos == null ? 'A combinar' : formatarBRL(totalCentavos),
    podeFinalizar: linhas.length > 0
  };
}

function montarMensagem({ linhas, loja, pecas, totalCentavos, siteUrl, codigo, cliente }) {
  const M = loja.mensagens ?? {};
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const texto = [M.saudacao || 'Olá!', M.pedido || 'Quero fazer um pedido:', ''];
  for (const { produto, tamanho, qtd } of linhas) {
    const centavos = precoDoProduto(produto, loja);
    let linha = `✦ ${qtd}x ${produto.nome} (${produto.cor}) — Tam. ${tamanho}`;
    if (centavos != null) linha += ` — ${formatarBRL(centavos * qtd)}`;
    texto.push(linha);
    if (base) texto.push(`   ${base}/produto/${produto.slug}`);
  }
  if (totalCentavos != null) texto.push('', `Total (${plural(pecas, 'peça', 'peças')}): ${formatarBRL(totalCentavos)}`);
  texto.push(
    '',
    `Pedido: #${formatarCodigo(codigo)}`,
    `Nome: ${cliente.nome}`,
    `Entrega: ${cliente.cidade}/${cliente.uf} — CEP ${formatarCep(cliente.cep)}`
  );
  if (base) texto.push(`Acompanhe: ${base}/acompanhar?codigo=${codigo}`);
  if (M.fechamento) texto.push('', M.fechamento);
  return texto.join('\n');
}

const respostaDoPedido = (codigo, mensagem, loja, novo) => ({
  codigo: formatarCodigo(codigo),
  novo,
  whatsappUrl: linkWhatsapp(loja.whatsapp_numero, mensagem),
  acompanharUrl: `/acompanhar?codigo=${codigo}`
});

export async function criarPedido(pool, { chave, itens, cliente }, { siteUrl }) {
  const jaFeito = async () => {
    const existente = await repoPedidos.buscarPorChave(pool, chave);
    if (!existente) return null;
    if (existente.cliente_email !== cliente.email || existente.cliente_telefone !== cliente.telefone) {
      throw new ErroHttp(409, 'Não foi possível concluir este pedido. Recarregue a página e tente de novo.');
    }
    return respostaDoPedido(existente.codigo, existente.mensagem, await repoLoja.obter(pool), false);
  };
  const repetido = await jaFeito();
  if (repetido) return repetido;

  conferirLista(itens);
  if (itens.length === 0) throw new ErroHttp(400, 'Sua sacola está vazia.');
  const contexto = await carregar(pool, itens);
  const { linhas } = normalizar(itens, contexto, true);
  const { pecas, totalCentavos } = somar(linhas, contexto.loja);
  const copiaDasPecas = linhas.map(({ produto, tamanho, qtd }) => ({
    produtoId: produto.id, slug: produto.slug, nome: produto.nome, cor: produto.cor,
    tamanho, qtd, precoCentavos: precoDoProduto(produto, contexto.loja),
    reservado: Boolean(produto.controla_estoque)
  }));

  for (let tentativa = 1; ; tentativa++) {
    const codigo = gerarCodigo();
    const mensagem = montarMensagem({ linhas, loja: contexto.loja, pecas, totalCentavos, siteUrl, codigo, cliente });
    try {
      await emTransacao(pool, async (db) => {
        const { id: pedidoId } = await repoPedidos.criar(db, {
          codigo, chave, pecas, totalCentavos, mensagem, cliente, itens: copiaDasPecas
        });
        for (const peca of repoEstoque.ordenarParaTravar(copiaDasPecas.filter((x) => x.reservado))) {
          const saldo = await repoEstoque.retirar(db, { ...peca, motivo: 'pedido', pedidoId });
          if (saldo == null) {
            throw semEstoque(`${peca.nome} (${peca.tamanho})`, await repoEstoque.quantidade(db, peca.produtoId, peca.tamanho));
          }
        }
      });
      return respostaDoPedido(codigo, mensagem, contexto.loja, true);
    } catch (erro) {
      if (erro.code !== '23505') throw erro;
      if (erro.constraint === 'pedidos_chave_key') return jaFeito();
      if (tentativa >= 5) throw erro;
    }
  }
}

export async function linkContato(db) {
  const loja = await repoLoja.obter(db);
  return linkWhatsapp(loja.whatsapp_numero, loja.mensagens?.contato ?? '');
}

const ORDEM = ['novo', 'pago', 'em_preparacao', 'enviado', 'entregue'];

const ETAPAS = [
  { chave: 'pagamento', rotulo: 'Pagamento', ativa: 'novo', feita: 'pago', dataFeita: 'pago',
    textos: { atual: 'Aguardando pagamento', feita: 'Pagamento confirmado' } },
  { chave: 'preparacao', rotulo: 'Preparação', ativa: 'pago', feita: 'enviado', dataFeita: 'enviado',
    textos: { atual: 'Na fila de preparação', em_preparacao: 'Em preparação', feita: 'Pedido pronto' } },
  { chave: 'envio', rotulo: 'Envio', ativa: 'enviado', feita: 'entregue', dataFeita: 'enviado',
    textos: { atual: 'A caminho', feita: 'Enviado' } },
  { chave: 'entrega', rotulo: 'Entrega', ativa: 'entregue', feita: 'entregue', dataFeita: 'entregue',
    textos: { feita: 'Entregue' } }
];

const RESUMO_CLIENTE = {
  novo: 'Recebemos seu pedido. Combine o pagamento com a gente pelo WhatsApp.',
  pago: 'Pagamento confirmado! Seu pedido entrou na fila de preparação.',
  em_preparacao: 'Seu pedido está sendo preparado.',
  enviado: 'Seu pedido está a caminho.',
  entregue: 'Pedido entregue. Obrigado pela compra!',
  cancelado: 'Este pedido foi cancelado. Se tiver alguma dúvida, fale com a gente pelo WhatsApp.'
};

function etapasDoPedido(p) {
  const posicao = ORDEM.indexOf(p.status);
  const dataDe = (status) => p.eventos.findLast((e) => e.status === status)?.criado_em ?? null;
  return ETAPAS.map((etapa) => {
    let estado = 'pendente';
    if (posicao >= ORDEM.indexOf(etapa.feita)) estado = 'feita';
    else if (posicao >= ORDEM.indexOf(etapa.ativa)) estado = 'atual';
    let texto = '';
    if (estado === 'feita') texto = etapa.textos.feita;
    else if (estado === 'atual') texto = etapa.textos[p.status] ?? etapa.textos.atual;
    const data = estado === 'feita' ? dataDe(etapa.dataFeita) : estado === 'atual' ? dataDe(p.status) : null;
    return { chave: etapa.chave, rotulo: etapa.rotulo, estado, texto, data };
  });
}

const naoAchado = () => new ErroHttp(404, 'Não encontramos um pedido com esse código. Confira e tente de novo.');

export async function consultarPedido(db, texto) {
  const codigo = normalizarCodigo(texto);
  if (!codigo) throw naoAchado();
  const p = await repoPedidos.obterPorCodigo(db, codigo);
  if (!p) throw naoAchado();
  const cancelado = p.status === 'cancelado';
  return {
    codigo: formatarCodigo(p.codigo),
    feitoEm: p.criado_em,
    status: p.status,
    statusRotulo: STATUS[p.status],
    cancelado,
    resumo: RESUMO_CLIENTE[p.status],
    etapas: cancelado ? [] : etapasDoPedido(p),
    rastreio: ['enviado', 'entregue'].includes(p.status) && p.codigo_rastreio ? p.codigo_rastreio : null,
    itens: p.itens.map((i) => ({
      nome: i.nome,
      cor: i.cor,
      tamanho: i.tamanho,
      qtd: i.qtd,
      imagem: i.arquivo ? urlDaImagem(i.arquivo) : null
    })),
    rotuloPecas: plural(p.pecas, 'peça', 'peças'),
    totalTexto: p.total_centavos == null ? 'A combinar' : formatarBRL(Number(p.total_centavos))
  };
}

const opcoesStatus = () => Object.entries(STATUS).map(([valor, rotulo]) => ({ valor, rotulo }));
const totalTexto = (centavos) => (centavos == null ? 'A combinar' : formatarBRL(Number(centavos)));

function resumoDasPecas(itens) {
  const [primeira, ...resto] = itens;
  if (!primeira) return '';
  const texto = `${primeira.qtd}x ${primeira.nome} (${primeira.tamanho})`;
  return resto.length ? `${texto} + ${plural(resto.length, 'outra peça', 'outras peças')}` : texto;
}

export async function listarPedidosAdmin(db, { status, busca }) {
  const [linhas, contagem] = await Promise.all([
    repoPedidos.listar(db, { status: status ?? null, busca: busca || null }),
    repoPedidos.contarPorStatus(db)
  ]);
  const todos = Object.values(contagem).reduce((s, n) => s + n, 0);
  return {
    filtros: [
      { valor: '', rotulo: 'Todos', total: todos },
      ...opcoesStatus().map((o) => ({ ...o, total: contagem[o.valor] ?? 0 }))
    ],
    pedidos: linhas.map((p) => ({
      id: p.id,
      codigo: formatarCodigo(p.codigo),
      quando: p.criado_em,
      status: p.status,
      statusRotulo: STATUS[p.status],
      resumo: resumoDasPecas(p.itens),
      rotuloPecas: plural(p.pecas, 'peça', 'peças'),
      totalTexto: totalTexto(p.total_centavos),
      cliente: p.cliente_nome || (p.dados_apagados_em ? 'Dados apagados' : '')
    }))
  };
}

function enderecoEmLinhas(p) {
  if (!p.entrega_cep) return [];
  const rua = [p.entrega_logradouro, p.entrega_numero].filter(Boolean).join(', ');
  return [
    [rua, p.entrega_complemento].filter(Boolean).join(' — '),
    p.entrega_bairro,
    `${p.entrega_cidade}/${p.entrega_uf}`,
    `CEP ${formatarCep(p.entrega_cep)}`
  ].filter(Boolean);
}

const SITUACOES_QUE_PERMITEM_APAGAR = ['entregue', 'cancelado'];

function apagarDados(p) {
  if (p.dados_apagados_em) return null;
  const pode = SITUACOES_QUE_PERMITEM_APAGAR.includes(p.status);
  return {
    pode,
    ajuda: pode
      ? 'Apaga nome, e-mail, WhatsApp, endereço, mensagem, observações e rastreio. Ficam as peças, o valor e as datas. Não dá para desfazer.'
      : 'Disponível quando o pedido estiver entregue ou cancelado.'
  };
}

export async function pedidoAdmin(db, id) {
  const p = await repoPedidos.obter(db, id);
  if (!p) throw naoEncontrado('Pedido');
  const apagado = Boolean(p.dados_apagados_em);
  return {
    id: p.id,
    codigo: formatarCodigo(p.codigo),
    quando: p.criado_em,
    atualizadoEm: p.atualizado_em,
    status: p.status,
    statusRotulo: STATUS[p.status],
    opcoesStatus: opcoesStatus(),
    cliente: {
      nome: p.cliente_nome,
      email: p.cliente_email,
      telefoneTexto: formatarWhatsapp(p.cliente_telefone),
      linkWhatsapp: p.cliente_telefone ? `https://wa.me/${p.cliente_telefone}` : null,
      endereco: enderecoEmLinhas(p)
    },
    dadosApagadosEm: p.dados_apagados_em,
    apagarDados: apagarDados(p),
    clienteEdicao: apagado ? null : {
      nome: p.cliente_nome,
      email: p.cliente_email,
      telefone: formatarWhatsapp(p.cliente_telefone) ?? '',
      cep: formatarCep(p.entrega_cep),
      logradouro: p.entrega_logradouro,
      numero: p.entrega_numero,
      complemento: p.entrega_complemento,
      bairro: p.entrega_bairro,
      cidade: p.entrega_cidade,
      uf: p.entrega_uf
    },
    ufs: UFS,
    itens: p.itens.map((i) => ({
      nome: i.nome,
      cor: i.cor,
      tamanho: i.tamanho,
      qtd: i.qtd,
      precoTexto: precoTexto(i.preco_centavos),
      subtotalTexto: i.preco_centavos == null ? 'Sob consulta' : formatarBRL(i.preco_centavos * i.qtd),
      imagem: i.arquivo ? urlDaImagem(i.arquivo) : null,
      linkPeca: i.slug_atual && i.produto_ativo ? `/produto/${i.slug_atual}` : null,
      linkEditar: i.produto_id ? `/admin/produtos/${i.produto_id}` : null
    })),
    rotuloPecas: plural(p.pecas, 'peça', 'peças'),
    totalTexto: totalTexto(p.total_centavos),
    mensagem: p.mensagem,
    rastreio: p.codigo_rastreio,
    observacao: p.observacao,
    historico: p.eventos.map((e) => ({ statusRotulo: STATUS[e.status], quando: e.criado_em })).reverse(),
    acompanharUrl: `/acompanhar?codigo=${p.codigo}`
  };
}

export async function atualizarPedido(pool, id, dados, usuario = null) {
  if (!Object.values(dados).some((v) => v !== undefined)) throw new ErroHttp(400, 'Nada para alterar.');
  const mudou = await emTransacao(pool, async (db) => {
    const atual = await repoPedidos.travar(db, id);
    if (!atual) throw naoEncontrado('Pedido');
    if (dados.cliente && atual.dados_apagados_em) {
      throw new ErroHttp(409, 'Os dados do cliente deste pedido foram apagados e não podem ser preenchidos de novo.');
    }
    const mudouStatus = await repoPedidos.atualizar(db, id, dados, atual.status);
    if (mudouStatus && dados.status === 'cancelado') await devolverAoEstoque(db, id, usuario);
    else if (mudouStatus && atual.status === 'cancelado') await retirarDeNovo(db, id, usuario);
    return mudouStatus;
  });
  return { pedido: await pedidoAdmin(pool, id), mudouStatus: mudou };
}

export async function apagarDadosDoCliente(pool, id) {
  await emTransacao(pool, async (db) => {
    const atual = await repoPedidos.travar(db, id);
    if (!atual) throw naoEncontrado('Pedido');
    if (atual.dados_apagados_em) throw new ErroHttp(409, 'Os dados do cliente deste pedido já foram apagados.');
    if (!SITUACOES_QUE_PERMITEM_APAGAR.includes(atual.status)) {
      throw new ErroHttp(409, 'Só dá para apagar os dados de um pedido entregue ou cancelado.');
    }
    await repoPedidos.apagarDadosDoCliente(db, id);
  });
  return pedidoAdmin(pool, id);
}

async function pecasDoEstoque(db, pedidoId, incluir) {
  const itens = await repoPedidos.itensParaEstoque(db, pedidoId);
  return repoEstoque.ordenarParaTravar(itens.filter((i) => i.produto_id && incluir(i)).map((i) => ({ ...i, produtoId: i.produto_id })));
}

async function devolverAoEstoque(db, pedidoId, usuario) {
  for (const item of await pecasDoEstoque(db, pedidoId, (i) => i.reservado)) {
    await repoEstoque.devolver(db, {
      produtoId: item.produtoId, tamanho: item.tamanho, qtd: item.qtd,
      motivo: 'cancelamento', pedidoId, usuarioId: usuario?.id ?? null
    });
    await repoPedidos.marcarReservado(db, pedidoId, item.posicao, false);
  }
}

async function retirarDeNovo(db, pedidoId, usuario) {
  for (const item of await pecasDoEstoque(db, pedidoId, (i) => !i.reservado && i.controla_estoque)) {
    const saldo = await repoEstoque.retirar(db, {
      produtoId: item.produtoId, tamanho: item.tamanho, qtd: item.qtd,
      motivo: 'reativacao', pedidoId, usuarioId: usuario?.id ?? null
    });
    if (saldo == null) {
      const disp = await repoEstoque.quantidade(db, item.produtoId, item.tamanho);
      throw new ErroHttp(409, `Não dá para reativar: ${item.nome} (${item.tamanho}) tem ${plural(disp, 'peça', 'peças')} no estoque e o pedido precisa de ${item.qtd}.`);
    }
    await repoPedidos.marcarReservado(db, pedidoId, item.posicao, true);
  }
}
