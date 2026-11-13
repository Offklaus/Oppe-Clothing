// Pedido: valida as peças, calcula valores, registra o pedido com os dados do cliente,
// monta a mensagem do WhatsApp e responde a consulta pública pelo código.
// Preço, total, texto e etapas saem sempre daqui, nunca do navegador.
import { randomInt } from 'node:crypto';
import * as repoProdutos from '../repos/produtos.js';
import * as repoLoja from '../repos/loja.js';
import * as repoPedidos from '../repos/pedidos.js';
import { emTransacao } from '../db/pool.js';
import { ErroHttp, naoEncontrado } from '../erros.js';
import { precoDoProduto } from './catalogo.js';
import { urlDaImagem } from './armazenamento.js';
import { LIMITE_QTD, UFS, formatarBRL, formatarCep, formatarWhatsapp, linkWhatsapp, plural, precoTexto } from './formatos.js';

export const LIMITE_ITENS = 50;

/** Situações do pedido, na ordem do atendimento. */
export const STATUS = {
  novo: 'Aguardando pagamento',
  pago: 'Pagamento confirmado',
  em_preparacao: 'Em preparação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
};

// ---------- código do pedido ----------

// sem 0/O e 1/I, que se confundem ao ler ou ditar o código
const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const gerarCodigo = () => Array.from({ length: 8 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');

/** "K7Q2MX9P" → "K7Q2-MX9P" (mais fácil de ler e ditar). */
export const formatarCodigo = (codigo) => (codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo);

/** Aceita "#k7q2-mx9p", "K7Q2 MX9P"…; devolve null se não tem formato de código. */
export function normalizarCodigo(texto) {
  const limpo = String(texto ?? '').slice(0, 40).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return /^[2-9A-HJ-NP-Z]{6}$|^[2-9A-HJ-NP-Z]{8}$/.test(limpo) ? limpo : null;
}

// ---------- sacola ----------

function conferirLista(itens) {
  if (!Array.isArray(itens)) throw new ErroHttp(400, 'Pedido inválido.');
  if (itens.length > LIMITE_ITENS) throw new ErroHttp(400, 'Pedido grande demais.');
}

async function carregar(db, itens) {
  const slugs = [...new Set(itens.map((i) => (typeof i?.id === 'string' ? i.id.slice(0, 80) : '')).filter(Boolean))];
  const [produtos, loja] = await Promise.all([repoProdutos.visiveisPorSlugs(db, slugs), repoLoja.obter(db)]);
  return { mapa: new Map(produtos.map((p) => [p.slug, p])), loja };
}

/**
 * Junta peça + tamanho repetidos e confere tudo.
 * estrito = true: qualquer problema recusa o pedido.
 * estrito = false: itens com problema saem da lista e são informados (prévia da sacola).
 */
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
  return { linhas: [...linhas.values()], removidos };
}

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

/** O que a sacola mostra: itens válidos e valores. */
export async function previa(db, itens) {
  conferirLista(itens);
  if (itens.length === 0) {
    return { itens: [], removidos: [], pecas: 0, rotuloPecas: plural(0, 'PEÇA', 'PEÇAS'), totalTexto: formatarBRL(0), podeFinalizar: false };
  }
  const contexto = await carregar(db, itens);
  const { linhas, removidos } = normalizar(itens, contexto, false);
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
        podeAumentar: qtd < LIMITE_QTD
      };
    }),
    removidos,
    pecas,
    rotuloPecas: plural(pecas, 'PEÇA', 'PEÇAS'),
    totalTexto: totalCentavos == null ? 'A combinar' : formatarBRL(totalCentavos),
    podeFinalizar: linhas.length > 0
  };
}

// ---------- novo pedido ----------

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

/**
 * Registra o pedido com os dados do cliente (já validados) e devolve o código e o link do WhatsApp.
 * A mesma chave devolve sempre o mesmo pedido: clique duplo não cria dois.
 */
export async function criarPedido(pool, { chave, itens, cliente }, { siteUrl }) {
  // Repetir a chave (clique duplo, nova tentativa após falha de rede) devolve o mesmo pedido —
  // mas só para quem mandou os mesmos dados: a mensagem traz nome, cidade e CEP do cliente.
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
    tamanho, qtd, precoCentavos: precoDoProduto(produto, contexto.loja)
  }));

  for (let tentativa = 1; ; tentativa++) {
    const codigo = gerarCodigo();
    const mensagem = montarMensagem({ linhas, loja: contexto.loja, pecas, totalCentavos, siteUrl, codigo, cliente });
    try {
      await emTransacao(pool, (db) => repoPedidos.criar(db, {
        codigo, chave, pecas, totalCentavos, mensagem, cliente, itens: copiaDasPecas
      }));
      return respostaDoPedido(codigo, mensagem, contexto.loja, true);
    } catch (erro) {
      if (erro.code !== '23505') throw erro;
      // mesma chave gravada ao mesmo tempo por outro clique: devolve aquele pedido
      if (erro.constraint === 'pedidos_chave_key') return jaFeito();
      if (tentativa >= 5) throw erro; // código repetido (raríssimo): tenta outro
    }
  }
}

export async function linkContato(db) {
  const loja = await repoLoja.obter(db);
  return linkWhatsapp(loja.whatsapp_numero, loja.mensagens?.contato ?? '');
}

// ---------- consulta pública (página "Acompanhar pedido") ----------

const ORDEM = ['novo', 'pago', 'em_preparacao', 'enviado', 'entregue'];

/**
 * Cada etapa fica "atual" a partir de uma situação e "feita" a partir de outra.
 * dataFeita: de qual mudança vem a data mostrada quando a etapa está feita
 * (o envio termina quando o pedido é entregue, mas a data que importa é a do envio).
 */
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

/**
 * O que o cliente vê ao consultar o código: andamento, peças e total.
 * Nunca devolve nome, e-mail, telefone ou endereço — quem tem o código vê só o andamento.
 */
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

// ---------- painel ----------

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
      cliente: p.cliente_nome
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

export async function pedidoAdmin(db, id) {
  const p = await repoPedidos.obter(db, id);
  if (!p) throw naoEncontrado('Pedido');
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
      // conversa com o cliente no WhatsApp (sem texto pronto)
      linkWhatsapp: p.cliente_telefone ? `https://wa.me/${p.cliente_telefone}` : null,
      endereco: enderecoEmLinhas(p)
    },
    // os mesmos dados no formato do formulário de correção (mesmas regras do site)
    clienteEdicao: {
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
      // link só para peça que ainda está no catálogo
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

/** Atualiza situação, rastreio e observações. Devolve o pedido e se a situação mudou. */
export async function atualizarPedido(pool, id, dados) {
  if (!Object.values(dados).some((v) => v !== undefined)) throw new ErroHttp(400, 'Nada para alterar.');
  const resultado = await emTransacao(pool, (db) => repoPedidos.atualizar(db, id, dados));
  if (!resultado) throw naoEncontrado('Pedido');
  return { pedido: await pedidoAdmin(pool, id), mudouStatus: resultado.mudou };
}
