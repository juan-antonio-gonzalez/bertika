// Bertika - Retención de consentimientos (5 años).
//
// Uso:
//   node scripts/retencion-privacidad.mjs            # muestra qué haría
//   node scripts/retencion-privacidad.mjs --aplicar  # lo aplica
//
// A los 5 años se quitan nombre, email, IP y navegador, pero se conservan la
// fecha, la versión y el hash del documento aceptado: la prueba de que existió
// el consentimiento no se borra. Las versiones legales (archivos estáticos) se
// conservan también por 5 años.
//
// Requiere DATABASE_URL (el mismo de la API). Se puede correr a mano o desde un
// cron mensual del VPS.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApi = createRequire(path.join(RAIZ, 'api', 'package.json'));
const { Client } = requireApi('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL (el mismo de /etc/bertika/bertika-api.env).');
  process.exit(2);
}

const aplicar = process.argv.includes('--aplicar');
const anios = Math.max(1, Math.min(Number(process.env.PRIVACIDAD_RETENCION_ANIOS) || 5, 30));
const db = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await db.connect();
  const vencidos = await db.query(
    `SELECT id, creado_en, tipo, email
       FROM consentimientos
      WHERE anonimizado_en IS NULL
        AND creado_en < now() - ($1::int * interval '1 year')
      ORDER BY creado_en ASC`,
    [anios]
  );
  console.log(`Retención: ${anios} años · ${vencidos.rowCount} registro(s) para anonimizar`);
  for (const f of vencidos.rows.slice(0, 20)) {
    console.log(`  ${f.id} · ${new Date(f.creado_en).toISOString().slice(0, 10)} · ${f.tipo} · ${f.email || 'sin email'}`);
  }
  if (vencidos.rowCount > 20) console.log(`  ... y ${vencidos.rowCount - 20} más`);

  if (!aplicar) {
    console.log('\nModo simulación. Para aplicar: node scripts/retencion-privacidad.mjs --aplicar');
    process.exit(0);
  }

  if (vencidos.rowCount) {
    const r = await db.query(
      `UPDATE consentimientos
          SET nombre = NULL, email = NULL, ip = NULL, user_agent = NULL, anonimizado_en = now()
        WHERE anonimizado_en IS NULL
          AND creado_en < now() - ($1::int * interval '1 year')`,
      [anios]
    );
    console.log(`\nAnonimizados: ${r.rowCount} registro(s). Se conservaron versión, fecha y hash.`);
  } else {
    console.log('\nNo había registros para anonimizar.');
  }
} catch (e) {
  console.error('Error de retención:', e.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
