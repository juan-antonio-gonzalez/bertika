// Prueba real contra un bucket S3/R2. Requiere STORAGE_DRIVER=s3 y S3_*.
import { randomUUID } from 'node:crypto';
import { borrarPrivado, guardarPrivado, leerPrivado, validarStorage } from '../api/storage.js';

const info = validarStorage();
if (info.driver !== 's3') throw new Error('Configurá STORAGE_DRIVER=s3 y las variables S3_* para probar el bucket real.');
const clave = `healthcheck-${randomUUID()}.txt`;
const contenido = Buffer.from('bertika-storage-healthcheck');
await guardarPrivado(clave, contenido);
const leido = await leerPrivado(clave);
if (!leido.equals(contenido)) throw new Error('El contenido leído no coincide.');
await borrarPrivado(clave);
console.log(`S3/R2 OK · ${info.publicBase || 'bucket'} · ${clave}`);
