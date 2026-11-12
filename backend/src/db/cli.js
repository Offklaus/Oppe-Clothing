// npm run db:migrar | db:semear | db:preparar   (acrescente --teste para o banco de testes)
import { config } from '../config.js';
import { criarPool } from './pool.js';
import { migrar } from './migrar.js';
import { semearSeVazio } from './semear.js';

const comando = process.argv[2];
const COMANDOS = ['migrar', 'semear', 'preparar'];

if (!COMANDOS.includes(comando)) {
  console.error('Uso: node src/db/cli.js <migrar|semear|preparar> [--teste]');
  process.exit(1);
}

const pool = criarPool(process.argv.includes('--teste') ? config.databaseUrlTeste : config.databaseUrl, { caCert: config.databaseCaCert });
try {
  if (comando !== 'semear') {
    const feitas = await migrar(pool);
    console.log(feitas.length ? `Migrações aplicadas: ${feitas.join(', ')}` : 'Banco já está atualizado.');
  }
  if (comando !== 'migrar') {
    const importou = await semearSeVazio(pool, { whatsapp: process.env.WHATSAPP_NUMERO });
    console.log(importou ? 'Catálogo inicial importado.' : 'O banco já tem dados; nada foi importado.');
  }
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
