// Bertika - Reglas de inventario. FUENTE UNICA.
//
// El umbral de "stock critico" es configurable por insumo (columna
// insumos.stock_minimo). Antes estaba fijo en 3, repetido en cuatro pantallas.
// La usan el frontend (sidebar, dashboard, inventario, orden) y la API.

export const STOCK_MINIMO_DEFAULT = 3;

// Umbral del insumo: si no tiene uno valido cargado, se usa el de fabrica.
// Ojo: null, '' y undefined son "sin cargar" (Number('') daria 0, que no es un
// umbral valido sino la ausencia de dato).
export function stockMinimo(insumo) {
  const valor = insumo?.stock_minimo;
  if (valor === null || valor === undefined || valor === '') return STOCK_MINIMO_DEFAULT;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : STOCK_MINIMO_DEFAULT;
}

// Un insumo esta critico cuando su stock quedo por debajo del umbral.
export function esStockCritico(insumo) {
  const stock = Number(insumo?.stock);
  return (Number.isFinite(stock) ? stock : 0) < stockMinimo(insumo);
}

// Cuantos insumos estan criticos (para el contador del sidebar).
export function contarCriticos(insumos) {
  return (Array.isArray(insumos) ? insumos : []).filter(esStockCritico).length;
}
