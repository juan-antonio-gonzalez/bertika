// Validaciones chicas y puras que usan los endpoints.
//
// normalizarBooleano: acepta true/false, 1/0 y los textos "true"/"false"
// (lo que manda un formulario o un <select>). Devuelve null si el valor no es
// reconocible, asi el endpoint responde 400 en vez de guardar cualquier cosa.
// Antes, con Boolean(activo), un "false" de texto dejaba al usuario ACTIVO.
export function normalizarBooleano(valor) {
  if (typeof valor === 'boolean') return valor;
  if (valor === 1 || valor === 0) return valor === 1;
  if (typeof valor === 'string') {
    const v = valor.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return null;
}
