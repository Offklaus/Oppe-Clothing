// Carga inicial: se o banco estiver vazio, importa o catálogo de backend/seed/*.json.
import { readFile } from 'node:fs/promises';
import { emTransacao } from './pool.js';
import { gerarSlug, normalizarInstagram, normalizarWhatsapp } from '../servicos/formatos.js';

const PASTA = new URL('../../seed/', import.meta.url);
const lerJson = async (nome) => JSON.parse(await readFile(new URL(nome, PASTA), 'utf8'));
const paraCentavos = (v) => (typeof v === 'number' ? Math.round(v * 100) : null);

export async function semearSeVazio(pool, { whatsapp = '' } = {}) {
  const { rows: [contagem] } = await pool.query(
    'SELECT (SELECT count(*) FROM colecoes)::int AS colecoes, (SELECT count(*) FROM configuracoes_loja)::int AS loja'
  );
  if (contagem.colecoes > 0 || contagem.loja > 0) return false;

  const produtos = await lerJson('produtos.json');
  const loja = await lerJson('loja.json');

  await emTransacao(pool, async (db) => {
    const colecaoPorNome = new Map();
    const nomes = loja.filtros.filter((f) => f !== 'Todas');
    for (const [ordem, nome] of nomes.entries()) {
      const textos = loja.textosColecao?.[nome] ?? {};
      const { rows: [c] } = await db.query(
        `INSERT INTO colecoes (slug, nome, chamada, frase, descricao, ordem)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [gerarSlug(nome), nome, loja.colecoes?.[nome] ?? '', textos.frase ?? '', textos.descricao ?? '', ordem]
      );
      colecaoPorNome.set(nome, c.id);
    }

    const produtoPorSlug = new Map();
    for (const [ordem, p] of produtos.entries()) {
      const { rows: [novo] } = await db.query(
        `INSERT INTO produtos (slug, nome, cor, descricao_cor, colecao_id, tag, preco_centavos, frase, referencia, estampa, ordem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [p.id, p.nome, p.cor, p.descricaoCor ?? '', colecaoPorNome.get(p.colecao), p.tag ?? '',
          paraCentavos(p.preco), p.frase ?? '', p.referencia ?? '', p.estampa ?? '', ordem]
      );
      produtoPorSlug.set(p.id, novo.id);
      for (const [posicao, face] of p.faces.slice(0, 2).entries()) {
        await db.query(
          'INSERT INTO produto_imagens (produto_id, posicao, arquivo, lado) VALUES ($1, $2, $3, $4)',
          [novo.id, posicao, face.img.replace(/^\/images\//, ''), face.lado]
        );
      }
    }

    await db.query(
      `INSERT INTO configuracoes_loja (whatsapp_numero, instagram, preco_padrao_centavos, tamanhos, modelagem, malha,
         tecnica_estampa, cuidados, sobre, medidas, mensagens, destaque_produto_id, colecao_destaque_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [normalizarWhatsapp(whatsapp), normalizarInstagram(loja.instagram), paraCentavos(loja.precoPadrao),
        loja.tamanhos, loja.modelagem ?? '', loja.malha ?? '', loja.tecnicaEstampa ?? '', loja.cuidados ?? '',
        loja.sobre ?? '', JSON.stringify(loja.medidas), JSON.stringify(loja.mensagens),
        produtoPorSlug.get(loja.destaqueVaral) ?? null, colecaoPorNome.get(loja.colecaoDestaque) ?? null]
    );
  });
  return true;
}
