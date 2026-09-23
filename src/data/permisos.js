// Bertika - Catalogo de permisos. FUENTE UNICA.
//
// Lo usan la API (para autorizar cada endpoint) y el panel (para dibujar la
// tabla de casillas al crear o editar un usuario). Asi lo que se ve en pantalla
// y lo que el servidor permite no pueden divergir.
//
// Hay dos familias:
//   - SECCIONES: que partes de la plataforma puede VER el usuario.
//   - ACCIONES:  que cosas puede HACER (crear, editar, entregar, borrar...).
//
// El rol sigue existiendo (admin / tecnico / cliente) y define los permisos de
// fabrica; las casillas permiten ajustarlos por usuario. El rol admin siempre
// tiene todo (para que nadie se quede sin acceso a la administracion).

export const SECCIONES = [
  {
    grupo: 'Operación',
    items: [
      { key: 'tablero', label: 'Tablero', detalle: 'Las órdenes del taller en columnas.' },
      { key: 'dashboard', label: 'Dashboard del día', detalle: 'Indicadores, cierres e ingresos.' },
      { key: 'historial', label: 'Historial por serie', detalle: 'Buscar todas las órdenes de una batería.' },
      { key: 'tareas', label: 'Tareas', detalle: 'Recordatorios con vencimiento.' },
    ],
  },
  {
    grupo: 'Comercial',
    items: [
      { key: 'clientes', label: 'Clientes', detalle: 'Cartera, KPIs y ficha de cada cliente.' },
      { key: 'whatsapp', label: 'WhatsApp', detalle: 'Bandeja, embudo y métricas.' },
      { key: 'cotizador', label: 'Cotizador de visitas', detalle: 'Tarifas y vista previa.' },
    ],
  },
  {
    grupo: 'Taller',
    items: [
      { key: 'inventario', label: 'Inventario', detalle: 'Insumos, stock y movimientos.' },
      { key: 'tecnicos', label: 'Técnicos', detalle: 'Catálogo y carga de trabajo.' },
      { key: 'flotillas', label: 'Flotillas', detalle: 'Baterías de clientes corporativos.' },
      { key: 'garantias', label: 'Garantías', detalle: 'Vigentes y por vencer.' },
      { key: 'baja', label: 'Baja / reciclaje', detalle: 'Baterías dadas de baja.' },
    ],
  },
  {
    grupo: 'Sistema',
    items: [
      { key: 'reportes', label: 'Reportes', detalle: 'Exportar a CSV.' },
      { key: 'papelera', label: 'Papelera', detalle: 'Clientes dados de baja y restaurar.' },
      { key: 'usuarios', label: 'Usuarios', detalle: 'Cuentas de acceso y permisos.' },
      { key: 'mi_cuenta', label: 'Mi cuenta', detalle: 'Datos propios y contraseña.' },
    ],
  },
];

export const SECCIONES_CLIENTE = [
  {
    grupo: 'Mi espacio (cliente)',
    items: [
      { key: 'mi_espacio', label: 'Mis baterías', detalle: 'Rastreo, cotizaciones, historial, flotilla y garantías propias.' },
    ],
  },
];

export const ACCIONES = [
  {
    grupo: 'Órdenes',
    items: [
      { key: 'crear_orden', label: 'Crear órdenes', detalle: 'Dar de alta una batería en el taller.' },
      { key: 'asignar_tecnico', label: 'Asignar técnico', detalle: 'Derivar una orden a un técnico.' },
      { key: 'diagnostico', label: 'Cargar diagnóstico', detalle: 'Voltaje, resistencia y prueba de carga.' },
      { key: 'cotizar', label: 'Presupuestar', detalle: 'Generar y editar la cotización.' },
      { key: 'cargar_insumos', label: 'Cargar insumos', detalle: 'Descontar stock en una orden.' },
      { key: 'prueba_final', label: 'Aprobar la prueba final', detalle: 'Cerrar el trabajo técnico.' },
      { key: 'entregar', label: 'Entregar y cobrar', detalle: 'Registrar monto, pago y garantía.' },
      { key: 'baja_orden', label: 'Dar de baja baterías', detalle: 'Enviar a reciclaje.' },
    ],
  },
  {
    grupo: 'Clientes e inventario',
    items: [
      { key: 'editar_clientes', label: 'Crear y editar clientes', detalle: 'Alta y corrección de fichas.' },
      { key: 'baja_clientes', label: 'Dar de baja clientes', detalle: 'Mandar a la papelera y restaurar.' },
      { key: 'editar_insumos', label: 'Crear y editar insumos', detalle: 'Datos, precio y stock mínimo.' },
      { key: 'mover_stock', label: 'Mover stock', detalle: 'Ingresos, ajustes y recuento.' },
      { key: 'editar_tecnicos', label: 'Editar técnicos', detalle: 'Especialidad, certificaciones y alta/baja.' },
    ],
  },
  {
    grupo: 'WhatsApp',
    items: [
      { key: 'responder_whatsapp', label: 'Responder mensajes', detalle: 'Contestar en la bandeja.' },
      { key: 'enviar_whatsapp', label: 'Enviar mensajes sueltos', detalle: 'Pruebas y avisos puntuales.' },
      { key: 'crm_whatsapp', label: 'Trabajar el CRM', detalle: 'Etiquetas, notas, embudo y tareas.' },
      { key: 'avisos_whatsapp', label: 'Configurar avisos', detalle: 'Prender y apagar los avisos automáticos.' },
      { key: 'metricas_whatsapp', label: 'Ver métricas del embudo', detalle: 'Conversión y motivos de pérdida.' },
    ],
  },
  {
    grupo: 'Sistema',
    items: [
      { key: 'config_cotizador', label: 'Editar tarifas', detalle: 'Cambiar precios del cotizador.' },
      { key: 'ver_reportes', label: 'Exportar reportes', detalle: 'Descargar los CSV.' },
      { key: 'gestionar_usuarios', label: 'Gestionar usuarios', detalle: 'Crear cuentas y dar permisos.' },
      { key: 'papelera', label: 'Usar la papelera', detalle: 'Ver y restaurar lo dado de baja.' },
    ],
  },
];

export const TODAS_SECCIONES = [...SECCIONES, ...SECCIONES_CLIENTE].flatMap((g) => g.items.map((i) => i.key));
export const TODAS_ACCIONES = ACCIONES.flatMap((g) => g.items.map((i) => i.key));

// Permisos que trae cada rol de fabrica.
export const PERMISOS_POR_ROL = {
  admin: { ver: [...TODAS_SECCIONES], hacer: [...TODAS_ACCIONES] },
  tecnico: {
    ver: ['tablero', 'dashboard', 'historial', 'tareas', 'clientes', 'whatsapp', 'inventario', 'tecnicos', 'flotillas', 'garantias', 'mi_cuenta'],
    hacer: ['diagnostico', 'cotizar', 'cargar_insumos', 'prueba_final', 'responder_whatsapp', 'crm_whatsapp'],
  },
  cliente: { ver: ['mi_espacio', 'mi_cuenta'], hacer: [] },
};

export const ROL_LABEL_PERMISOS = { admin: 'Administrador', tecnico: 'Técnico', cliente: 'Cliente' };

export function permisosDeRol(rol) {
  const base = PERMISOS_POR_ROL[rol] || PERMISOS_POR_ROL.cliente;
  return { ver: [...base.ver], hacer: [...base.hacer] };
}

// Normaliza lo que llega (objeto, JSON o texto) y descarta claves desconocidas
// o repetidas. Un rol admin siempre queda con todo.
export function normalizarPermisos(valor, rol = null) {
  if (rol === 'admin') return permisosDeRol('admin');
  let obj = valor;
  if (typeof valor === 'string') {
    try { obj = JSON.parse(valor); } catch { obj = null; }
  }
  if (!obj || typeof obj !== 'object') return rol ? permisosDeRol(rol) : { ver: [], hacer: [] };
  const limpiar = (lista, validas) => {
    const vistas = new Set();
    const salida = [];
    for (const k of Array.isArray(lista) ? lista : []) {
      const clave = String(k || '').trim();
      if (!validas.includes(clave) || vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push(clave);
    }
    return salida;
  };
  return { ver: limpiar(obj.ver, TODAS_SECCIONES), hacer: limpiar(obj.hacer, TODAS_ACCIONES) };
}

// Permisos que rigen para un usuario: los suyos si los tiene, si no los del rol.
export function permisosEfectivos(usuario) {
  const rol = usuario?.rol || 'cliente';
  if (rol === 'admin') return permisosDeRol('admin');
  const propios = usuario?.permisos;
  if (!propios) return permisosDeRol(rol);
  const norm = typeof propios === 'string' ? normalizarPermisos(propios, rol) : normalizarPermisos(propios, rol);
  return norm;
}

export function puedeVer(usuario, seccion) {
  if (!seccion) return true;
  if (usuario?.rol === 'admin') return true;
  return permisosEfectivos(usuario).ver.includes(seccion);
}

export function puedeHacer(usuario, accion) {
  if (!accion) return true;
  if (usuario?.rol === 'admin') return true;
  return permisosEfectivos(usuario).hacer.includes(accion);
}

// Resumen corto para la tabla de usuarios ("Todo por rol", "Personalizado"...).
export function resumenPermisos(usuario) {
  const rol = usuario?.rol || 'cliente';
  if (rol === 'admin') return 'Acceso total';
  const propios = permisosEfectivos(usuario);
  const base = permisosDeRol(rol);
  const igual = propios.ver.length === base.ver.length && propios.hacer.length === base.hacer.length
    && propios.ver.every((k) => base.ver.includes(k))
    && propios.hacer.every((k) => base.hacer.includes(k));
  if (igual) return `Como ${ROL_LABEL_PERMISOS[rol] || rol}`;
  return `${propios.ver.length} secciones · ${propios.hacer.length} acciones`;
}

// Que seccion corresponde a cada ruta del panel (lo usa el guard de rutas).
export const SECCION_POR_RUTA = {
  '/hub': 'tablero',
  '/hub/dashboard': 'dashboard',
  '/hub/historial': 'historial',
  '/hub/tareas': 'tareas',
  '/hub/clientes': 'clientes',
  '/hub/whatsapp': 'whatsapp',
  '/hub/cotizador': 'cotizador',
  '/hub/inventario': 'inventario',
  '/hub/tecnicos': 'tecnicos',
  '/hub/flotillas': 'flotillas',
  '/hub/garantias': 'garantias',
  '/hub/baja': 'baja',
  '/hub/papelera': 'papelera',
  '/reportes': 'reportes',
  '/usuarios': 'usuarios',
  '/settings': 'mi_cuenta',
};

export function seccionDeRuta(ruta) {
  if (!ruta) return null;
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
  if (SECCION_POR_RUTA[limpia]) return SECCION_POR_RUTA[limpia];
  const claves = Object.keys(SECCION_POR_RUTA).sort((a, b) => b.length - a.length);
  const match = claves.find((k) => k !== '/hub' && limpia.startsWith(`${k}/`));
  return match ? SECCION_POR_RUTA[match] : (limpia.startsWith('/hub/') ? 'tablero' : null);
}

// Primera pantalla a la que puede entrar el usuario (para redirigir cuando no
// tiene permiso sobre la que pidio). /home siempre esta disponible.
export function inicioDe(usuario) {
  const orden = [
    ['/hub', 'tablero'], ['/hub/dashboard', 'dashboard'], ['/hub/clientes', 'clientes'], ['/hub/tareas', 'tareas'],
    ['/hub/whatsapp', 'whatsapp'], ['/hub/inventario', 'inventario'], ['/hub/garantias', 'garantias'],
    ['/hub/tecnicos', 'tecnicos'], ['/hub/flotillas', 'flotillas'], ['/hub/baja', 'baja'],
    ['/hub/cotizador', 'cotizador'], ['/hub/historial', 'historial'], ['/reportes', 'reportes'],
    ['/hub/papelera', 'papelera'], ['/usuarios', 'usuarios'],
  ];
  for (const [ruta, seccion] of orden) {
    if (puedeVer(usuario, seccion)) return ruta;
  }
  if (usuario?.rol === 'tecnico') return '/tecnico/mis-ordenes';
  if (usuario?.rol === 'cliente') return '/cliente/rastreo';
  return '/home';
}
