// Utilidades dos testes: banco de testes limpo, servidor numa porta livre e cliente do painel.
import { config } from '../src/config.js';
import { criarPool } from '../src/db/pool.js';
import { migrar } from '../src/db/migrar.js';
import { semearSeVazio } from '../src/db/semear.js';
import { criarApp } from '../src/app.js';

export const ORIGEM = 'http://localhost:5173';
export const SENHA_TESTE = 'Senha-de-Teste-Forte-2026!';

export async function prepararBanco() {
  if (!config.databaseUrlTeste) throw new Error('Defina DATABASE_URL_TESTE em backend/.env para rodar os testes.');
  const pool = criarPool(config.databaseUrlTeste);
  await migrar(pool);
  await pool.query(`TRUNCATE auditoria, sessoes_admin, usuarios_admin, pedido_eventos, pedido_itens, pedidos,
                    produto_imagens, produtos, colecoes, configuracoes_loja RESTART IDENTITY CASCADE`);
  await semearSeVazio(pool, { whatsapp: '5535997653327' });
  return pool;
}

export async function subirServidor(pool, { config: ajustes = {}, limiteLogin = 1000 } = {}) {
  const app = criarApp({
    pool,
    config: {
      ...config, producao: false, cookieSeguro: false, trustProxy: false,
      siteUrl: 'https://oppe.exemplo', origensPermitidas: [ORIGEM], ...ajustes
    },
    limiteLogin,
    limiteApi: 10_000
  });
  const servidor = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  return {
    base: `http://127.0.0.1:${servidor.address().port}`,
    fechar: () => new Promise((ok) => servidor.close(ok))
  };
}

/** Dados de entrega válidos (fictícios) para criar pedidos nos testes. */
export const CLIENTE_TESTE = Object.freeze({
  nome: 'Maria Teste', email: 'maria@exemplo.com', telefone: '(35) 99999-0000', cep: '37500-000',
  logradouro: 'Rua das Flores', numero: '100', complemento: 'Apto 2', bairro: 'Centro', cidade: 'Itajubá', uf: 'MG'
});

/** Faz um pedido como o site faz (POST com Origin do site). */
export function fazerPedido(base, itens, { chave = crypto.randomUUID(), cliente = CLIENTE_TESTE, origem = ORIGEM } = {}) {
  return fetch(`${base}/api/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origem ? { origin: origem } : {}) },
    body: JSON.stringify({ chave, itens, cliente })
  });
}

/** Consulta pública pelo código. */
export function consultarPedido(base, codigo) {
  return fetch(`${base}/api/pedidos/consulta`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo })
  });
}

/** Cliente do painel que guarda o cookie de sessão, como um navegador. */
export function clienteAdmin(base) {
  let cookie = '';
  async function pedir(metodo, caminho, corpo, { formulario } = {}) {
    const headers = { origin: ORIGEM, 'x-oppe-admin': '1' };
    if (cookie) headers.cookie = cookie;
    let body;
    if (formulario) body = formulario;
    else if (corpo !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(corpo);
    }
    const res = await fetch(`${base}/api/admin${caminho}`, { method: metodo, headers, body });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const par = setCookie.split(';')[0];
      cookie = par.endsWith('=') ? '' : par;
    }
    const texto = await res.text();
    return { status: res.status, corpo: texto ? JSON.parse(texto) : null, setCookie };
  }
  return {
    pedir,
    get cookie() { return cookie; }
  };
}
