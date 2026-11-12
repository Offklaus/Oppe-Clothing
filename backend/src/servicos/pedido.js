// Pedido: valida as peças, calcula valores e monta a mensagem do WhatsApp.
// Preço, total e texto saem sempre daqui, nunca do navegador.
import * as repoProdutos from '../repos/produtos.js';
import * as repoLoja from '../repos/loja.js';
import { ErroHttp } from '../erros.js';
import { precoDoProduto } from './catalogo.js';
import { LIMITE_QTD, formatarBRL, linkWhatsapp, plural, precoTexto } from './formatos.js';

export const LIMITE_ITENS = 50;

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

const linkDoPedido = (linhas) =>
  `/api/pedidos/whatsapp?itens=${encodeURIComponent(linhas.map((l) => `${l.produto.slug}:${l.tamanho}:${l.qtd}`).join(','))}`;

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
        imagem: `/images/${foto.arquivo}`,
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

export async function montarPedido(db, itens, { siteUrl }) {
  conferirLista(itens);
  if (itens.length === 0) throw new ErroHttp(400, 'Nenhuma peça no pedido.');
  const contexto = await carregar(db, itens);
  const { linhas } = normalizar(itens, contexto, true);
  const { pecas, totalCentavos } = somar(linhas, contexto.loja);
  const M = contexto.loja.mensagens ?? {};
  const base = String(siteUrl ?? '').replace(/\/+$/, '');

  const texto = [M.saudacao || 'Olá!', M.pedido || 'Quero fazer um pedido:', ''];
  for (const { produto, tamanho, qtd } of linhas) {
    const centavos = precoDoProduto(produto, contexto.loja);
    let linha = `✦ ${qtd}x ${produto.nome} (${produto.cor}) — Tam. ${tamanho}`;
    if (centavos != null) linha += ` — ${formatarBRL(centavos * qtd)}`;
    texto.push(linha);
    if (base) texto.push(`   ${base}/produto/${produto.slug}`);
  }
  if (totalCentavos != null) texto.push('', `Total (${plural(pecas, 'peça', 'peças')}): ${formatarBRL(totalCentavos)}`);
  if (M.fechamento) texto.push('', M.fechamento);

  const mensagem = texto.join('\n');
  return {
    mensagem,
    pecas,
    total: totalCentavos == null ? null : totalCentavos / 100,
    whatsappUrl: linkWhatsapp(contexto.loja.whatsapp_numero, mensagem)
  };
}

export async function linkContato(db) {
  const loja = await repoLoja.obter(db);
  return linkWhatsapp(loja.whatsapp_numero, loja.mensagens?.contato ?? '');
}
