// Catalogo de permisos de Bertika.
//
// Fuente unica: src/data/permisos.js (la misma que usa el frontend). Este modulo
// solo reexporta para que api/server.js importe './permisos.js' sin cambios.
//
// La ruta relativa funciona en produccion porque scripts/deploy.sh copia
// src/data/ a /var/www/bertika/src/data/ junto con api/.
export {
  SECCIONES,
  SECCIONES_CLIENTE,
  ACCIONES,
  TODAS_SECCIONES,
  TODAS_ACCIONES,
  PERMISOS_POR_ROL,
  ROL_LABEL_PERMISOS,
  permisosDeRol,
  normalizarPermisos,
  permisosEfectivos,
  puedeVer,
  puedeHacer,
  resumenPermisos,
} from '../src/data/permisos.js';
