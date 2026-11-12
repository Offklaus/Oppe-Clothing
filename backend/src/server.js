import { config } from './config.js';
import { criarPool } from './db/pool.js';
import { migrar } from './db/migrar.js';
import { semearSeVazio } from './db/semear.js';
import { garantirPastaDeEnvios } from './servicos/imagens.js';
import { criarApp } from './app.js';

const pool = criarPool(config.databaseUrl);

const aplicadas = await migrar(pool);
if (aplicadas.length) console.log(`Migrações aplicadas: ${aplicadas.join(', ')}`);
if (await semearSeVazio(pool, { whatsapp: process.env.WHATSAPP_NUMERO })) console.log('Catálogo inicial importado para o banco.');
await garantirPastaDeEnvios(config.pastaImagens);

const { rows: [{ admins }] } = await pool.query('SELECT count(*)::int AS admins FROM usuarios_admin WHERE ativo');

// em dev a porta vem do script (--porta=3001), para não brigar com a PORT do Vite;
// em produção a hospedagem define PORT.
const argPorta = process.argv.find((a) => a.startsWith('--porta='))?.split('=')[1];
const porta = Number(argPorta) || Number(process.env.PORT) || 3001;

const app = criarApp({ pool, config });
const servidor = app.listen(porta, () => {
  console.log(`API Oppe Clothing em http://localhost:${porta}`);
  if (!admins) console.warn('Nenhum admin cadastrado. Rode "npm run admin:criar" para acessar o painel.');
});

function desligar() {
  servidor.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
