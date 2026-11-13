// Pedido: valida as peças, calcula valores, monta a mensagem do WhatsApp e registra o pedido.
// Preço, total e texto saem sempre daqui, nunca do navegador.
import { randomInt, randomUUID } from 'node:crypto';
import * as repoProdutos from '../repos/produtos.js';
import * as repoLoja from '../repos/loja.js';
import * as repoPedidos from '../repos/pedidos.js';
import { emTransacao } from '../db/pool.js';
import { ErroHttp, naoEncontrado } from '../erros.js';
import { precoDoProduto } from './catalogo.js';
import { urlDaImagem } from './armazenamento.js';
import { LIMITE_QTD, formatarBRL, linkWhatsapp, plural, precoTexto } from './formatos.js';

export const LIMITE_ITENS = 50;

/** Situações do pedido, na ordem em que aparecem no painel. */
export const STATUS = {
  novo: 'Novo',
  em_conversa: 'Em conversa',
  pago: 'Pago',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
};

// sem 0/O e 1/I, que se confundem ao ler o código no WhatsApp
const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const gerarCodigo = () => Array.from({ length: 6 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');

/** Lê "slug:TAMANHO:qtd,slug:TAMANHO:qtd" (formato do link de pedido). */
export function lerItensDaQuery(valor) {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErroHttp(400, 'Nenhuma peça no pedido.');
  const partes = valor.split(',');
  if (partes.length > LIMITE_ITENS) throw new ErroHttp(400, 'Pedido grande demais.');
  return partes.map((parte) => {
    const [id, tamanho, qtd = '1'] = parte.split(':');
    return { id, tamanho, qtd: Number(qtd) };
  });
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

/**
 * Junta peça + tamanho repetidos e confere tudo.
 * estrito = true: qualquer problema recusa o pedido (link do WhatsApp).
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
      if (estrito) throw new ErroHttp(400, produto ? `${motivo}: ${produto.nome}.` : `${motivo}.`);
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

/**
 * Link que o site usa no botão de pedido. A chave muda a cada prévia: abrir o mesmo link de novo
 * (clique duplo, "abrir o WhatsApp de novo") reaproveita o pedido em vez de criar outro.
 */
const linkDoPedido = (linhas) =>
  `/api/pedidos/whatsapp?itens=${encodeURIComponent(linhas.map((l) => `${l.produto.slug}:${l.tamanho}:${l.qtd}`).join(','))}&chave=${randomUUID()}`;

/** O que a sacola mostra: itens válidos, valores e o link do pedido. */
export async function previa(db, itens) {
  conferirLista(itens);
  if (itens.length === 0) {
    return { itens: [], removidos: [], pecas: 0, rotuloPecas: plural(0, 'PEÇA', 'PEÇAS'), totalTexto: formatarBRL(0), linkWhatsapp: null };
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
    linkWhatsapp: linhas.length ? linkDoPedido(linhas) : null
  };
}

function montarMensagem({ linhas, loja, pecas, totalCentavos, siteUrl, codigo }) {
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
  if (codigo) texto.push('', `Código do pedido: #${codigo}`);
  if (M.fechamento) texto.push('', M.fechamento);
  return texto.join('\n');
}

async function montar(db, itens) {
  conferirLista(itens);
  if (itens.length === 0) throw new ErroHttp(400, 'Nenhuma peça no pedido.');
  const contexto = await carregar(db, itens);
  const { linhas } = normalizar(itens, contexto, true);
  return { linhas, loja: contexto.loja, ...somar(linhas, contexto.loja) };
}

/** Monta a mensagem sem registrar (POST /api/pedidos). */
export async function montarPedido(db, itens, { siteUrl }) {
  const pedido = await montar(db, itens);
  const mensagem = montarMensagem({ ...pedido, siteUrl });
  return {
    mensagem,
    pecas: pedido.pecas,
    total: pedido.totalCentavos == null ? null : pedido.totalCentavos / 100,
    whatsappUrl: linkWhatsapp(pedido.loja.whatsapp_numero, mensagem)
  };
}

/**
 * Registra o pedido (com código) e devolve o link do WhatsApp.
 * A mesma chave devolve sempre o mesmo pedido, com a mesma mensagem.
 */
export async function registrarPedido(pool, itens, chave, { siteUrl }) {
  const jaFeito = async () => {
    const existente = await repoPedidos.buscarPorChave(pool, chave);
    if (!existente) return null;
    const loja = await repoLoja.obter(pool);
    return { codigo: existente.codigo, novo: false, whatsappUrl: linkWhatsapp(loja.whatsapp_numero, existente.mensagem) };
  };

  const repetido = await jaFeito();
  if (repetido) return repetido;

  const pedido = await montar(pool, itens);
  const copiaDasPecas = pedido.linhas.map(({ produto, tamanho, qtd }) => ({
    produtoId: produto.id, slug: produto.slug, nome: produto.nome, cor: produto.cor,
    tamanho, qtd, precoCentavos: precoDoProduto(produto, pedido.loja)
  }));

  for (let tentativa = 1; ; tentativa++) {
    const codigo = gerarCodigo();
    const mensagem = montarMensagem({ ...pedido, siteUrl, codigo });
    try {
      await emTransacao(pool, (db) => repoPedidos.criar(db, {
        codigo, chave, pecas: pedido.pecas, totalCentavos: pedido.totalCentavos, mensagem, itens: copiaDasPecas
      }));
      return { codigo, novo: true, whatsappUrl: linkWhatsapp(pedido.loja.whatsapp_numero, mensagem) };
    } catch (erro) {
      if (erro.code !== '23505') throw erro;
      // mesma chave gravada ao mesmo tempo por outro clique: devolve aquele pedido
      if (erro.constraint === 'pedidos_chave_key') return jaFeito();
      if (tentativa >= 5) throw erro; // código repetido: tenta outro
    }
  }
}

export async function linkContato(db) {
  const loja = await repoLoja.obter(db);
  return linkWhatsapp(loja.whatsapp_numero, loja.mensagens?.contato ?? '');
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
      codigo: p.codigo,
      quando: p.criado_em,
      status: p.status,
      statusRotulo: STATUS[p.status],
      resumo: resumoDasPecas(p.itens),
      rotuloPecas: plural(p.pecas, 'peça', 'peças'),
      totalTexto: totalTexto(p.total_centavos),
      cliente: p.cliente_nome || p.cliente_contato || ''
    }))
  };
}

export async function pedidoAdmin(db, id) {
  const p = await repoPedidos.obter(db, id);
  if (!p) throw naoEncontrado('Pedido');
  return {
    id: p.id,
    codigo: p.codigo,
    quando: p.criado_em,
    atualizadoEm: p.atualizado_em,
    status: p.status,
    statusRotulo: STATUS[p.status],
    opcoesStatus: opcoesStatus(),
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
    clienteNome: p.cliente_nome,
    clienteContato: p.cliente_contato,
    observacao: p.observacao
  };
}

export async function atualizarPedido(db, id, dados) {
  if (!Object.values(dados).some((v) => v !== undefined)) throw new ErroHttp(400, 'Nada para alterar.');
  const atualizado = await repoPedidos.atualizar(db, id, dados);
  if (!atualizado) throw naoEncontrado('Pedido');
  return pedidoAdmin(db, id);
}
