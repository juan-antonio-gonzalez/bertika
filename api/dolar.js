// Bertika - Cotización del dólar oficial para el cotizador de visitas.
//
// La web NO llama a terceros desde el navegador: pega a GET /api/public/dolar
// (mismo origen) y este módulo resuelve el valor contra proveedores públicos,
// con caché corta y caída al siguiente proveedor si el primero falla.
//
// El "dólar oficial" se publica una vez por día hábil (cierre del BCRA), así que
// "tiempo real" acá significa: valor vigente + su fecha de actualización real,
// refrescado cada DOLAR_CACHE_MS (10 minutos por defecto).

const CACHE_MS = Number(process.env.DOLAR_CACHE_MS || 10 * 60 * 1000);
const TIMEOUT_MS = Number(process.env.DOLAR_TIMEOUT_MS || 6000);
const CASA = process.env.DOLAR_CASA || 'oficial';

// Proveedores en orden de preferencia. Para cambiar de casa (blue, bolsa, etc.)
// alcanza con apuntar la URL al endpoint correspondiente.
const FUENTES = [
  {
    nombre: 'dolarapi.com',
    url: 'https://dolarapi.com/v1/dolares/oficial',
    parse: (j) => ({ compra: j?.compra, venta: j?.venta, actualizado: j?.fechaActualizacion }),
  },
  {
    nombre: 'bluelytics',
    url: 'https://api.bluelytics.com.ar/v2/latest',
    parse: (j) => ({ compra: j?.oficial?.value_buy, venta: j?.oficial?.value_sell, actualizado: j?.last_update }),
  },
];

let cache = null; // { datos, expira }

export function resetCacheDolar() {
  cache = null;
}

export async function obtenerDolar({ fetchImpl = fetch, forzar = false, timeoutMs = TIMEOUT_MS } = {}) {
  const ahora = Date.now();
  if (!forzar && cache && cache.expira > ahora) return { ...cache.datos, cacheado: true };

  for (const fuente of FUENTES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(fuente.url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const d = fuente.parse(json);
      const venta = Number(d.venta);
      if (!Number.isFinite(venta) || venta <= 0) continue;
      const datos = {
        disponible: true,
        casa: CASA,
        compra: Number.isFinite(Number(d.compra)) ? Number(d.compra) : null,
        venta,
        fuente: fuente.nombre,
        actualizado: d.actualizado || null,
        consultado: new Date().toISOString(),
        vencido: false,
      };
      cache = { datos, expira: ahora + CACHE_MS };
      return datos;
    } catch {
      // se intenta con el siguiente proveedor
    } finally {
      clearTimeout(timer);
    }
  }

  // Si ningún proveedor respondió y tenemos un valor previo, se sirve marcado
  // como vencido: mejor un valor con su fecha que ningún valor.
  if (cache) return { ...cache.datos, vencido: true, cacheado: true };
  return { disponible: false, casa: CASA, motivo: 'No se pudo obtener la cotización del dólar', consultado: new Date().toISOString() };
}
