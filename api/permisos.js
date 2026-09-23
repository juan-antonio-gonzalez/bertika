// Catalogo de permisos de Bertika.
//
// Fuente unica: src/data/permisos.js (la misma que usa el frontend). Este modulo
// solo reexporta para que api/server.js y el middleware importen './permisos.js'
// sin duplicar el catalogo.
//
// La ruta relativa funciona en produccion porque scripts/deploy.sh copia
// src/data/ a /var/www/bertika/src/data/ junto con api/.
export {
  COLUMNAS,
  PERMISOS,
  CLAVES,
  SECCIONES,
  agruparPermisos,
  permisosPorDefecto,
  normalizarPermisos,
  permisosEfectivos,
  tienePermiso,
  puedeVer,
  puedeHacer,
  resumenPermisos,
  seccionDeRuta,
  inicioDe,
} from '../src/data/permisos.js';
