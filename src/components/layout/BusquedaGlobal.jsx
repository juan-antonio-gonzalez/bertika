import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/store';
import { Icon, appIconName } from '../ui';
import { ESTADO_LABEL } from '../../data/reglas';

// Busqueda global (Ctrl+K / Cmd+K): busca EN MEMORIA sobre los datos que ya
// tiene el store (ordenes, clientes, baterias e insumos) y navega al destino
// de cada resultado. No pide nada a la API: el /estado ya viene filtrado por
// rol, asi que nadie ve lo que no le corresponde.

const MAX_POR_TIPO = 5;

const norm = (v) => String(v ?? '').toLowerCase();
const pega = (campos, q) => campos.some((c) => norm(c).includes(q));

// Destino cuando el resultado no tiene una orden que se pueda abrir.
function rutasDe(rol) {
  if (rol === 'tecnico') {
    return { ordenes: '/tecnico/mis-ordenes', clientes: '/tecnico/mis-ordenes', baterias: '/tecnico/mis-ordenes', insumos: '/tecnico/mis-ordenes' };
  }
  if (rol === 'cliente') {
    return { ordenes: '/cliente/historial', clientes: '/cliente/rastreo', baterias: '/cliente/rastreo', insumos: '/cliente/historial' };
  }
  return { ordenes: '/hub/historial', clientes: '/hub/clientes', baterias: '/hub/historial', insumos: '/hub/inventario' };
}

// Orden de una serie: la activa si existe, si no la mas reciente.
function ordenDeSerie(ordenes, serie) {
  const deLaSerie = ordenes.filter((o) => o.bateria_serie === serie);
  if (!deLaSerie.length) return null;
  const activa = deLaSerie.find((o) => !['delivered', 'cancelled'].includes(o.estado));
  if (activa) return activa;
  return [...deLaSerie].sort((a, b) => new Date(b?.fecha_ingreso || 0) - new Date(a?.fecha_ingreso || 0))[0];
}

// Devuelve las filas ya aplanadas (el orden del array es el orden en pantalla).
export function buscarEn(data, consulta, rol = 'admin') {
  const q = norm(consulta).trim();
  if (!q) return [];
  const d = data || {};
  const rutas = rutasDe(rol);
  const ordenes = Array.isArray(d.ordenes) ? d.ordenes : [];
  const filas = [];

  for (const o of ordenes.filter((x) => pega([x?.bateria_serie, x?.id, x?.codigo_seguimiento], q)).slice(0, MAX_POR_TIPO)) {
    filas.push({
      key: `ord-${o.id}`,
      grupo: 'Órdenes',
      icono: 'battery',
      titulo: o.bateria_serie || o.id,
      sub: [o.id, o.codigo_seguimiento, ESTADO_LABEL[o.estado] || o.estado].filter(Boolean).join(' · '),
      orden: o,
      ruta: rutas.ordenes,
    });
  }

  const clientes = (Array.isArray(d.clientes) ? d.clientes : [])
    .filter((c) => pega([c?.nombre, c?.empresa, c?.email, c?.telefono], q)).slice(0, MAX_POR_TIPO);
  for (const c of clientes) {
    filas.push({
      key: `cli-${c.id}`,
      grupo: 'Clientes',
      icono: 'users',
      titulo: c.nombre || c.id,
      sub: [c.empresa, c.telefono, c.email].filter(Boolean).join(' · '),
      ruta: rutas.clientes,
    });
  }

  const baterias = (Array.isArray(d.baterias) ? d.baterias : [])
    .filter((b) => pega([b?.numero_serie, b?.marca, b?.modelo], q)).slice(0, MAX_POR_TIPO);
  for (const b of baterias) {
    filas.push({
      key: `bat-${b.numero_serie}`,
      grupo: 'Baterías',
      icono: appIconName(b.aplicacion),
      titulo: b.numero_serie,
      sub: [b.marca, b.modelo, b.aplicacion].filter(Boolean).join(' · '),
      orden: ordenDeSerie(ordenes, b.numero_serie),
      ruta: rutas.baterias,
    });
  }

  const insumos = (Array.isArray(d.insumos) ? d.insumos : [])
    .filter((i) => pega([i?.nombre, i?.categoria], q)).slice(0, MAX_POR_TIPO);
  for (const i of insumos) {
    filas.push({
      key: `ins-${i.id}`,
      grupo: 'Insumos',
      icono: 'box',
      titulo: i.nombre,
      sub: [i.categoria, `stock ${i.stock ?? 0}`].filter(Boolean).join(' · '),
      ruta: rutas.insumos,
    });
  }

  return filas;
}

export default function BusquedaGlobal({ abierto, onClose, onAbrirOrden }) {
  const data = useStore((s) => s.data);
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const entrada = useRef(null);

  const filas = useMemo(() => buscarEn(data, q, user?.rol), [data, q, user]);

  // Al abrir: arranca limpio y con el cursor en el buscador.
  useEffect(() => {
    if (!abierto) return undefined;
    setQ('');
    setIdx(0);
    const t = setTimeout(() => entrada.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [abierto]);

  useEffect(() => { setIdx(0); }, [q]);

  if (!abierto) return null;

  const elegir = (fila) => {
    if (!fila) return;
    onClose?.();
    if (fila.orden && onAbrirOrden) { onAbrirOrden(fila.orden.id); return; }
    if (fila.ruta) navigate(fila.ruta);
  };

  const alTeclear = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => (filas.length ? (i + 1) % filas.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (filas.length ? (i - 1 + filas.length) % filas.length : 0));
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); elegir(filas[idx]); }
  };

  return (
    <div className="buscar-back" onClick={onClose}>
      <div className="buscar-caja" role="dialog" aria-modal="true" aria-label="Buscar en Bertika" onClick={(e) => e.stopPropagation()}>
        <div className="buscar-top">
          <Icon name="search" size={16} />
          <input
            ref={entrada}
            className="buscar-input"
            placeholder="Buscar orden, cliente, batería o insumo…"
            aria-label="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={alTeclear}
          />
          <button className="btn icon sm" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="buscar-res">
          {filas.length === 0 ? (
            <div className="buscar-vacio">
              <Icon name="search" size={20} />
              <div>{q.trim() ? `Sin resultados para «${q.trim()}»` : 'Escribí para buscar en toda la plataforma'}</div>
              <span className="muted" style={{ fontSize: 12 }}>
                {q.trim()
                  ? 'Probá con el número de serie, el nombre del cliente o el código de seguimiento.'
                  : 'Órdenes, clientes, baterías e insumos.'}
              </span>
            </div>
          ) : (
            filas.map((f, i) => (
              <div key={f.key}>
                {(i === 0 || filas[i - 1].grupo !== f.grupo) && <div className="buscar-grupo">{f.grupo}</div>}
                <button
                  className={`buscar-item${i === idx ? ' on' : ''}`}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => elegir(f)}
                >
                  <span className="buscar-ic"><Icon name={f.icono} size={15} /></span>
                  <span className="buscar-txt">
                    <span className="buscar-tit">{f.titulo}</span>
                    {f.sub && <span className="buscar-sub">{f.sub}</span>}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="buscar-pie">
          <span><b>↑</b> <b>↓</b> moverse</span>
          <span><b>Enter</b> abrir</span>
          <span><b>Esc</b> cerrar</span>
        </div>
      </div>
    </div>
  );
}
