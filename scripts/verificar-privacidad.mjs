// Verifica que las filas de consentimientos no hayan sido alteradas.
//
// Uso:  node scripts/verificar-privacidad.mjs
// Requiere DATABASE_URL y PRIVACY_HASH_SECRET (o JWT_SECRET).
// Sale con codigo 1 si encuentra una fila con hash distinto.
//
// - En filas normales se verifican los dos hashes (identidad + legales).
// - En filas anonimizadas solo se verifica el hash legal: nombre, email, IP y
//   navegador se borraron a proposito, pero la prueba del texto aceptado sigue.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPOS_HASH_CONSENT, CAMPOS_HASH_LEGAL, hashConsentimiento, hashLegalConsentimiento } from '../api/privacidad-hash.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApi = createRequire(path.join(RAIZ, 'api', 'package.json'));
const { Client } = requireApi('pg');

const secreto = process.env.PRIVACY_HASH_SECRET || process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !secreto) {
  console.error('Faltan DATABASE_URL y PRIVACY_HASH_SECRET (o JWT_SECRET).');
  process.exit(2);
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
let alteradas = 0;
try {
  await db.connect();
  const columnas = [...new Set([...CAMPOS_HASH_CONSENT, ...CAMPOS_HASH_LEGAL])];
  const { rows } = await db.query(
    `SELECT ${columnas.join(', ')}, id, hash, hash_legal, anonimizado_en FROM consentimientos ORDER BY creado_en ASC`
  );
  console.log(`Verificando ${rows.length} consentimiento(s)…`);
  for (const fila of rows) {
    const legalOk = fila.hash_legal && hashLegalConsentimiento(fila, secreto) === fila.hash_legal;
    const completoOk = fila.anonimizado_en ? true : hashConsentimiento(fila, secreto) === fila.hash;
    if (!legalOk || !completoOk) {
      alteradas += 1;
      console.error(`  ALTERADO  ${fila.id}  legal=${legalOk ? 'ok' : 'mal'}  completo=${completoOk ? 'ok' : 'mal'}`);
    }
  }
  console.log(alteradas === 0 ? 'OK: todos los hashes coinciden.' : `ATENCIÓN: ${alteradas} fila(s) no coinciden.`);
} catch (e) {
  console.error('No se pudo verificar:', e.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
process.exit(alteradas ? 1 : process.exitCode || 0);
