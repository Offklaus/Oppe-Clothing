// Fotos das peças. Todo envio é reprocessado: vira WebP 1000×1000, sem metadados,
// com nome aleatório. O arquivo original nunca é gravado como chegou.
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as repoProdutos from '../repos/produtos.js';
import { ErroHttp, naoEncontrado } from '../erros.js';

const PASTA_ENVIOS = 'produtos';
const LIMITE_PIXELS = 40_000_000;
const FORMATOS_ACEITOS = ['jpeg', 'png', 'webp'];

export async function garantirPastaDeEnvios(pastaImagens) {
  await mkdir(path.join(pastaImagens, PASTA_ENVIOS), { recursive: true });
}

async function processarESalvar(pastaImagens, buffer) {
  let formato;
  try {
    ({ format: formato } = await sharp(buffer, { limitInputPixels: LIMITE_PIXELS }).metadata());
  } catch {
    throw new ErroHttp(415, 'O arquivo enviado não é uma imagem válida.');
  }
  if (!FORMATOS_ACEITOS.includes(formato)) throw new ErroHttp(415, 'Envie uma imagem JPG, PNG ou WebP.');

  let saida;
  try {
    saida = await sharp(buffer, { limitInputPixels: LIMITE_PIXELS })
      .rotate()
      .resize(1000, 1000, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new ErroHttp(415, 'Não foi possível processar a imagem. Tente outra, com até 40 megapixels.');
  }

  const arquivo = `${PASTA_ENVIOS}/${randomUUID()}.webp`;
  await garantirPastaDeEnvios(pastaImagens);
  await writeFile(path.join(pastaImagens, arquivo), saida, { flag: 'wx' });
  return arquivo;
}

/** Apaga um arquivo enviado pelo painel se nenhuma peça usa mais. As fotos originais do catálogo ficam. */
export async function apagarSeSemUso(db, pastaImagens, arquivo) {
  if (!arquivo?.startsWith(`${PASTA_ENVIOS}/`) || !/^[a-z0-9_-]+\/[a-z0-9_-]+\.webp$/.test(arquivo)) return;
  if (await repoProdutos.arquivoEmUso(db, arquivo)) return;
  await unlink(path.join(pastaImagens, arquivo)).catch((erro) => {
    if (erro.code !== 'ENOENT') console.warn(`Não foi possível apagar a foto ${arquivo}: ${erro.code}`);
  });
}

export async function salvarFoto(db, pastaImagens, produtoId, posicao, buffer, lado) {
  const produto = await repoProdutos.porId(db, produtoId);
  if (!produto) throw naoEncontrado('Peça');
  if (posicao === 1 && !produto.imagens.some((i) => i.posicao === 0)) {
    throw new ErroHttp(400, 'Envie a foto principal primeiro.');
  }
  const arquivo = await processarESalvar(pastaImagens, buffer);
  let anterior;
  try {
    anterior = await repoProdutos.definirImagem(db, produtoId, posicao, arquivo, lado);
  } catch (erro) {
    await unlink(path.join(pastaImagens, arquivo)).catch(() => {});
    throw erro;
  }
  if (anterior && anterior !== arquivo) await apagarSeSemUso(db, pastaImagens, anterior);
}

export async function alterarLado(db, produtoId, posicao, lado) {
  if (!(await repoProdutos.alterarLado(db, produtoId, posicao, lado))) throw naoEncontrado('Foto');
}

export async function removerFoto(db, pastaImagens, produtoId, posicao) {
  if (posicao === 0) throw new ErroHttp(400, 'A foto principal não pode ficar vazia. Envie outra para trocar.');
  const arquivo = await repoProdutos.removerImagem(db, produtoId, posicao);
  if (!arquivo) throw naoEncontrado('Foto');
  await apagarSeSemUso(db, pastaImagens, arquivo);
}
