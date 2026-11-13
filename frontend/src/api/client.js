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

/** Erro com a mensagem do servidor e, quando houver, o erro de cada campo. */
export class ErroPedido extends Error {
  constructor(status, mensagem, campos = {}) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

async function postar(url, corpo) {
  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(corpo)
    });
  } catch {
    throw new ErroPedido(0, 'Sem conexão. Confira a internet e tente de novo.');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroPedido(resposta.status, dados.erro ?? 'Algo deu errado. Tente de novo.', dados.campos ?? {});
  return dados;
}

/**
 * Finaliza o pedido: peças + dados do cliente. O servidor confere tudo, registra
 * e devolve { codigo, whatsappUrl, acompanharUrl }. A chave evita pedido repetido.
 */
export const criarPedido = ({ chave, itens, cliente }) => postar('/api/pedidos', { chave, itens, cliente });

/** Andamento do pedido pelo código (sem dados pessoais). */
export const consultarPedido = (codigo) => postar('/api/pedidos/consulta', { codigo });

/** Identificador aleatório (UUID v4) para a chave do pedido. */
export function novaChavePedido() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // fora de HTTPS (ex.: testando pelo IP da rede) randomUUID não existe
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const LINK_CONTATO_WHATSAPP = '/api/contato/whatsapp';
