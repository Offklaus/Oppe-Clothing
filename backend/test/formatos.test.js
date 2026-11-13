import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TELEFONE_BR, centavosParaCampo, formatarWhatsapp, gerarSlug, normalizarInstagram, normalizarWhatsapp, paraCentavos,
  precoTexto, telefoneComPais
} from '../src/servicos/formatos.js';
import { problemaNaSenha } from '../src/seguranca/senha.js';
import { formatarCodigo, normalizarCodigo } from '../src/servicos/pedido.js';
import { esquemaCliente } from '../src/validacao/esquemas.js';

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

test('telefone: uma regra só para o WhatsApp da loja e o do cliente', () => {
  assert.equal(telefoneComPais('(35) 99765-3327'), '5535997653327');
  assert.equal(telefoneComPais('+55 35 99765-3327'), '5535997653327');
  assert.equal(telefoneComPais('3534561234'), '553534561234', 'fixo com DDD');
  assert.ok(TELEFONE_BR.test('5535997653327'));
  assert.ok(!TELEFONE_BR.test('5505997653327'), 'DDD não começa com 0');
  assert.equal(normalizarWhatsapp('(35) 99765-3327'), telefoneComPais('(35) 99765-3327'));
});

test('código do pedido: aceita como o cliente digitar, recusa o que não é código', () => {
  assert.equal(normalizarCodigo('#k7q2-mx9p'), 'K7Q2MX9P');
  assert.equal(normalizarCodigo(' K7Q2 MX9P '), 'K7Q2MX9P');
  assert.equal(formatarCodigo('K7Q2MX9P'), 'K7Q2-MX9P');
  assert.equal(normalizarCodigo('K7Q2MX9O'), null, 'O e 0 não existem no código');
  assert.equal(normalizarCodigo('ABC'), null);
  assert.equal(normalizarCodigo(''), null);
  assert.equal(normalizarCodigo({ codigo: 'K7Q2MX9P' }), null);
});

test('dados do cliente: normaliza telefone, CEP e estado; recusa o que falta', () => {
  const base = {
    nome: 'Maria Silva', email: 'Maria@Exemplo.com', telefone: '(35) 99999-0000', cep: '37500-000',
    logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Itajubá', uf: 'mg'
  };
  const ok = esquemaCliente.parse(base);
  assert.equal(ok.telefone, '5535999990000');
  assert.equal(ok.cep, '37500000');
  assert.equal(ok.uf, 'MG');
  assert.equal(ok.email, 'maria@exemplo.com');
  assert.equal(ok.complemento, '');
  assert.equal(esquemaCliente.parse({ ...base, telefone: '+55 55 99999-0000' }).telefone, '5555999990000', 'DDD 55 (RS)');
  assert.equal(esquemaCliente.parse({ ...base, telefone: '55 99999-0000' }).telefone, '5555999990000');

  const erros = (dados) => esquemaCliente.safeParse(dados).error?.issues.map((i) => i.path.join('.')) ?? [];
  assert.deepEqual(erros({ ...base, telefone: '9999-0000' }), ['telefone']);
  assert.deepEqual(erros({ ...base, cep: '375' }), ['cep']);
  assert.deepEqual(erros({ ...base, uf: 'XX' }), ['uf']);
  assert.deepEqual(erros({ ...base, nome: 'Maria' }), ['nome']);
  assert.deepEqual(erros({ ...base, email: 'maria' }), ['email']);
  assert.deepEqual(erros({ ...base, extra: 1 }), ['']);
});
