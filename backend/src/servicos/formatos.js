// Conversões e formatos usados pelas regras de negócio.
import { ErroHttp } from '../erros.js';

export const LIMITE_QTD = 99;
export const SEM_PRECO = 'Sob consulta';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarBRL = (centavos) => BRL.format(centavos / 100);
export const precoTexto = (centavos) => (centavos == null ? SEM_PRECO : formatarBRL(centavos));
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const PRECO_MAXIMO = 100_000;

/** Aceita 129.9, "129,90", "R$ 1.299,90" ou vazio (sem preço). Devolve centavos ou null. */
export function paraCentavos(valor, campo = 'preco') {
  if (valor == null || (typeof valor === 'string' && valor.trim() === '')) return null;
  const invalido = () => new ErroHttp(400, 'Confira os campos destacados.', {
    [campo]: `Preço inválido. Use um valor como 129,90 (até R$ ${PRECO_MAXIMO.toLocaleString('pt-BR')}).`
  });
  let numero;
  if (typeof valor === 'number') {
    numero = valor;
  } else {
    let s = String(valor).replace(/R\$|\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) throw invalido();
    numero = Number(s);
  }
  if (!Number.isFinite(numero) || numero < 0 || numero > PRECO_MAXIMO) throw invalido();
  return Math.round(numero * 100);
}

/** Centavos para o campo do formulário: 12990 → "129,90". */
export const centavosParaCampo = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export function gerarSlug(texto) {
  const slug = String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/, '');
  return slug || 'item';
}

/** "(35) 99765-3327", "35997653327" ou "+55 35 99765-3327" → "5535997653327". */
export function normalizarWhatsapp(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (!/^\d{12,15}$/.test(numero)) {
    throw new ErroHttp(400, 'Confira os campos destacados.', { whatsapp: 'WhatsApp inválido. Use DDD + número, ex.: (35) 99765-3327.' });
  }
  return numero;
}

export function formatarWhatsapp(numero) {
  if (!numero) return null;
  const m = String(numero).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${numero}`;
}

/** Aceita "@usuario", "usuario" ou o link do perfil. Devolve só o usuário, em minúsculas. */
export function normalizarInstagram(valor) {
  let s = String(valor ?? '').trim();
  if (!s) return '';
  const doLink = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  if (doLink) s = doLink[1];
  s = s.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) {
    throw new ErroHttp(400, 'Confira os campos destacados.', { instagram: 'Instagram inválido. Use o @ ou o link do perfil.' });
  }
  return s.toLowerCase();
}

export const linkWhatsapp = (numero, texto) => `https://wa.me/${numero ?? ''}?text=${encodeURIComponent(texto)}`;

/** Texto com marcador de "preencher depois", como [PREÇO] ou [CM]. */
export const temMarcador = (texto) => /\[[^\]]+\]/.test(String(texto ?? ''));
