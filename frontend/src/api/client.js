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

export const buscarProdutos = (colecao = '', sinal) =>
  pedirJson(`/api/produtos${colecao ? `?colecao=${encodeURIComponent(colecao)}` : ''}`, { sinal });

export const buscarProduto = (slug, sinal) => pedirJson(`/api/produtos/${encodeURIComponent(slug)}`, { sinal });

export const calcularSacola = (itens, sinal) => pedirJson('/api/pedidos/previa', { corpo: { itens }, sinal });

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

export const criarPedido = ({ chave, itens, cliente }) => postar('/api/pedidos', { chave, itens, cliente });

export const consultarPedido = (codigo) => postar('/api/pedidos/consulta', { codigo });

export function novaChavePedido() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const LINK_CONTATO_WHATSAPP = '/api/contato/whatsapp';
