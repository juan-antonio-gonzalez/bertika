// Bertika - Areas y listas dinamicas.
//
// Fuente unica para el frontend y la API: tipos de campo, capacidades por
// area, normalizacion de permisos y validacion de registros. Las listas no
// crean tablas SQL nuevas: guardan su definicion en `lista_campos` y sus filas
// en `lista_registros.datos` (JSONB). Asi el equipo crea una lista sin deploy.

export const AREAS_SEMILLA = [
  {
    id: 'area_taller',
    slug: 'taller',
    nombre: 'Taller',
    descripcion: 'Operación, inventario, materiales y herramientas del taller.',
    icono: 'tools',
    orden: 10,
  },
  {
    id: 'area_ventas',
    slug: 'ventas',
    nombre: 'Ventas',
    descripcion: 'Prospectos, oportunidades y actividades comerciales.',
    icono: 'dollar',
    orden: 20,
  },
  {
    id: 'area_admin',
    slug: 'administracion',
    nombre: 'Administración',
    descripcion: 'Listas de gestión interna y administración.',
    icono: 'gear',
    orden: 30,
  },
];

export const CAPACIDADES_AREA = [
  { clave: 'ver', etiqueta: 'Ver el área', detalle: 'La persona ve el área y sus listas en el menú.' },
  { clave: 'crear_listas', etiqueta: 'Crear listas', detalle: 'Puede crear listas nuevas dentro del área.' },
  { clave: 'editar_listas', etiqueta: 'Editar listas y campos', detalle: 'Puede cambiar el nombre, los campos y la configuración de las listas.' },
  { clave: 'borrar_listas', etiqueta: 'Archivar listas', detalle: 'Puede mandar una lista a la papelera lógica.' },
  { clave: 'ver_registros', etiqueta: 'Ver registros', detalle: 'Puede abrir las filas y sus datos.' },
  { clave: 'crear_registros', etiqueta: 'Crear registros', detalle: 'Puede cargar filas nuevas.' },
  { clave: 'editar_registros', etiqueta: 'Editar registros', detalle: 'Puede modificar filas existentes.' },
  { clave: 'borrar_registros', etiqueta: 'Borrar registros', detalle: 'Puede archivar filas (no se borran físicamente).' },
  { clave: 'administrar_vistas', etiqueta: 'Administrar vistas', detalle: 'Puede crear y guardar vistas compartidas.' },
  { clave: 'convertir_prospecto', etiqueta: 'Convertir prospecto', detalle: 'Puede crear el cliente de taller desde una oportunidad.' },
];

export const CLAVES_AREA = CAPACIDADES_AREA.map((c) => c.clave);

export const TIPOS_CAMPO = [
  { tipo: 'texto', etiqueta: 'Texto corto' },
  { tipo: 'texto_largo', etiqueta: 'Texto largo' },
  { tipo: 'numero', etiqueta: 'Número' },
  { tipo: 'moneda', etiqueta: 'Moneda' },
  { tipo: 'fecha', etiqueta: 'Fecha' },
  { tipo: 'seleccion', etiqueta: 'Selección única' },
  { tipo: 'multiseleccion', etiqueta: 'Selección múltiple' },
  { tipo: 'checkbox', etiqueta: 'Sí / No' },
  { tipo: 'email', etiqueta: 'Email' },
  { tipo: 'telefono', etiqueta: 'Teléfono' },
  { tipo: 'url', etiqueta: 'Enlace' },
  { tipo: 'persona', etiqueta: 'Persona' },
  { tipo: 'cliente', etiqueta: 'Cliente' },
  { tipo: 'adjunto', etiqueta: 'Adjunto' },
  { tipo: 'imagen', etiqueta: 'Imagen' },
  { tipo: 'relacion', etiqueta: 'Relación con otra lista' },
  { tipo: 'lookup', etiqueta: 'Lookup (desde otra lista)' },
  { tipo: 'calculado', etiqueta: 'Campo calculado' },
];

export const TIPOS = TIPOS_CAMPO.map((t) => t.tipo);

const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function capacidadesVacias() {
  return Object.fromEntries(CLAVES_AREA.map((k) => [k, false]));
}

// Normaliza el mapa de areas de una categoria. Ignora claves desconocidas y
// valores que no sean booleanos; si no puede ver el area, el resto queda apagado.
export function normalizarAreas(valor) {
  let obj = valor;
  if (typeof valor === 'string') {
    try { obj = JSON.parse(valor); } catch { obj = null; }
  }
  if (!esObjeto(obj)) return {};
  const salida = {};
  for (const [areaId, caps] of Object.entries(obj)) {
    if (!/^area_[a-z0-9_]{1,40}$/.test(areaId) || !esObjeto(caps)) continue;
    const limpio = capacidadesVacias();
    for (const clave of CLAVES_AREA) {
      if (typeof caps[clave] === 'boolean') limpio[clave] = caps[clave];
    }
    if (!limpio.ver) {
      for (const clave of CLAVES_AREA) limpio[clave] = false;
    }
    salida[areaId] = limpio;
  }
  return salida;
}

export function permisosArea(areas, areaId) {
  const caps = esObjeto(areas) ? areas[areaId] : null;
  const salida = capacidadesVacias();
  if (esObjeto(caps)) {
    for (const clave of CLAVES_AREA) salida[clave] = caps[clave] === true;
  }
  if (!salida.ver) {
    for (const clave of CLAVES_AREA) salida[clave] = false;
  }
  return salida;
}

export function puedeArea(areas, areaId, clave) {
  return permisosArea(areas, areaId)[clave] === true;
}

export function normalizarOpciones(valor) {
  const lista = Array.isArray(valor)
    ? valor
    : (typeof valor === 'string' ? valor.split(/[\n,]/) : []);
  const vistas = new Set();
  const salida = [];
  for (const item of lista) {
    const texto = String(item ?? '').trim().slice(0, 80);
    if (!texto) continue;
    const clave = texto.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(texto);
    if (salida.length >= 100) break;
  }
  return salida;
}

export function etiquetaTipo(tipo) {
  return TIPOS_CAMPO.find((t) => t.tipo === tipo)?.etiqueta || tipo;
}

const esVacio = (v) => v === null || v === undefined
  || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0);
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
const urlValida = (v) => {
  try { const u = new URL(String(v)); return ['http:', 'https:'].includes(u.protocol); } catch { return false; }
};

// Valida y normaliza los datos de un registro contra la definicion de campos.
// Devuelve solo las claves de campos activos: lo que no esta definido no entra.
export function validarRegistro(campos, datos, { parcial = false } = {}) {
  const entrada = esObjeto(datos) ? datos : {};
  const salida = {};
  for (const campo of campos || []) {
    if (!campo || campo.activo === false) continue;
    const id = String(campo.id || '');
    if (!id) continue;
    const tiene = Object.prototype.hasOwnProperty.call(entrada, id);
    if (!tiene && parcial) continue;
    let valor = tiene ? entrada[id] : (campo.config?.defecto ?? null);
    const requerido = campo.requerido === true;
    if (esVacio(valor)) {
      if (requerido) return { ok: false, error: `“${campo.nombre}” es obligatorio.` };
      salida[id] = null;
      continue;
    }
    const tipo = campo.tipo;
    if (tipo === 'calculado') { salida[id] = null; continue; }
    if (tipo === 'texto' || tipo === 'texto_largo' || tipo === 'persona') {
      const texto = String(valor).trim();
      const max = tipo === 'texto_largo' ? 5000 : 500;
      if (texto.length > max) return { ok: false, error: `“${campo.nombre}” no puede superar ${max} caracteres.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'cliente') {
      const cliente = esObjeto(valor) ? valor : { id: valor };
      const idCliente = String(cliente.id || '').trim().slice(0, 80);
      if (!idCliente.startsWith('cli_')) return { ok: false, error: `“${campo.nombre}”: elegí un cliente válido.` };
      salida[id] = { id: idCliente, nombre: String(cliente.nombre || cliente.etiqueta || '').slice(0, 160) };
      continue;
    }
    if (tipo === 'numero' || tipo === 'moneda') {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) return { ok: false, error: `“${campo.nombre}” debe ser un número.` };
      const min = campo.config?.min;
      const max = campo.config?.max;
      if (min !== undefined && min !== null && min !== '' && numero < Number(min)) {
        return { ok: false, error: `“${campo.nombre}” no puede ser menor que ${min}.` };
      }
      if (max !== undefined && max !== null && max !== '' && numero > Number(max)) {
        return { ok: false, error: `“${campo.nombre}” no puede ser mayor que ${max}.` };
      }
      salida[id] = tipo === 'moneda' ? Math.round(numero * 100) / 100 : numero;
      continue;
    }
    if (tipo === 'fecha') {
      const texto = String(valor).slice(0, 10);
      const fecha = new Date(`${texto}T00:00:00`);
      if (Number.isNaN(fecha.getTime())) return { ok: false, error: `“${campo.nombre}” no es una fecha válida.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'seleccion') {
      const opciones = normalizarOpciones(campo.config?.opciones);
      const texto = String(valor).trim();
      if (!opciones.includes(texto)) return { ok: false, error: `“${campo.nombre}”: elegí una opción válida.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'multiseleccion') {
      const opciones = normalizarOpciones(campo.config?.opciones);
      const valores = Array.isArray(valor) ? valor : [valor];
      const limpios = [...new Set(valores.map((v) => String(v).trim()).filter((v) => opciones.includes(v)))];
      if (limpios.length !== valores.length) return { ok: false, error: `“${campo.nombre}”: hay opciones que no existen.` };
      if (requerido && limpios.length === 0) return { ok: false, error: `“${campo.nombre}” es obligatorio.` };
      salida[id] = limpios;
      continue;
    }
    if (tipo === 'checkbox') {
      salida[id] = valor === true || valor === 'true' || valor === 1 || valor === '1';
      continue;
    }
    if (tipo === 'email') {
      const texto = String(valor).trim().slice(0, 200);
      if (!emailValido(texto)) return { ok: false, error: `“${campo.nombre}” no es un email válido.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'url') {
      const texto = String(valor).trim().slice(0, 1000);
      if (!urlValida(texto)) return { ok: false, error: `“${campo.nombre}” no es un enlace válido.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'telefono') {
      const texto = String(valor).trim().slice(0, 40);
      if (!/^[+()\d\s.-]{6,40}$/.test(texto)) return { ok: false, error: `“${campo.nombre}” no es un teléfono válido.` };
      salida[id] = texto;
      continue;
    }
    if (tipo === 'adjunto' || tipo === 'imagen') {
      if (!esObjeto(valor) || !valor.url) return { ok: false, error: `“${campo.nombre}”: subí un archivo válido.` };
      const url = String(valor.url).slice(0, 1000);
      if (!/^(https?:\/\/|\/uploads\/|\/api\/lista-adjuntos\/)/.test(url)) return { ok: false, error: `“${campo.nombre}”: el archivo no es válido.` };
      if (tipo === 'imagen' && !String(valor.mime || '').startsWith('image/')) {
        return { ok: false, error: `“${campo.nombre}”: subí una imagen válida.` };
      }
      salida[id] = {
        url,
        nombre: String(valor.nombre || (tipo === 'imagen' ? 'Imagen' : 'Adjunto')).slice(0, 160),
        mime: String(valor.mime || '').slice(0, 100),
        size: Number(valor.size) || 0,
      };
      continue;
    }
    if (tipo === 'lookup') {
      salida[id] = null;
      continue;
    }
    if (tipo === 'relacion') {
      if (!esObjeto(valor) || !valor.id) return { ok: false, error: `“${campo.nombre}”: elegí un registro válido.` };
      salida[id] = {
        id: String(valor.id).slice(0, 80),
        etiqueta: String(valor.etiqueta || valor.id).slice(0, 200),
      };
      continue;
    }
    salida[id] = null;
  }
  return { ok: true, datos: salida };
}

// Texto visible de un valor para la grilla/CSV.
export function valorVisible(campo, valor) {
  if (esVacio(valor)) return '';
  if (campo?.tipo === 'checkbox') return valor ? 'Sí' : 'No';
  if (campo?.tipo === 'multiseleccion') return Array.isArray(valor) ? valor.join(', ') : String(valor);
  if (campo?.tipo === 'cliente' && esObjeto(valor)) return valor.nombre || valor.id || '';
  if (campo?.tipo === 'moneda') {
    const n = Number(valor);
    return Number.isFinite(n)
      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
      : String(valor);
  }
  if (campo?.tipo === 'fecha') {
    const d = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString('es-AR');
  }
  if (campo?.tipo === 'adjunto') return String(valor?.nombre || 'Adjunto');
  if (campo?.tipo === 'imagen') return String(valor?.nombre || 'Imagen');
  if (campo?.tipo === 'relacion') return String(valor?.etiqueta || valor?.id || '');
  if (campo?.tipo === 'lookup' && esObjeto(valor)) return String(valor.etiqueta || valor.nombre || valor.id || '');
  if (campo?.tipo === 'calculado') {
    const n = Number(valor);
    return Number.isFinite(n) ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n) : '';
  }
  return String(valor);
}

// Evaluador seguro de fórmulas para campos calculados. Solo permite números,
// referencias {campoId}, + - * / y paréntesis; nunca usa eval ni Function.
export function evaluarFormula(formula, datos = {}) {
  const expr = String(formula ?? '').replace(/\{([^}]+)\}/g, (_, id) => {
    const n = Number(datos?.[id]);
    return Number.isFinite(n) ? String(n) : '0';
  });
  if (!expr.trim()) return 0;
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    throw new Error('La fórmula solo puede usar campos numéricos, números, + - * / y paréntesis.');
  }
  let i = 0;
  const salta = () => { while (i < expr.length && /\s/.test(expr[i])) i += 1; };
  const factor = () => {
    salta();
    if (expr[i] === '+') { i += 1; return factor(); }
    if (expr[i] === '-') { i += 1; return -factor(); }
    if (expr[i] === '(') {
      i += 1;
      const v = expresion();
      salta();
      if (expr[i] !== ')') throw new Error('Faltan paréntesis en la fórmula.');
      i += 1;
      return v;
    }
    const inicio = i;
    while (i < expr.length && /[0-9.]/.test(expr[i])) i += 1;
    if (inicio === i) throw new Error('La fórmula tiene un valor inválido.');
    return Number(expr.slice(inicio, i));
  };
  const termino = () => {
    let v = factor();
    salta();
    while (expr[i] === '*' || expr[i] === '/') {
      const op = expr[i]; i += 1;
      const r = factor();
      v = op === '*' ? v * r : (r === 0 ? 0 : v / r);
      salta();
    }
    return v;
  };
  const expresion = () => {
    let v = termino();
    salta();
    while (expr[i] === '+' || expr[i] === '-') {
      const op = expr[i]; i += 1;
      const r = termino();
      v = op === '+' ? v + r : v - r;
      salta();
    }
    return v;
  };
  const total = expresion();
  salta();
  if (i !== expr.length) throw new Error('La fórmula tiene un valor inválido.');
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : 0;
}

export function validarFormula(formula) {
  try {
    evaluarFormula(formula, {});
    if (!String(formula || '').trim()) return 'Escribí una fórmula.';
    return null;
  } catch (e) {
    return e.message;
  }
}
