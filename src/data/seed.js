const H = 60 * 60 * 1000;
const D = 24 * H;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const baseEvents = [];

export const ORDEN_ESTADOS = [
  { key: 'received', label: 'Recibida' },
  { key: 'diagnosing', label: 'Diagnostico' },
  { key: 'quoted', label: 'Cotizada' },
  { key: 'approved', label: 'Aprobada' },
  { key: 'in_repair', label: 'En reparacion' },
  { key: 'testing', label: 'Prueba final' },
  { key: 'ready', label: 'Lista' },
  { key: 'delivered', label: 'Entregada' },
  { key: 'cancelled', label: 'Cancelada' },
];

export const ESTADO_LABEL = Object.fromEntries(
  ORDEN_ESTADOS.map((e) => [e.key, e.label])
);

// Flujo visible en el tracker (pasos de negocio)
export const TRACKER_STEPS = [
  { key: 'received', label: 'Recibida' },
  { key: 'diagnosing', label: 'Diagnostico' },
  { key: 'quoted', label: 'Cotizacion' },
  { key: 'approved', label: 'En reparacion' },
  { key: 'testing', label: 'Prueba final' },
  { key: 'ready', label: 'Lista' },
  { key: 'delivered', label: 'Entregada' },
];

// Indice del paso alcanzado segun el estado de la orden
export const STATUS_STEP_INDEX = {
  received: 0,
  diagnosing: 1,
  quoted: 2,
  approved: 3,
  in_repair: 3,
  testing: 4,
  ready: 5,
  delivered: 6,
  cancelled: 0,
};

export const TRANSITIONS = {
  received: ['diagnosing'],
  diagnosing: ['quoted'],
  quoted: ['approved', 'cancelled'],
  approved: ['in_repair'],
  in_repair: ['testing'],
  testing: ['ready', 'in_repair'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Transicion central del negocio
export const FLOW_CHAIN = [
  'received',
  'diagnosing',
  'quoted',
  'approved',
  'in_repair',
  'testing',
  'ready',
  'delivered',
];

export const seedTecnicos = [
  { id: 'tec_01', nombre: 'Carlos Ruiz', especialidad: 'Plomo-Acido', certificaciones: ['Manejo de materiales peligrosos', 'Reacondicionamiento de celdas'], activo: true },
  { id: 'tec_02', nombre: 'Luis Hernandez', especialidad: 'Litio / Ion-Litio', certificaciones: ['Alta tension', 'BMS y electronica de potencia'], activo: true },
  { id: 'tec_03', nombre: 'Andres Morales', especialidad: 'Industrial Pesado', certificaciones: ['UPS / telecom', 'Edicion de bancos estacionarios'], activo: true },
  { id: 'tec_04', nombre: 'Sofia Ramirez', especialidad: 'Ferroviario', certificaciones: ['Bancos Ni-Cd ferroviarios', 'Manejo de materiales peligrosos'], activo: true },
  { id: 'tec_05', nombre: 'Diego Sanchez', especialidad: 'Plomo-Acido', certificaciones: ['Arranque automotriz', 'Prueba de capacidad'], activo: true },
];

export const seedClientes = [
  { id: 'cli_01', nombre: 'Juan Garcia', tipo: 'particular', telefono: '5512345678', contacto: 'Juan Garcia' },
  { id: 'cli_02', nombre: 'Maria Lopez', tipo: 'particular', telefono: '5598765432', contacto: 'Maria Lopez' },
  { id: 'cli_03', nombre: 'Logistica del Valle S.A. de C.V.', tipo: 'flotilla_corporativa', telefono: '5567891234', contacto: 'Ricardo Paredes (Jefe de Flotilla)' },
  { id: 'cli_04', nombre: 'Ferrocarriles del Norte', tipo: 'flotilla_corporativa', telefono: '5543219876', contacto: 'Ing. Elena Quintero (Mantenimiento)' },
  { id: 'cli_05', nombre: 'Telecom Centro S.A.', tipo: 'flotilla_corporativa', telefono: '5588881122', contacto: 'Mario Vega (Infraestructura)' },
];

export const seedBaterias = [
  { id: 'bat_01', numero_serie: 'BAT-AUT-001', tipo: 'AGM', voltaje: '12V', capacidad: 60, aplicacion: 'Automotriz', marca: 'Nissan', modelo: 'Sentra', equipo: 'Auto Nissan Sentra', fecha_fabricacion: '2023-04-10', cliente_id: 'cli_01', ciclos_estimados: 320, estado_vida: 'activa' },
  { id: 'bat_02', numero_serie: 'BAT-AUT-002', tipo: 'Plomo-Acido', voltaje: '12V', capacidad: 45, aplicacion: 'Automotriz', marca: 'Toyota', modelo: 'Corolla', equipo: 'Auto Toyota Corolla', fecha_fabricacion: '2022-08-22', cliente_id: 'cli_02', ciclos_estimados: 280, estado_vida: 'activa' },
  { id: 'bat_03', numero_serie: 'BAT-MTC-101', tipo: 'Litio (Ion-Litio)', voltaje: '48V', capacidad: 400, aplicacion: 'Autoelevador', marca: 'Toyota', modelo: '8FGU25', equipo: 'Montacargas Toyota 8FGU25 - Unidad 4', fecha_fabricacion: '2024-01-15', cliente_id: 'cli_03', ciclos_estimados: 1800, estado_vida: 'activa' },
  { id: 'bat_04', numero_serie: 'BAT-MTC-102', tipo: 'Plomo-Acido', voltaje: '36V', capacidad: 300, aplicacion: 'Autoelevador', marca: 'Hyster', modelo: 'H40XM', equipo: 'Montacargas Hyster - Unidad 7', fecha_fabricacion: '2021-11-03', cliente_id: 'cli_03', ciclos_estimados: 850, estado_vida: 'activa' },
  { id: 'bat_05', numero_serie: 'BAT-TRN-201', tipo: 'Ni-Cd', voltaje: '72V', capacidad: 200, aplicacion: 'Ferroviario', marca: 'GE', modelo: 'ES44', equipo: 'Locomotora GE ES44 - Banco 2', fecha_fabricacion: '2020-06-30', cliente_id: 'cli_04', ciclos_estimados: 2200, estado_vida: 'activa' },
  { id: 'bat_06', numero_serie: 'BAT-UPS-301', tipo: 'Plomo-Acido', voltaje: '48V', capacidad: 120, aplicacion: 'Industrial/UPS', marca: 'Vertiv', modelo: 'Libert SG', equipo: 'UPS planta central - Banco 3', fecha_fabricacion: '2023-09-12', cliente_id: 'cli_05', ciclos_estimados: 600, estado_vida: 'activa' },
  { id: 'bat_07', numero_serie: 'BAT-MAR-401', tipo: 'Gel', voltaje: '12V', capacidad: 100, aplicacion: 'Marino', marca: 'Mercruiser', modelo: 'Bravo III', equipo: 'Lancha de servicio - Motor 1', fecha_fabricacion: '2022-02-18', cliente_id: 'cli_02', ciclos_estimados: 400, estado_vida: 'activa' },
  { id: 'bat_08', numero_serie: 'BAT-AUT-003', tipo: 'Plomo-Acido', voltaje: '12V', capacidad: 55, aplicacion: 'Automotriz', marca: 'Ford', modelo: 'Focus', equipo: 'Auto Ford Focus', fecha_fabricacion: '2019-05-09', cliente_id: 'cli_01', ciclos_estimados: 240, estado_vida: 'en_garantia' },
  { id: 'bat_09', numero_serie: 'BAT-MTC-103', tipo: 'Plomo-Acido', voltaje: '36V', capacidad: 320, aplicacion: 'Autoelevador', marca: 'Yale', modelo: 'GLC8', equipo: 'Montacargas Yale - Unidad 11', fecha_fabricacion: '2018-10-01', cliente_id: 'cli_03', ciclos_estimados: 700, estado_vida: 'dada_de_baja' },
];

export const seedInsumos = [
  { id: 'ins_01', nombre: 'Celda de repuesto 2V (plomo-acido)', categoria: 'Celdas', stock: 15, precio: 650 },
  { id: 'ins_02', nombre: 'Electrolito acido sulfurico (1L)', categoria: 'Electrolito', stock: 20, precio: 95 },
  { id: 'ins_03', nombre: 'Borne/terminal universal', categoria: 'Bornes y Conectores', stock: 25, precio: 45 },
  { id: 'ins_04', nombre: 'Conector Anderson industrial', categoria: 'Bornes y Conectores', stock: 10, precio: 180 },
  { id: 'ins_05', nombre: 'Cargador industrial 24V/48V', categoria: 'Cargadores', stock: 3, precio: 8500 },
  { id: 'ins_06', nombre: 'Cargador de banco ferroviario 72V', categoria: 'Cargadores', stock: 1, precio: 22000 },
  { id: 'ins_07', nombre: 'Cable calibre 2/0 (metro)', categoria: 'Cables', stock: 30, precio: 120 },
  { id: 'ins_08', nombre: 'Guantes dielectricos (par)', categoria: 'EPP y Seguridad', stock: 6, precio: 650 },
  { id: 'ins_09', nombre: 'Careta facial anti-acido', categoria: 'EPP y Seguridad', stock: 4, precio: 380 },
  { id: 'ins_10', nombre: 'Celda Ni-Cd 1.2V (ferroviaria)', categoria: 'Celdas', stock: 2, precio: 980 },
  { id: 'ins_11', nombre: 'Puente/celda de repuesto 48V (litio)', categoria: 'Celdas', stock: 4, precio: 4200 },
];

export const seedBajas = [
  { id: 'baja_01', bateria_id: 'bat_09', serie: 'BAT-MTC-103', fecha: iso(now - 26 * D), motivo: 'Celdas irreparables / capacidad bajo 40%', disposicion: 'Reciclaje de plomo-acido autorizado', pila: false },
];

function evento(tipo, detalle, ms) {
  return { id: `ev_${baseEvents.length + 1}`, tipo, detalle, fecha: iso(ms) };
}

function orden(id, serie, cliente_id, tecnico_id, falla, estado, extra = {}) {
  return {
    id,
    bateria_serie: serie,
    cliente_id,
    tecnico_id: tecnico_id || null,
    falla,
    motivo: falla,
    estado,
    ...extra,
  };
}

// --- Ordenes iniciales (kanban vivo) ---
export const seedOrdenes = [
  orden('ord_01', 'BAT-AUT-001', 'cli_01', 'tec_01', 'No enciende por las mañanas, voltaje bajo en reposo', 'received', {
    fecha_ingreso: iso(now - 3 * H),
    hora_entrega: iso(now + 20 * H),
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Falla reportada: no enciende por las mananas, voltaje bajo en reposo.', now - 3 * H),
    ],
  }),

  orden('ord_02', 'BAT-MTC-101', 'cli_03', 'tec_02', 'Perdida de autonomia severa despues de 4 horas de operacion', 'diagnosing', {
    fecha_ingreso: iso(now - 26 * H),
    hora_entrega: iso(now + 10 * H),
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Falla reportada: perdida de autonomia severa tras 4 horas de operacion.', now - 26 * H),
      evento('diagnostico', 'Diagnostico iniciado por Luis Hernandez. Lecturas iniciales: 45.2V, RI 14.5 mOhm.', now - 20 * H),
    ],
  }),

  orden('ord_03', 'BAT-AUT-002', 'cli_02', 'tec_05', 'Bateria sulfatada, no retiene carga', 'quoted', {
    fecha_ingreso: iso(now - 2 * D),
    hora_entrega: iso(now + 8 * H),
    diagnostico: {
      voltaje_medido: 10.8,
      resistencia_interna: 9.2,
      prueba_carga: 'failed',
      notas: 'Sulfatacion avanzada en celdas 3 y 5. Capacidad medida 18Ah de 45Ah nominales.',
    },
    servicios: [
      'Reacondicionamiento (desulfatacion por pulsos)',
      'Relleno de electrolito',
      'Prueba de capacidad y carga completa',
    ],
    cotizacion: {
      monto: 1450,
      insumos: [
        { nombre: 'Electrolito acido sulfurico (1L)', cantidad: 2, precio: 95 },
        { nombre: 'Borne/terminal universal', cantidad: 1, precio: 45 },
      ],
      servicios_costos: [
        { nombre: 'Desulfatacion y reacondicionamiento', monto: 900 },
        { nombre: 'Mano de obra taller', monto: 315 },
      ],
    },
    estado_cotizacion: 'pending',
    prueba_final: { estado: 'pending' },
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Falla reportada: sulfatada, no retiene carga.', now - 2 * D),
      evento('diagnostico', 'Diagnostico registrado: 10.8V, RI 9.2 mOhm, prueba de carga fallida. Capacidad 18/45 Ah.', now - 2 * D + 4 * H),
      evento('cotizacion', 'Cotizacion enviada al cliente por $1,450 MXN. Esperando aprobacion.', now - 2 * D + 5 * H),
    ],
  }),

  orden('ord_04', 'BAT-MTC-102', 'cli_03', 'tec_01', 'No mantiene voltaje bajo carga, humedad en el banco', 'in_repair', {
    fecha_ingreso: iso(now - 3 * D),
    hora_entrega: iso(now + 30 * H),
    diagnumero: 0,
    diagnostico: {
      voltaje_medido: 31.5,
      resistencia_interna: 21.0,
      prueba_carga: 'failed',
      notas: 'Celda 12 en corto (separador roto). Reemplazo de celda y lavado de banco requerido.',
    },
    servicios: [
      'Reemplazo de celda defectuosa',
      'Lavado y limpieza general',
      'Recarga profunda de ecualizacion',
    ],
    cotizacion: {
      monto: 5200,
      insumos: [
        { nombre: 'Celda de repuesto 2V (plomo-acido)', cantidad: 1, precio: 650 },
      ],
      servicios_costos: [
        { nombre: 'Reemplazo de celda 2V', monto: 3000 },
        { nombre: 'Lavado y limpieza de banco', monto: 650 },
        { nombre: 'Mano de obra', monto: 900 },
      ],
    },
    estado_cotizacion: 'approved',
    insumos_utilizados: [
      { insumo_id: 'ins_01', nombre: 'Celda de repuesto 2V (plomo-acido)', cantidad: 1, precio: 650 },
      { insumo_id: 'ins_02', nombre: 'Electrolito acido sulfurico (1L)', cantidad: 3, precio: 95 },
    ],
    prueba_final: { estado: 'pending' },
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Falla reportada: no mantiene voltaje bajo carga, humedad en el banco.', now - 3 * D),
      evento('diagnostico', 'Diagnostico registrado: 31.5V, RI 21.0 mOhm. Celda 12 en corto.', now - 3 * D + 5 * H),
      evento('cotizacion', 'Cotizacion enviada por $5,200 MXN.', now - 3 * D + 6 * H),
      evento('aprobada', 'Cotizacion aprobada por Logistica del Valle S.A. de C.V.', now - 3 * D + 7 * H),
      evento('reparacion', 'Reparacion iniciada por Carlos Ruiz.', now - 2 * D),
      evento('insumo', 'Insumo utilizado: Celda de repuesto 2V (plomo-acido) x1', now - 2 * D + 1 * H),
      evento('insumo', 'Insumo utilizado: Electrolito acido sulfurico (1L) x3', now - 2 * D + 1 * H),
    ],
  }),

  orden('ord_05', 'BAT-TRN-201', 'cli_04', 'tec_04', 'Caida de voltaje en banco 2 durante traccion, revisar celdas Ni-Cd', 'testing', {
    fecha_ingreso: iso(now - 4 * D),
    hora_entrega: iso(now + 6 * H),
    diagnostico: {
      voltaje_medido: 65.4,
      resistencia_interna: 38.0,
      prueba_carga: 'passed',
      notas: 'Bajo electrolito en celdas laterales. Nivel corregido y ecualizacion aplicada.',
    },
    servicios: [
      'Nivelacion de electrolito en celdas Ni-Cd',
      'Ecualizacion de banco completo',
      'Prueba de capacidad 72V',
    ],
    cotizacion: {
      monto: 8900,
      insumos: [{ nombre: 'Electrolito acido sulfurico (1L)', cantidad: 4, precio: 95 }],
      servicios_costos: [
        { nombre: 'Servicio a banco Ni-Cd', monto: 6000 },
        { nombre: 'Prueba de capacidad 72V', monto: 2200 },
      ],
    },
    estado_cotizacion: 'approved',
    insumos_utilizados: [
      { insumo_id: 'ins_02', nombre: 'Electrolito acido sulfurico (1L)', cantidad: 4, precio: 95 },
    ],
    prueba_final: { estado: 'pending' },
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Falla reportada: caida de voltaje en banco 2 durante traccion.', now - 4 * D),
      evento('diagnostico', 'Diagnostico registrado: 65.4V, RI 38.0 mOhm. Electrolito bajo en celdas laterales.', now - 4 * D + 8 * H),
      evento('cotizacion', 'Cotizacion enviada por $8,900 MXN.', now - 4 * D + 9 * H),
      evento('aprobada', 'Cotizacion aprobada por Ferrocarriles del Norte.', now - 4 * D + 10 * H),
      evento('reparacion', 'Reparacion iniciada por Sofia Ramirez.', now - 3 * D),
      evento('insumo', 'Insumo utilizado: Electrolito acido sulfurico (1L) x4', now - 3 * D + 2 * H),
      evento('prueba_iniciada', 'Prueba final de carga/capacidad iniciada por Sofia Ramirez.', now - 1 * H),
    ],
  }),

  orden('ord_06', 'BAT-AUT-003', 'cli_01', 'tec_01', 'Reacondicionamiento programado preventivo', 'ready', {
    fecha_ingreso: iso(now - 5 * D),
    hora_entrega: iso(now + 2 * H),
    diagnostico: {
      voltaje_medido: 12.1,
      resistencia_interna: 6.8,
      prueba_carga: 'passed',
      notas: 'Bateria en buena condicion general, recarga profunda aplicada.',
    },
    servicios: [
      'Recarga profunda',
      'Limpieza de bornes',
      'Prueba de capacidad',
    ],
    cotizacion: {
      monto: 850,
      insumos: [],
      servicios_costos: [
        { nombre: 'Mantenimiento preventivo', monto: 650 },
        { nombre: 'Prueba de capacidad', monto: 200 },
      ],
    },
    estado_cotizacion: 'approved',
    insumos_utilizados: [
      { insumo_id: 'ins_03', nombre: 'Borne/terminal universal', cantidad: 1, precio: 45 },
    ],
    prueba_final: { estado: 'passed', capacidad_medida: 52, obs: 'Capacidad 52/55 Ah. Aprobada.' },
    eventos: [
      evento('ingreso', 'Bateria ingresada al taller. Reacondicionamiento preventivo programado.', now - 5 * D),
      evento('diagnostico', 'Diagnostico registrado: 12.1V, RI 6.8 mOhm. Prueba de carga aprobada.', now - 5 * D + 4 * H),
      evento('cotizacion', 'Cotizacion enviada por $850 MXN.', now - 5 * D + 5 * H),
      evento('aprobada', 'Cotizacion aprobada por el cliente.', now - 5 * D + 6 * H),
      evento('reparacion', 'Reparacion iniciada por Carlos Ruiz.', now - 4 * D),
      evento('insumo', 'Insumo utilizado: Borne/terminal universal x1', now - 4 * D + 3 * H),
      evento('prueba_iniciada', 'Prueba final iniciada.', now - 8 * H),
      evento('prueba_aprobada', 'Prueba final APROBADA. Capacidad 52/55 Ah.', now - 6 * H),
      evento('reparacion_completada', 'Reparacion completada. Bateria lista para entrega.', now - 6 * H),
    ],
  }),
];

// Orden historica entregada (para el historial del cliente y garantia)
export const seedOrdenHistorica = orden('ord_07', 'BAT-AUT-003', 'cli_01', 'tec_01', 'Bateria no retiene carga', 'delivered', {
  fecha_ingreso: iso(now - 90 * D),
  hora_entrega: iso(now - 90 * D + 30 * H),
  diagnostico: {
    voltaje_medido: 11.2,
    resistencia_interna: 10.4,
    prueba_carga: 'failed',
    notas: 'Sulfatacion moderada.',
  },
  servicios: ['Desulfatacion', 'Recarga profunda'],
  cotizacion: {
    monto: 1200,
    insumos: [{ nombre: 'Electrolito acido sulfurico (1L)', cantidad: 1, precio: 95 }],
    servicios_costos: [{ nombre: 'Reacondicionamiento', monto: 1105 }],
  },
  estado_cotizacion: 'approved',
  insumos_utilizados: [],
  prueba_final: { estado: 'passed', capacidad_medida: 53, obs: 'Aprobada.' },
  monto_cobrado: 1200,
  fecha_entrega: iso(now - 90 * D + 30 * H),
  garantia: { meses: 6, ciclos: 100, vence: iso(now) },
  eventos: [
    evento('ingreso', 'Bateria ingresada. Falla: no retiene carga.', now - 90 * D),
    evento('diagnostico', 'Diagnostico registrado.', now - 90 * D + 2 * H),
    evento('cotizacion', 'Cotizacion enviada por $1,200 MXN.', now - 90 * D + 3 * H),
    evento('aprobada', 'Aprobada por el cliente.', now - 90 * D + 4 * H),
    evento('reparacion', 'Reparacion iniciada.', now - 90 * D + 5 * H),
    evento('prueba_aprobada', 'Prueba final aprobada.', now - 90 * D + 27 * H),
    evento('entregada', 'Bateria entregada al cliente. $1,200 MXN cobrados.', now - 90 * D + 30 * H),
  ],
});

// Orden entregada reciente (garantia vigente)
export const seedOrdenEntregadaReciente = orden('ord_08', 'BAT-UPS-301', 'cli_05', 'tec_03', 'Alerta de bajo voltaje en banco UPS', 'delivered', {
  fecha_ingreso: iso(now - 12 * D),
  hora_entrega: iso(now - 11 * D),
  diagnostico: {
    voltaje_medido: '44.1V',
    resistencia_interna: 18.2,
    prueba_carga: 'failed',
    notas: 'Celda 21 degradada. Reemplazo preventivo.',
  },
  servicios: ['Reemplazo de celda', 'Prueba de autonomia'],
  cotizacion: {
    monto: 6800,
    insumos: [{ nombre: 'Celda de repuesto 2V (plomo-acido)', cantidad: 1, precio: 650 }],
    servicios_costos: [{ nombre: 'Servicio a banco UPS', monto: 6150 }],
  },
  estado_cotizacion: 'approved',
  insumos_utilizados: [],
  prueba_final: { estado: 'passed', capacidad_medida: 115, obs: 'Autonomia restaurada.' },
  monto_cobrado: 6800,
  fecha_entrega: iso(now - 11 * D),
  garantia: { meses: 12, ciclos: 200, vence: iso(now + 349 * D) },
  eventos: [
    evento('ingreso', 'Bateria ingresada. Alerta de bajo voltaje en banco UPS.', now - 12 * D),
    evento('diagnostico', 'Diagnostico registrado.', now - 12 * D + 3 * H),
    evento('cotizacion', 'Cotizacion enviada por $6,800 MXN.', now - 12 * D + 4 * H),
    evento('aprobada', 'Aprobada por Telecom Centro S.A.', now - 12 * D + 5 * H),
    evento('reparacion', 'Reparacion iniciada.', now - 11 * D),
    evento('prueba_aprobada', 'Prueba final aprobada.', now - 11 * D + 10 * H),
    evento('entregada', 'Bateria entregada. $6,800 MXN cobrados.', now - 11 * D + 12 * H),
  ],
});