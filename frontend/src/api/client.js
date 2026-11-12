// Tudo o que o site pede ao backend passa por aqui.
// As regras (preço, total, filtros, relacionados) ficam todas no servidor: o site só exibe.

async function pedirJson(url, { corpo, sinal } = {}) {
  const resposta = await fetch(url, {
    method: corpo ? 'POST' : 'GET',
    headers: { accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: sinal
  });
  if (!resposta.ok) {
    const erro = new Error(`Falha ao carregar ${url} (${resposta.status})`);
    erro.status = resposta.status;
    throw erro;
  }
  return resposta.json();
}

export const buscarLoja = (sinal) => pedirJson('/api/loja', { sinal });

/** { produtos, rotuloTotal }, já filtrado pelo servidor. */
export const buscarProdutos = (colecao = '', sinal) =>
  pedirJson(`/api/produtos${colecao ? `?colecao=${encodeURIComponent(colecao)}` : ''}`, { sinal });

/** Peça com ficha, galeria, tamanhos, medidas e relacionados. */
export const buscarProduto = (slug, sinal) => pedirJson(`/api/produtos/${encodeURIComponent(slug)}`, { sinal });

/** O servidor confere a sacola e devolve os itens válidos, os valores e o link do pedido. */
export const calcularSacola = (itens, sinal) => pedirJson('/api/pedidos/previa', { corpo: { itens }, sinal });

/** Link do pedido de uma peça só (o servidor valida e redireciona para o WhatsApp). */
export const linkPedidoWhatsapp = (itens) =>
  `/api/pedidos/whatsapp?itens=${encodeURIComponent(itens.map((i) => `${i.id}:${i.tamanho}:${i.qtd}`).join(','))}`;

export const LINK_CONTATO_WHATSAPP = '/api/contato/whatsapp';
