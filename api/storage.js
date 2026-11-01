// Almacenamiento de archivos.
//
// STORAGE_DRIVER=local (por defecto) usa UPLOAD_DIR/PRIVATE_UPLOAD_DIR.
// STORAGE_DRIVER=s3 usa S3 o R2 (API compatible) con firma SigV4, sin SDK.
// En S3 las claves no llevan barras; los archivos privados se sirven por proxy.
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = process.env.STORAGE_DRIVER || 'local';
const PUBLIC_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || path.join(__dirname, 'uploads-private');
const PUBLIC_BASE = (process.env.PUBLIC_URL || 'https://bertika.com').replace(/\/$/, '');

const S3 = {
  endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
  bucket: process.env.S3_BUCKET || '',
  region: process.env.S3_REGION || 'auto',
  accessKey: process.env.S3_ACCESS_KEY_ID || '',
  secretKey: process.env.S3_SECRET_ACCESS_KEY || '',
  publicBase: (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, ''),
};

const usaS3 = DRIVER === 's3';

function sha256(datos) {
  return createHash('sha256').update(datos).digest('hex');
}
function hmac(clave, datos) {
  return createHmac('sha256', clave).update(datos).digest();
}
function encodeSegmento(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function encodeClave(clave) {
  return String(clave).split('/').map(encodeSegmento).join('/');
}

async function s3Request(metodo, clave, cuerpo = null, contentType = null) {
  if (!S3.endpoint || !S3.bucket || !S3.accessKey || !S3.secretKey) {
    throw new Error('S3/R2 no está configurado (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).');
  }
  const url = new URL(`${S3.endpoint}/${S3.bucket}/${encodeClave(clave)}`);
  const ahora = new Date();
  const amzFecha = ahora.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const fecha = amzFecha.slice(0, 8);
  const payloadHash = sha256(cuerpo || Buffer.alloc(0));
  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzFecha,
  };
  if (contentType) headers['content-type'] = contentType;
  const firmados = Object.keys(headers).sort();
  const canonicalHeaders = firmados.map((h) => `${h}:${headers[h]}\n`).join('');
  const canonicalRequest = [metodo, url.pathname, url.search.slice(1), canonicalHeaders, firmados.join(';'), payloadHash].join('\n');
  const scope = `${fecha}/${S3.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzFecha, scope, sha256(canonicalRequest)].join('\n');
  const kFecha = hmac(`AWS4${S3.secretKey}`, fecha);
  const kRegion = hmac(kFecha, S3.region);
  const kServicio = hmac(kRegion, 's3');
  const kFirma = hmac(kServicio, 'aws4_request');
  const firma = hmac(kFirma, stringToSign).toString('hex');
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${S3.accessKey}/${scope}, SignedHeaders=${firmados.join(';')}, Signature=${firma}`;
  const opciones = { method: metodo, headers };
  if (cuerpo && metodo !== 'GET') opciones.body = cuerpo;
  const res = await fetch(url, opciones);
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`S3 ${metodo} ${res.status}: ${texto.slice(0, 200)}`);
  }
  return res;
}

export function storageInfo() {
  return { driver: usaS3 ? 's3' : 'local', publicBase: usaS3 ? S3.publicBase : `${PUBLIC_BASE}/uploads` };
}

export async function guardarPublico(clave, buffer) {
  if (usaS3) {
    await s3Request('PUT', clave, buffer, 'application/octet-stream');
    const base = S3.publicBase || `${S3.endpoint}/${S3.bucket}`;
    return { key: clave, url: `${base}/${encodeClave(clave)}` };
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(path.join(PUBLIC_DIR, clave), buffer);
  return { key: clave, url: `${PUBLIC_BASE}/uploads/${clave}` };
}

export async function guardarPrivado(clave, buffer) {
  if (usaS3) { await s3Request('PUT', clave, buffer, 'application/octet-stream'); return { key: clave }; }
  mkdirSync(PRIVATE_DIR, { recursive: true });
  writeFileSync(path.join(PRIVATE_DIR, clave), buffer);
  return { key: clave };
}

export async function leerPrivado(clave) {
  if (usaS3) return Buffer.from(await (await s3Request('GET', clave)).arrayBuffer());
  return readFileSync(path.join(PRIVATE_DIR, clave));
}

export async function leerMedia(clave) {
  if (clave && path.isAbsolute(clave)) {
    const base = path.resolve(PUBLIC_DIR);
    const ruta = path.resolve(clave);
    if (ruta.startsWith(`${base}${path.sep}`)) return readFileSync(ruta);
    throw new Error('Archivo fuera del directorio de uploads');
  }
  if (usaS3) return Buffer.from(await (await s3Request('GET', clave)).arrayBuffer());
  const ruta = path.join(PUBLIC_DIR, String(clave || ''));
  if (!ruta.startsWith(`${path.resolve(PUBLIC_DIR)}${path.sep}`)) throw new Error('Archivo inválido');
  return readFileSync(ruta);
}

export async function borrarPrivado(clave) {
  if (usaS3) { await s3Request('DELETE', clave); return; }
  // No se borra en local por seguridad: la retención la maneja el operador.
}
