import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { configuracaoConexao } from '../src/db/pool.js';
import { armazenamentoSupabase } from '../src/servicos/armazenamento.js';

test('banco local sem SSL; banco remoto com SSL verificado e sem sslmode na URL', () => {
  assert.equal(configuracaoConexao('postgres://u:s@localhost:5432/db').ssl, false);

  const remoto = configuracaoConexao('postgresql://postgres.abc:s%40nha@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require');
  assert.equal(remoto.ssl.rejectUnauthorized, true);
  assert.doesNotMatch(remoto.connectionString, /sslmode/);
  assert.match(remoto.connectionString, /s%40nha@/, 'senha codificada continua igual');

  const comCa = configuracaoConexao('postgres://u:s@db.exemplo.com/db', { caCert: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----' });
  assert.ok(comCa.ssl.ca.at(-1).includes('BEGIN CERTIFICATE'));
  assert.ok(comCa.ssl.ca.length > 1, 'mantém também as autoridades públicas');
});

test('Supabase Storage: envia, apaga e monta a URL pública com a chave só no cabeçalho', async () => {
  const pedidos = [];
  const servidor = createServer((req, res) => {
    let corpo = 0;
    req.on('data', (c) => { corpo += c.length; });
    req.on('end', () => {
      pedidos.push({ metodo: req.method, url: req.url, apikey: req.headers.apikey, auth: req.headers.authorization, tipo: req.headers['content-type'], corpo });
      if (req.url.startsWith('/storage/v1/bucket/')) return res.end(JSON.stringify({ public: true }));
      if (req.url.includes('falha')) { res.statusCode = 500; return res.end('erro'); }
      res.end('{}');
    });
  });
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const fotos = armazenamentoSupabase({ url: base, chave: 'sb_secret_teste', bucket: 'produtos' });
    await fotos.verificar();
    await fotos.salvar('produtos/abc-123.webp', Buffer.from('webp'));
    await fotos.apagar('produtos/abc-123.webp');

    assert.deepEqual(pedidos.map((p) => `${p.metodo} ${p.url}`), [
      'GET /storage/v1/bucket/produtos',
      'POST /storage/v1/object/produtos/abc-123.webp',
      'DELETE /storage/v1/object/produtos/abc-123.webp'
    ]);
    assert.equal(pedidos[1].apikey, 'sb_secret_teste');
    assert.equal(pedidos[1].auth, undefined, 'chave nova não vai no Authorization');
    assert.equal(pedidos[1].tipo, 'image/webp');
    assert.equal(fotos.url('produtos/abc-123.webp'), `${base}/storage/v1/object/public/produtos/abc-123.webp`);

    await assert.rejects(fotos.salvar('produtos/falha.webp', Buffer.from('x')), (e) => e.status === 502);
    await assert.rejects(fotos.salvar('../../segredo.webp', Buffer.from('x')), /inesperado/);

    const antiga = armazenamentoSupabase({ url: base, chave: 'eyJhbGciOi.teste', bucket: 'produtos' });
    await antiga.apagar('produtos/abc-123.webp');
    assert.equal(pedidos.at(-1).auth, 'Bearer eyJhbGciOi.teste');
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
});
