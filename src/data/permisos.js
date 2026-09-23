// Bertika - Catalogo unico de permisos. FUENTE UNICA.
//
// Lo usan el frontend (para dibujar la matriz de casillas) y la API (para
// autorizar cada endpoint). Asi lo que se ve en pantalla y lo que el servidor
// permite no pueden divergir.
//
// El modelo es un **mapa plano de booleanos** por usuario:
//   { tablero: true, crear_orden: true, entregar: false, ... }
// Cada clave es una capacidad. NULL en la base = plantilla del rol.
//
// Cada permiso declara:
//   clave    identificador estable (no cambiarlo: la API lo usa)
//   etiqueta texto en criollo para el panel
//   grupo    modulo (agrupa las filas de la tabla)
//   op       columna de la matriz: ver | crear | editar | borrar
//   critica  true = permite borrar, entregar/cobrar o cambiar precios:
//            el panel lo resalta en ambar
//   detalle  ayuda corta

export const COLUMNAS = [
  { op: 'ver', label: 'Ver' },
  { op: 'crear', label: 'Crear' },
  { op: 'editar', label: 'Editar' },
  { op: 'borrar', label: 'Borrar' },
];

export const PERMISOS = [
  // ---------------- Operación ----------------
  { clave: 'tablero', etiqueta: 'Tablero', grupo: 'Operación', op: 'ver', detalle: 'Las órdenes del taller en columnas.' },
  { clave: 'dashboard', etiqueta: 'Dashboard del día', grupo: 'Operación', op: 'ver', detalle: 'Indicadores, cierres e ingresos.' },
  { clave: 'historial', etiqueta: 'Historial por serie', grupo: 'Operación', op: 'ver', detalle: 'Todas las órdenes de una batería.' },
  { clave: 'tareas', etiqueta: 'Tareas', grupo: 'Operación', op: 'ver', detalle: 'Recordatorios con vencimiento.' },
  { clave: 'crear_orden', etiqueta: 'Crear órdenes', grupo: 'Operación', op: 'crear', detalle: 'Dar de alta una batería en el taller.' },
  { clave: 'asignar_tecnico', etiqueta: 'Asignar técnico', grupo: 'Operación', op: 'editar', detalle: 'Derivar una orden a un técnico.' },
  { clave: 'diagnostico', etiqueta: 'Cargar diagnóstico', grupo: 'Operación', op: 'editar', detalle: 'Voltaje, resistencia y prueba de carga.' },
  { clave: 'cotizar', etiqueta: 'Presupuestar', grupo: 'Operación', op: 'editar', detalle: 'Generar y editar la cotización.' },
  { clave: 'cargar_insumos', etiqueta: 'Cargar insumos en la orden', grupo: 'Operación', op: 'editar', detalle: 'Descontar stock de la orden.' },
  { clave: 'prueba_final', etiqueta: 'Aprobar la prueba final', grupo: 'Operación', op: 'editar', detalle: 'Cerrar el trabajo técnico.' },
  { clave: 'entregar', etiqueta: 'Entregar y cobrar', grupo: 'Operación', op: 'editar', critica: true, detalle: 'Registra el monto, el pago y la garantía: cierra la venta.' },
  { clave: 'baja_orden', etiqueta: 'Dar de baja baterías', grupo: 'Operación', op: 'borrar', critica: true, detalle: 'Saca la orden del circuito y la manda a reciclaje.' },
  { clave: 'crear_tareas', etiqueta: 'Crear tareas', grupo: 'Operación', op: 'crear', detalle: 'Agendar un recordatorio.' },
  { clave: 'cerrar_tareas', etiqueta: 'Cerrar tareas', grupo: 'Operación', op: 'editar', detalle: 'Marcar una tarea como hecha.' },
  { clave: 'borrar_tareas', etiqueta: 'Borrar tareas', grupo: 'Operación', op: 'borrar', detalle: 'Eliminar una tarea cargada.' },

  // ---------------- Comercial ----------------
  { clave: 'clientes', etiqueta: 'Clientes', grupo: 'Comercial', op: 'ver', detalle: 'Cartera, KPIs y ficha de cada cliente.' },
  { clave: 'crear_clientes', etiqueta: 'Crear clientes', grupo: 'Comercial', op: 'crear', detalle: 'Alta de fichas nuevas.' },
  { clave: 'editar_clientes', etiqueta: 'Editar clientes', grupo: 'Comercial', op: 'editar', detalle: 'Corregir teléfono, email y datos comerciales.' },
  { clave: 'baja_clientes', etiqueta: 'Dar de baja y restaurar', grupo: 'Comercial', op: 'borrar', critica: true, detalle: 'Manda la ficha a la papelera y la recupera.' },
  { clave: 'whatsapp', etiqueta: 'WhatsApp', grupo: 'Comercial', op: 'ver', detalle: 'Bandeja, embudo y métricas.' },
  { clave: 'responder_whatsapp', etiqueta: 'Responder mensajes', grupo: 'Comercial', op: 'editar', detalle: 'Contestar en la bandeja (ventana de 24 h).' },
  { clave: 'enviar_whatsapp', etiqueta: 'Enviar mensajes sueltos', grupo: 'Comercial', op: 'crear', detalle: 'Pruebas y avisos puntuales: consume mensajes pagos.' },
  { clave: 'crm_whatsapp', etiqueta: 'Trabajar el CRM', grupo: 'Comercial', op: 'editar', detalle: 'Etiquetas, notas, embudo y responsable.' },
  { clave: 'metricas_whatsapp', etiqueta: 'Ver métricas del embudo', grupo: 'Comercial', op: 'ver', detalle: 'Conversión, cierre y motivos de pérdida.' },
  { clave: 'avisos_whatsapp', etiqueta: 'Configurar avisos', grupo: 'Comercial', op: 'editar', detalle: 'Prender y apagar los avisos automáticos al cliente.' },
  { clave: 'cotizador', etiqueta: 'Cotizador de visitas', grupo: 'Comercial', op: 'ver', detalle: 'Tarifas y vista previa.' },
  { clave: 'config_cotizador', etiqueta: 'Editar tarifas', grupo: 'Comercial', op: 'editar', critica: true, detalle: 'Cambia los precios que ve el cliente en el cotizador.' },

  // ---------------- Taller ----------------
  { clave: 'inventario', etiqueta: 'Inventario', grupo: 'Taller', op: 'ver', detalle: 'Insumos, stock y movimientos.' },
  { clave: 'crear_insumos', etiqueta: 'Crear insumos', grupo: 'Taller', op: 'crear', detalle: 'Alta de un insumo nuevo.' },
  { clave: 'editar_insumos', etiqueta: 'Editar insumos', grupo: 'Taller', op: 'editar', detalle: 'Nombre, categoría, precio y stock mínimo.' },
  { clave: 'mover_stock', etiqueta: 'Mover stock', grupo: 'Taller', op: 'editar', detalle: 'Ingresos, ajustes y recuento físico.' },
  { clave: 'tecnicos', etiqueta: 'Técnicos', grupo: 'Taller', op: 'ver', detalle: 'Catálogo y carga de trabajo.' },
  { clave: 'crear_tecnicos', etiqueta: 'Crear técnicos', grupo: 'Taller', op: 'crear', detalle: 'Alta de un técnico.' },
  { clave: 'editar_tecnicos', etiqueta: 'Editar técnicos', grupo: 'Taller', op: 'editar', detalle: 'Especialidad, certificaciones y alta/baja.' },
  { clave: 'flotillas', etiqueta: 'Flotillas', grupo: 'Taller', op: 'ver', detalle: 'Baterías de clientes corporativos.' },
  { clave: 'garantias', etiqueta: 'Garantías', grupo: 'Taller', op: 'ver', detalle: 'Vigentes y por vencer.' },
  { clave: 'baja', etiqueta: 'Baja / reciclaje', grupo: 'Taller', op: 'ver', detalle: 'Baterías dadas de baja.' },

  // ---------------- Sistema ----------------
  { clave: 'reportes', etiqueta: 'Reportes', grupo: 'Sistema', op: 'ver', detalle: 'Indicadores y exportación a CSV.' },
  { clave: 'papelera', etiqueta: 'Papelera', grupo: 'Sistema', op: 'ver', detalle: 'Clientes dados de baja y restaurar.' },
  { clave: 'usuarios', etiqueta: 'Usuarios', grupo: 'Sistema', op: 'ver', detalle: 'Cuentas de acceso y permisos.' },
  { clave: 'crear_usuarios', etiqueta: 'Crear usuarios', grupo: 'Sistema', op: 'crear', critica: true, detalle: 'Da acceso nuevo a la plataforma.' },
  { clave: 'editar_usuarios', etiqueta: 'Editar usuarios y permisos', grupo: 'Sistema', op: 'editar', critica: true, detalle: 'Cambia contraseñas, roles y la matriz de permisos.' },
  { clave: 'borrar_usuarios', etiqueta: 'Dar de baja usuarios', grupo: 'Sistema', op: 'borrar', critica: true, detalle: 'Le saca el acceso a una cuenta.' },
  { clave: 'mi_cuenta', etiqueta: 'Mi cuenta', grupo: 'Sistema', op: 'ver', detalle: 'Datos propios y cambio de contraseña.' },

  // ---------------- Portal del cliente ----------------
  { clave: 'mi_espacio', etiqueta: 'Mis baterías', grupo: 'Portal del cliente', op: 'ver', detalle: 'Rastreo, cotizaciones, historial, flotilla y garantías propias.' },
];

export const CLAVES = PERMISOS.map((p) => p.clave);

// Las secciones son los permisos de tipo "ver" (una por pantalla).
export const SECCIONES = PERMISOS.filter((p) => p.op === 'ver').map((p) => p.clave);

// Filas de la matriz: permisos agrupados por modulo, en el orden del catalogo.
export function agruparPermisos() {
  const grupos = [];
  for (const p of PERMISOS) {
    let g = grupos.find((x) => x.grupo === p.grupo);
    if (!g) { g = { grupo: p.grupo, items: [] }; grupos.push(g); }
    g.items.push(p);
  }
  return grupos;
}

// Que trae cada rol de fabrica. El admin tiene todo; el cliente solo su portal.
const OPERATIVO_TECNICO = [
  'tablero', 'dashboard', 'historial', 'tareas', 'clientes', 'whatsapp', 'inventario', 'tecnicos',
  'flotillas', 'garantias', 'mi_cuenta',
  'asignar_tecnico', 'diagnostico', 'cotizar', 'cargar_insumos', 'prueba_final',
  'responder_whatsapp', 'crm_whatsapp', 'metricas_whatsapp', 'crear_tareas', 'cerrar_tareas',
];

const PLANILLAS = {
  admin: CLAVES,
  tecnico: OPERATIVO_TECNICO,
  cliente: ['mi_espacio', 'mi_cuenta'],
};

// Mapa completo de booleanos para un rol.
export function permisosPorDefecto(rol) {
  const permitidas = PLANILLAS[rol] || PLANILLAS.cliente;
  const mapa = {};
  for (const clave of CLAVES) mapa[clave] = permitidas.includes(clave);
  return mapa;
}

// Normaliza lo que manda el panel o lo que hay guardado en la base.
//   - null, texto roto o cualquier cosa que no sea objeto -> plantilla del rol
//   - claves desconocidas o valores que no son booleanos -> se ignoran
//   - el rol admin siempre queda con todo (no se puede auto-bloquear)
//   - el rol cliente nunca se eleva: ve solo su portal
export function normalizarPermisos(valor, rol = 'cliente') {
  if (rol === 'admin') return permisosPorDefecto('admin');
  if (rol === 'cliente') return permisosPorDefecto('cliente');
  let obj = valor;
  if (typeof valor === 'string') {
    try { obj = JSON.parse(valor); } catch { obj = null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return permisosPorDefecto(rol);
  const salida = { ...permisosPorDefecto(rol) };
  for (const clave of CLAVES) {
    if (typeof obj[clave] === 'boolean') salida[clave] = obj[clave];
  }
  return salida;
}

// Permisos que rigen para un usuario: su mapa si lo tiene, si no el del rol.
export function permisosEfectivos(usuario) {
  const rol = usuario?.rol || 'cliente';
  const guardados = usuario?.permisos;
  if (!guardados) return permisosPorDefecto(rol);
  return normalizarPermisos(guardados, rol);
}

// Consulta directa sobre un mapa de permisos (lo que usa la API).
export function tienePermiso(permisos, clave) {
  if (!clave) return true;
  if (!permisos || typeof permisos !== 'object') return false;
  return permisos[clave] === true;
}

export function puedeVer(usuario, seccion) {
  return tienePermiso(permisosEfectivos(usuario), seccion);
}

export function puedeHacer(usuario, clave) {
  return tienePermiso(permisosEfectivos(usuario), clave);
}

// Resumen corto para la lista de usuarios.
export function resumenPermisos(usuario) {
  const rol = usuario?.rol || 'cliente';
  if (rol === 'admin') return 'Administrador (todo)';
  const propios = permisosEfectivos(usuario);
  const cuantos = CLAVES.filter((k) => propios[k]).length;
  const base = permisosPorDefecto(rol);
  const igual = CLAVES.every((k) => propios[k] === base[k]);
  return igual ? `${rol === 'tecnico' ? 'Técnico' : 'Cliente'} (plantilla)` : `${cuantos} permisos`;
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
