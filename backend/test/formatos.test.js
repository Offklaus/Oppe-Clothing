import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centavosParaCampo, formatarWhatsapp, gerarSlug, normalizarInstagram, normalizarWhatsapp, paraCentavos, precoTexto
} from '../src/servicos/formatos.js';
import { problemaNaSenha } from '../src/seguranca/senha.js';
import { lerItensDaQuery } from '../src/servicos/pedido.js';

test('preço: aceita os formatos brasileiros e guarda em centavos', () => {
  assert.equal(paraCentavos('129,90'), 12990);
  assert.equal(paraCentavos('R$ 1.299,90'), 129990);
  assert.equal(paraCentavos('89.5'), 8950);
  assert.equal(paraCentavos(59), 5900);
  assert.equal(paraCentavos(''), null);
  assert.equal(paraCentavos(null), null);
  assert.throws(() => paraCentavos('abc'), /Confira/);
  assert.throws(() => paraCentavos('-10'), /Confira/);
  assert.throws(() => paraCentavos('12,999'), /Confira/);
  assert.equal(centavosParaCampo(12990), '129,90');
  assert.match(precoTexto(12990), /R\$\s129,90/);
  assert.equal(precoTexto(null), 'Sob consulta');
});

test('WhatsApp: normaliza e formata', () => {
  assert.equal(normalizarWhatsapp('(35) 99765-3327'), '5535997653327');
  assert.equal(normalizarWhatsapp('+55 35 99765-3327'), '5535997653327');
  assert.equal(normalizarWhatsapp(''), '');
  assert.throws(() => normalizarWhatsapp('123'), /Confira/);
  assert.equal(formatarWhatsapp('5535997653327'), '(35) 99765-3327');
});

test('Instagram: aceita @ ou link do perfil', () => {
  assert.equal(normalizarInstagram('https://www.instagram.com/oppeclothing/'), 'oppeclothing');
  assert.equal(normalizarInstagram('@OppeClothing'), 'oppeclothing');
  assert.equal(normalizarInstagram(''), '');
  assert.throws(() => normalizarInstagram('nome com espaço'), /Confira/);
});

test('endereço (slug) sem acento e sem símbolos', () => {
  assert.equal(gerarSlug('Coleção Ação & Fé'), 'colecao-acao-fe');
  assert.equal(gerarSlug("It's Never Luck"), 'it-s-never-luck');
  assert.equal(gerarSlug('***'), 'item');
});

test('política de senha', () => {
  assert.ok(problemaNaSenha('curta'));
  assert.ok(problemaNaSenha('aaaaaaaaaaaaaaa'));
  assert.ok(problemaNaSenha('1qaz2wsx3edc4rfv'));
  assert.ok(problemaNaSenha('MinhaLojaOppe2026!'));
  assert.ok(problemaNaSenha('joaovictor-2026-ok', { email: 'joaovictor@exemplo.com' }));
  assert.equal(problemaNaSenha('Varal-de-Camisetas-2026'), null);
});

test('itens do link de pedido', () => {
  assert.deepEqual(lerItensDaQuery('drip:M:2,the-key:G'), [
    { id: 'drip', tamanho: 'M', qtd: 2 },
    { id: 'the-key', tamanho: 'G', qtd: 1 }
  ]);
  assert.throws(() => lerItensDaQuery(''), /Nenhuma peça/);
  assert.throws(() => lerItensDaQuery(['a', 'b']), /Nenhuma peça/);
});
