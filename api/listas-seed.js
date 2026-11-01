// Siembra inicial del área Ventas: tres listas base, campos y vistas.
// Se ejecuta una sola vez, cuando el área no tiene ninguna lista (ni archivada).
import { randomUUID } from 'node:crypto';
import { query, tx } from './db.js';

const id = (prefijo) => `${prefijo}_${randomUUID()}`;

const PROSPECTOS = {
  clave: 'prospectos',
  nombre: 'Prospectos',
  descripcion: 'Contactos comerciales que todavía no son clientes del taller.',
  icono: 'users',
  campos: [
    { nombre: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'Empresa', tipo: 'texto' },
    { nombre: 'Email', tipo: 'email' },
    { nombre: 'Teléfono', tipo: 'telefono' },
    { nombre: 'Origen', tipo: 'seleccion', config: { opciones: ['Web', 'WhatsApp', 'Recomendación', 'Redes', 'Otro'] } },
    { nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Nuevo', 'Contactado', 'Calificado', 'Descartado'] } },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Próxima acción', tipo: 'fecha' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Todos los prospectos', tipo: 'grid', predeterminada: true, config: {} },
    { nombre: 'Para contactar', tipo: 'grid', config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'Nuevo' }] }) },
  ],
};

const OPORTUNIDADES = {
  clave: 'oportunidades',
  nombre: 'Oportunidades',
  descripcion: 'Pipeline comercial: etapas, montos y próximos cierres.',
  icono: 'dollar',
  campos: [
    { nombre: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'Prospecto', tipo: 'texto' },
    { nombre: 'Etapa', tipo: 'seleccion', config: { opciones: ['Prospección', 'Contacto', 'Propuesta', 'Negociación', 'Ganada', 'Perdida'] } },
    { nombre: 'Monto', tipo: 'moneda', config: { min: 0 } },
    { nombre: 'Probabilidad', tipo: 'numero', config: { min: 0, max: 100 } },
    { nombre: 'Cierre estimado', tipo: 'fecha' },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Pipeline', tipo: 'kanban', predeterminada: true, config: ({ Etapa, Nombre }) => ({ kanban: Etapa, titulo: Nombre }) },
    { nombre: 'Mis oportunidades', tipo: 'grid', config: ({ Responsable }) => ({ mis: 'responsable', responsable: Responsable }) },
    { nombre: 'Todas', tipo: 'grid', config: {} },
  ],
};

const ACTIVIDADES = {
  clave: 'actividades',
  nombre: 'Actividades',
  descripcion: 'Llamadas, mensajes, reuniones y visitas del equipo comercial.',
  icono: 'calendar',
  campos: [
    { nombre: 'Título', tipo: 'texto', requerido: true },
    { nombre: 'Tipo', tipo: 'seleccion', config: { opciones: ['Llamada', 'Email', 'Reunión', 'WhatsApp', 'Visita'] } },
    { nombre: 'Fecha', tipo: 'fecha' },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Pendiente', 'Hecha', 'Cancelada'] } },
    { nombre: 'Referencia', tipo: 'texto' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Pendientes', tipo: 'grid', predeterminada: true, config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'Pendiente' }] }) },
    { nombre: 'Todas', tipo: 'grid', config: {} },
  ],
};

const LISTAS_VENTAS = [PROSPECTOS, OPORTUNIDADES, ACTIVIDADES];

const MATERIALES = {
  clave: 'materiales',
  nombre: 'Materiales',
  descripcion: 'Materiales y repuestos del taller, con stock y ubicación.',
  icono: 'box',
  campos: [
    { nombre: 'Material', tipo: 'texto', requerido: true },
    { nombre: 'Categoría', tipo: 'seleccion', config: { opciones: ['Eléctrico', 'Mecánico', 'Químico', 'Ferretería', 'Otro'] } },
    { nombre: 'Stock', tipo: 'numero', config: { min: 0 } },
    { nombre: 'Stock mínimo', tipo: 'numero', config: { min: 0 } },
    { nombre: 'Unidad', tipo: 'seleccion', config: { opciones: ['Unidad', 'Metro', 'Kilo', 'Litro', 'Caja'] } },
    { nombre: 'Ubicación', tipo: 'texto' },
    { nombre: 'Proveedor', tipo: 'texto' },
    { nombre: 'Última compra', tipo: 'fecha' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Todos', tipo: 'grid', predeterminada: true, config: {} },
    { nombre: 'Sin stock', tipo: 'grid', config: ({ Stock }) => ({ filtros: [{ campo: Stock, op: 'igual', valor: '0' }] }) },
  ],
};

const HERRAMIENTAS = {
  clave: 'herramientas',
  nombre: 'Herramientas',
  descripcion: 'Herramientas del taller, responsables y estado de uso.',
  icono: 'tools',
  campos: [
    { nombre: 'Herramienta', tipo: 'texto', requerido: true },
    { nombre: 'Código', tipo: 'texto', unico: true },
    { nombre: 'Estado', tipo: 'seleccion', config: { opciones: ['Disponible', 'En uso', 'En reparación', 'Perdida'] } },
    { nombre: 'Responsable', tipo: 'persona' },
    { nombre: 'Ubicación', tipo: 'texto' },
    { nombre: 'Último mantenimiento', tipo: 'fecha' },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Todas', tipo: 'grid', predeterminada: true, config: {} },
    { nombre: 'En uso', tipo: 'grid', config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'En uso' }] }) },
    { nombre: 'Para reparar', tipo: 'grid', config: ({ Estado }) => ({ filtros: [{ campo: Estado, op: 'igual', valor: 'En reparación' }] }) },
  ],
};

const INSUMOS = {
  clave: 'insumos',
  nombre: 'Insumos',
  descripcion: 'Insumos consumibles, precios y puntos de reposición.',
  icono: 'droplet',
  campos: [
    { nombre: 'Insumo', tipo: 'texto', requerido: true },
    { nombre: 'Tipo', tipo: 'seleccion', config: { opciones: ['Químico', 'Eléctrico', 'Lubricante', 'Seguridad', 'Otro'] } },
    { nombre: 'Stock', tipo: 'numero', config: { min: 0 } },
    { nombre: 'Stock mínimo', tipo: 'numero', config: { min: 0 } },
    { nombre: 'Unidad', tipo: 'seleccion', config: { opciones: ['Unidad', 'Litro', 'Kilo', 'Metro', 'Caja'] } },
    { nombre: 'Proveedor', tipo: 'texto' },
    { nombre: 'Precio', tipo: 'moneda', config: { min: 0 } },
    { nombre: 'Notas', tipo: 'texto_largo' },
  ],
  vistas: [
    { nombre: 'Todos', tipo: 'grid', predeterminada: true, config: {} },
    { nombre: 'Sin stock', tipo: 'grid', config: ({ Stock }) => ({ filtros: [{ campo: Stock, op: 'igual', valor: '0' }] }) },
  ],
};

const LISTAS_TALLER = [MATERIALES, HERRAMIENTAS, INSUMOS];

async function insertarDefinicion(client, def, areaId, nombre, usuario, orden) {
  const listaId = id('lst');
  await client.query(
    `INSERT INTO listas (id, area_id, nombre, descripcion, icono, orden, creada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [listaId, areaId, nombre || def.nombre, def.descripcion, def.icono, orden, usuario]
  );
  const campos = {};
  let ordenCampo = 0;
  for (const campo of def.campos || []) {
    ordenCampo += 10;
    const campoId = id('cam');
    campos[campo.nombre] = campoId;
    await client.query(
      `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [campoId, listaId, campo.nombre, campo.tipo, campo.config || {}, campo.requerido === true, campo.unico === true, ordenCampo]
    );
  }
  let primera = true;
  for (const vista of def.vistas || []) {
    const config = typeof vista.config === 'function' ? vista.config(campos) : (vista.config || {});
    const predeterminada = vista.predeterminada === true || (primera && !def.vistas.some((v) => v.predeterminada));
    await client.query(
      `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
       VALUES ($1,$2,$3,$4,$5::jsonb,'compartida',$6,$7)`,
      [id('vis'), listaId, vista.nombre, vista.tipo || 'grid', config, usuario, predeterminada]
    );
    primera = false;
  }
  return listaId;
}

async function sembrarArea(areaId, defs) {
  const [uso] = await query('SELECT count(*)::int AS n FROM listas WHERE area_id = $1', [areaId]);
  if (Number(uso?.n) > 0) return { creadas: 0 };

  let creadas = 0;
  await tx(async (client) => {
    for (const def of defs) {
      await insertarDefinicion(client, def, areaId, def.nombre, 'sistema', (creadas + 1) * 10);
      creadas += 1;
    }
  });
  return { creadas };
}

export const PLANTILLAS = [
  ...LISTAS_VENTAS.map((d) => ({ ...d, area_id: 'area_ventas' })),
  ...LISTAS_TALLER.map((d) => ({ ...d, area_id: 'area_taller' })),
];

export async function crearListaDesdePlantilla({ clave, areaId, nombre, usuario }) {
  const def = PLANTILLAS.find((p) => p.clave === clave && p.area_id === areaId);
  if (!def) return null;
  let listaId;
  await tx(async (client) => {
    listaId = await insertarDefinicion(client, def, areaId, nombre || def.nombre, usuario || 'sistema', 0);
  });
  return { id: listaId, def };
}

export async function sembrarListasVentas() {
  return sembrarArea('area_ventas', LISTAS_VENTAS);
}

export async function sembrarListasTaller() {
  return sembrarArea('area_taller', LISTAS_TALLER);
}
