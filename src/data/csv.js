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
