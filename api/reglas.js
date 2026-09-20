// Reglas de negocio de Bertika.
//
// Fuente unica: src/data/reglas.js (la misma que usa el frontend). Este modulo
// solo reexporta para que api/server.js siga importando './reglas.js' sin
// cambios, y para que exista un unico lugar donde tocar las transiciones.
//
// La ruta relativa funciona en produccion porque scripts/deploy.sh copia
// src/data/ a /var/www/bertika/src/data/ junto con api/.
export {
  ORDEN_ESTADOS,
  ESTADOS,
  ESTADO_LABEL,
  TRANSITIONS,
  FLOW_CHAIN,
  MIN_CAPACIDAD_PCT,
  canTransition,
} from '../src/data/reglas.js';
