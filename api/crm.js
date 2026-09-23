// Embudo comercial y CRM de Bertika.
//
// Fuente unica: src/data/crm.js (la misma que usa el frontend). Este modulo
// solo reexporta para que api/server.js importe './crm.js' sin cambios.
//
// La ruta relativa funciona en produccion porque scripts/deploy.sh copia
// src/data/ a /var/www/bertika/src/data/ junto con api/.
export {
  ETAPAS,
  ETAPA_DEFAULT,
  ETAPAS_ABIERTAS,
  FLUJO,
  TIPOS_CLIENTE,
  normalizarEtapa,
  normalizarTipoCliente,
  normalizarMonto,
  resumenEmbudo,
  agruparEmbudo,
  CAMPOS_COMERCIALES,
  CANALES_ORIGEN,
  camposComercialesCargados,
  MOTIVOS_PERDIDA,
  faltaMotivoPerdida,
  calcularMetricas,
  formatearDuracion,
  formatearTasa,
  ESTADOS_TAREA,
  normalizarEstadoTarea,
  tareaVencida,
  ordenarTareas,
  contarTareasPendientes,
} from '../src/data/crm.js';
