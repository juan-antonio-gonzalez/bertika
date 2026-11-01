// Copia los archivos locales existentes a S3/R2. No borra los locales.
// Uso: STORAGE_DRIVER=s3 ... node scripts/migrar-storage-s3.mjs [--aplicar]
// Sin --aplicar solo lista lo que haría.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { guardarPublico, guardarPrivado, validarStorage } from '../api/storage.js';

const aplicar = process.argv.includes('--aplicar');
const info = validarStorage();
if (info.driver !== 's3') throw new Error('Configurá STORAGE_DRIVER=s3 y las variables S3_* antes de migrar.');
const publicDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'api/uploads');
const privateDir = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'api/uploads-private');

function archivos(dir) {
  try { return readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isFile()); }
  catch { return []; }
}

let copiados = 0;
for (const [dir, guardar, tipo] of [[publicDir, guardarPublico, 'publico'], [privateDir, guardarPrivado, 'privado']]) {
  for (const nombre of archivos(dir)) {
    console.log(`${aplicar ? 'subiendo' : 'pendiente'} ${tipo}: ${nombre}`);
    if (!aplicar) continue;
    const ruta = path.join(dir, nombre);
    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(ruta));
    await guardar(nombre, buffer);
    copiados += 1;
  }
}
console.log(aplicar ? `Copiados: ${copiados}` : 'Dry-run. Volvé a correr con --aplicar.');
