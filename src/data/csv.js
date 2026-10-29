// Bertika - Exportacion CSV segura. FUENTE UNICA.
//
// La usan el panel (src/pages/Reportes.jsx) y la API (export de WhatsApp), asi
// las dos exportan igual y ninguna puede olvidarse de escapar.
//
// Dos cosas que hay que hacer siempre:
//   1. Escapar comillas y saltos de linea (si no, una celda rompe las columnas).
//   2. Neutralizar formulas: Excel/LibreOffice ejecutan una celda que empieza
//      con = + - @ o tab. Un cliente puede escribir "=HYPERLINK(...)" por
//      WhatsApp y el admin lo abre en el CSV. Se antepone un apostrofo, que
//      Excel interpreta como "esto es texto".
//
// Los numeros negativos ("-50") se dejan como estan: son datos, no formulas.

const NUMERO = /^-?\d+(?:[.,]\d+)?$/;

export function celdaCsv(valor) {
  let s = String(valor ?? '').replace(/[\r\n]+/g, ' ');
  // Se mira el texto sin espacios iniciales: " =1+1" también lo evalúa Excel.
  const limpio = s.replace(/^\s+/, '');
  if (/^[=+\-@]/.test(limpio) && !NUMERO.test(limpio)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// Arma el archivo completo. `separador` es ';' en el export de WhatsApp (para
// Excel en espanol) y ',' en Reportes. El BOM hace que Excel respete los acentos.
export function filasCsv(filas, { separador = ',', bom = true } = {}) {
  const sep = separador === ';' ? ';' : ',';
  const lineas = (Array.isArray(filas) ? filas : [])
    .map((fila) => (Array.isArray(fila) ? fila : [fila]).map(celdaCsv).join(sep))
    .join('\r\n');
  return (bom ? '\uFEFF' : '') + lineas;
}

// Lector CSV para importar listas. Acepta coma o punto y coma, comillas
// dobles escapadas ("") y saltos de línea dentro de una celda.
export function parseCsv(texto, { separador } = {}) {
  let s = String(texto ?? '').replace(/^\uFEFF/, '');
  if (!s.trim()) return [];
  let sep = separador;
  if (sep !== ';' && sep !== ',') {
    const primera = s.split(/\r?\n/)[0] || '';
    const puntoYComa = (primera.match(/;/g) || []).length;
    const comas = (primera.match(/,/g) || []).length;
    sep = puntoYComa > comas ? ';' : ',';
  }
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (entreComillas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i += 1; } else entreComillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') { entreComillas = true; continue; }
    if (ch === sep) { fila.push(campo); campo = ''; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      fila.push(campo); campo = '';
      if (fila.some((c) => String(c).trim() !== '')) filas.push(fila);
      fila = [];
      continue;
    }
    campo += ch;
  }
  fila.push(campo);
  if (fila.some((c) => String(c).trim() !== '')) filas.push(fila);
  return filas;
}

// Convierte una celda de CSV al tipo de campo de la lista.
export function valorDesdeCsv(campo, celda) {
  const texto = String(celda ?? '').trim();
  if (texto === '') return campo?.tipo === 'multiseleccion' ? [] : (campo?.tipo === 'checkbox' ? false : null);
  if (campo?.tipo === 'numero' || campo?.tipo === 'moneda') {
    const limpio = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(limpio);
    return Number.isFinite(n) ? n : texto;
  }
  if (campo?.tipo === 'checkbox') return /^(1|si|sí|true|verdadero|sí)$/i.test(texto);
  if (campo?.tipo === 'multiseleccion') return texto.split(/[;,]/).map((v) => v.trim()).filter(Boolean);
  if (campo?.tipo === 'fecha') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
    if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return texto;
}
