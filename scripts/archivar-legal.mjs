// Bertika - Congela una version de los documentos legales.
//
// Uso:  npm run legal:archivar
//
// Lee los textos de src/data/legal.js, escribe una copia HTML autonoma en
// public/legal/archivo/<version>/ y actualiza el manifiesto con el SHA-256 de
// cada documento. Ese hash es el que guarda el consentimiento: si el texto
// cambia, la version tiene que cambiar y se archiva de nuevo.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_DOCS, LEGAL_META, textoLegalCanonico } from '../src/data/legal.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(RAIZ, 'public', 'legal', 'archivo');
const VERSION = LEGAL_META.version;

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

const envoltura = (titulo, contenido) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${titulo} · Bertika · ${VERSION}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f5f7fa; color: #1b2430; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.65; }
    main { max-width: 860px; margin: 0 auto; padding: 40px 22px 64px; }
    .volver { display: inline-block; margin-bottom: 18px; color: #b45309; text-decoration: none; font-weight: 600; }
    .hoja { background: #fff; border: 1px solid #e3e8ef; border-radius: 14px; padding: 30px 34px; box-shadow: 0 10px 30px rgba(16, 24, 40, .06); }
    h1 { margin: 0 0 6px; font-size: 28px; color: #0a1740; }
    .meta { color: #667085; font-size: 13px; margin: 0 0 22px; }
    h2 { margin: 28px 0 8px; font-size: 18px; color: #0a1740; }
    p, li { font-size: 15px; }
    a { color: #b45309; }
    code { background: #f2f4f8; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
    .legal-nota { background: #fff8e6; border: 1px solid #f0d48a; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; }
    th, td { border: 1px solid #e3e8ef; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f2f4f8; }
    @media (max-width: 560px) { main { padding: 22px 12px 40px; } .hoja { padding: 20px 16px; } }
  </style>
</head>
<body>
  <main>
    <a class="volver" href="/legal/versiones">← Versiones legales</a>
    <div class="hoja">
      <h1>${titulo}</h1>
      <p class="meta">Versión ${VERSION} · ${LEGAL_META.actualizado} · Copia congelada: no se modifica.</p>
      ${contenido}
    </div>
  </main>
</body>
</html>
`;

const documentos = [];
for (const [clave, doc] of Object.entries(LEGAL_DOCS)) {
  const canonico = textoLegalCanonico(doc.html);
  const hash = sha256(canonico);
  const carpeta = path.join(BASE, VERSION);
  mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${clave}.html`);
  writeFileSync(archivo, envoltura(doc.titulo, doc.html), 'utf8');
  documentos.push({
    clave,
    titulo: doc.titulo,
    url: `/legal/archivo/${VERSION}/${clave}.html`,
    sha256: hash,
  });
  console.log(`  archivo  ${path.relative(RAIZ, archivo)}`);
  console.log(`  sha256   ${hash}`);
}

const manifiesto = path.join(BASE, 'index.json');
let versiones = [];
if (existsSync(manifiesto)) {
  try {
    versiones = JSON.parse(readFileSync(manifiesto, 'utf8'));
    if (!Array.isArray(versiones)) versiones = [];
  } catch {
    versiones = [];
  }
}
const entrada = { version: VERSION, fecha: LEGAL_META.actualizado, documentos };
const sinLaActual = versiones.filter((v) => v?.version !== VERSION);
const ordenadas = [entrada, ...sinLaActual].sort((a, b) => String(b.version).localeCompare(String(a.version)));
writeFileSync(manifiesto, `${JSON.stringify(ordenadas, null, 2)}\n`, 'utf8');
console.log(`\nManifiesto actualizado: public/legal/archivo/index.json (${ordenadas.length} versión/es)`);
