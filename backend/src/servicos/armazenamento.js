import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ErroHttp } from '../erros.js';

export const PREFIXO_ENVIOS = 'produtos/';
const ARQUIVO_DE_ENVIO = /^produtos\/[a-z0-9-]+\.webp$/;

export const ehArquivoDeEnvio = (arquivo) => ARQUIVO_DE_ENVIO.test(String(arquivo ?? ''));

function exigirEnvio(arquivo) {
  if (!ehArquivoDeEnvio(arquivo)) throw new Error(`Nome de arquivo inesperado: ${String(arquivo).slice(0, 80)}`);
}

export function armazenamentoLocal(pastaImagens) {
  return {
    tipo: 'local',
    url: (arquivo) => `/images/${arquivo}`,
    async salvar(arquivo, conteudo) {
      exigirEnvio(arquivo);
      await mkdir(path.join(pastaImagens, 'produtos'), { recursive: true });
      await writeFile(path.join(pastaImagens, arquivo), conteudo, { flag: 'wx' });
    },
    async apagar(arquivo) {
      exigirEnvio(arquivo);
      await unlink(path.join(pastaImagens, arquivo)).catch((erro) => { if (erro.code !== 'ENOENT') throw erro; });
    },
    async verificar() {
      await mkdir(path.join(pastaImagens, 'produtos'), { recursive: true });
      return 'fotos do painel em backend/public/images/produtos';
    }
  };
}

export function armazenamentoSupabase({ url, chave, bucket, buscar = fetch }) {
  const base = url.replace(/\/+$/, '');
  const cabecalhos = { apikey: chave };
  if (chave.startsWith('eyJ')) cabecalhos.authorization = `Bearer ${chave}`;
  const objeto = (arquivo) => arquivo.slice(PREFIXO_ENVIOS.length);
  const endereco = (arquivo) => `${base}/storage/v1/object/${bucket}/${objeto(arquivo)}`;

  async function falha(acao, resposta) {
    const corpo = await resposta.text().catch(() => '');
    console.error(`Supabase Storage: falha ao ${acao} (HTTP ${resposta.status}) ${corpo.slice(0, 300)}`);
    return new ErroHttp(502, 'Não foi possível guardar a foto agora. Tente de novo em instantes.');
  }

  return {
    tipo: 'supabase',
    url: (arquivo) => `${base}/storage/v1/object/public/${bucket}/${objeto(arquivo)}`,
    async salvar(arquivo, conteudo) {
      exigirEnvio(arquivo);
      const resposta = await buscar(endereco(arquivo), {
        method: 'POST',
        headers: { ...cabecalhos, 'content-type': 'image/webp', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
        body: conteudo
      });
      if (!resposta.ok) throw await falha('enviar a foto', resposta);
    },
    async apagar(arquivo) {
      exigirEnvio(arquivo);
      const resposta = await buscar(endereco(arquivo), { method: 'DELETE', headers: cabecalhos });
      if (!resposta.ok && resposta.status !== 404) throw await falha('apagar a foto', resposta);
    },
    async verificar() {
      const resposta = await buscar(`${base}/storage/v1/bucket/${bucket}`, { headers: cabecalhos });
      if (!resposta.ok) throw new Error(`Bucket "${bucket}" não encontrado no Supabase Storage (HTTP ${resposta.status}). Confira SUPABASE_URL, SUPABASE_SECRET_KEY e SUPABASE_BUCKET.`);
      const dados = await resposta.json();
      if (!dados.public) throw new Error(`O bucket "${bucket}" precisa ser público para o site mostrar as fotos.`);
      return `fotos do painel no Supabase Storage (bucket "${bucket}")`;
    }
  };
}

function criarPadrao(c) {
  return c.supabaseUrl && c.supabaseChave
    ? armazenamentoSupabase({ url: c.supabaseUrl, chave: c.supabaseChave, bucket: c.supabaseBucket })
    : armazenamentoLocal(c.pastaImagens);
}

let atual = criarPadrao(config);

export const armazenamento = () => atual;

export function usarArmazenamento(novo) {
  atual = novo;
}

export function urlDaImagem(arquivo) {
  return arquivo.startsWith(PREFIXO_ENVIOS) ? atual.url(arquivo) : `/images/${arquivo}`;
}

export function origemDasFotos() {
  if (atual.tipo !== 'supabase') return null;
  return new URL(atual.url(`${PREFIXO_ENVIOS}x.webp`)).origin;
}
