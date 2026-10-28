import { Fragment, useEffect, useRef } from 'react';
import {
  COLUMNAS, PERMISOS, CLAVES, agruparPermisos, permisosPorDefecto,
} from '../data/permisos';

const GRUPOS = agruparPermisos();
const MAPA_VACIO = Object.fromEntries(CLAVES.map((k) => [k, false]));

function CheckTri({ checked, indeterminate, onChange, children, disabled = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className={`permisos-check${disabled ? ' is-disabled' : ''}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={onChange}
        disabled={disabled}
      />
      <span>{children}</span>
    </label>
  );
}

// Editor de permisos reutilizable: acceso rápido por área (Ver / Usar / Quitar)
// + la matriz fina por capacidad. Lo usan usuarios y categorías.
export default function MatrizPermisos({
  permisos, setPermisos, disabled = false, showTemplates = true,
}) {
  const marcarGrupo = (items, valor) => {
    setPermisos((p) => {
      const nuevo = { ...p };
      for (const it of items) nuevo[it.clave] = valor;
      return nuevo;
    });
  };

  const alternar = (clave) => {
    setPermisos((p) => ({ ...p, [clave]: !p[clave] }));
  };

  const marcarColumna = (op) => {
    setPermisos((p) => {
      const items = PERMISOS.filter((x) => x.op === op);
      const todos = items.every((x) => p[x.clave]);
      const nuevo = { ...p };
      for (const it of items) nuevo[it.clave] = !todos;
      return nuevo;
    });
  };

  const criticos = PERMISOS.filter((x) => x.critica && permisos[x.clave]);

  return (
    <div className="permisos-editor">
      {showTemplates && (
        <div className="permisos-toolbar">
          <span className="muted">Plantilla rápida:</span>
          <button type="button" className="chip" disabled={disabled} onClick={() => setPermisos(permisosPorDefecto('tecnico'))}>
            Interno
          </button>
          <button type="button" className="chip" disabled={disabled} onClick={() => setPermisos(permisosPorDefecto('admin'))}>
            Todo
          </button>
          <button type="button" className="chip" disabled={disabled} onClick={() => setPermisos({ ...MAPA_VACIO })}>
            Nada
          </button>
          <button type="button" className="chip danger" disabled={disabled} onClick={() => setPermisos({ ...MAPA_VACIO })}>
            Quitar todos
          </button>
        </div>
      )}

      <div className="permisos-quick">
        {GRUPOS.map((g) => {
          const ver = g.items.filter((i) => i.op === 'ver');
          const usar = g.items.filter((i) => i.op !== 'ver');
          const verTodos = ver.length > 0 && ver.every((i) => permisos[i.clave]);
          const verAlguno = ver.some((i) => permisos[i.clave]);
          const usarTodos = usar.length > 0 && usar.every((i) => permisos[i.clave]);
          const usarAlguno = usar.some((i) => permisos[i.clave]);
          return (
            <div key={g.grupo} className="permisos-quick-card">
              <div className="permisos-quick-head">
                <b>{g.grupo}</b>
                <button
                  type="button"
                  className="chip"
                  disabled={disabled || g.items.every((i) => !permisos[i.clave])}
                  onClick={() => marcarGrupo(g.items, false)}
                  title={`Quitar todos los permisos de ${g.grupo}`}
                >
                  Quitar
                </button>
              </div>
              <div className="permisos-quick-opts">
                <CheckTri
                  checked={verTodos}
                  indeterminate={verAlguno && !verTodos}
                  onChange={() => marcarGrupo(ver, !verTodos)}
                  disabled={disabled || ver.length === 0}
                >
                  Ver
                </CheckTri>
                <CheckTri
                  checked={usarTodos}
                  indeterminate={usarAlguno && !usarTodos}
                  onChange={() => marcarGrupo(usar, !usarTodos)}
                  disabled={disabled || usar.length === 0}
                >
                  Usar
                </CheckTri>
              </div>
              <small className="muted">
                {g.items.filter((i) => permisos[i.clave]).length} de {g.items.length} permisos
              </small>
            </div>
          );
        })}
      </div>

      <div className="permisos-tabla-wrap">
        <table className="permisos-tabla">
          <thead>
            <tr>
              <th>Permiso</th>
              {COLUMNAS.map((c) => (
                <th key={c.op}>
                  <button
                    type="button"
                    className="permisos-col-todos"
                    onClick={() => marcarColumna(c.op)}
                    disabled={disabled}
                    title={`Marcar o desmarcar todos los permisos de ${c.label}`}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRUPOS.map((g) => (
              <Fragment key={g.grupo}>
                <tr className="permisos-fila-grupo">
                  <td colSpan={COLUMNAS.length + 1}>
                    <span className="permisos-grupo-nombre">{g.grupo}</span>
                    <button type="button" className="chip" disabled={disabled} onClick={() => marcarGrupo(g.items, true)}>todos</button>
                    <button type="button" className="chip" disabled={disabled} onClick={() => marcarGrupo(g.items, false)}>ninguno</button>
                  </td>
                </tr>
                {g.items.map((it) => (
                  <tr key={it.clave} className={it.critica ? 'permisos-critica' : ''}>
                    <td>
                      <b>{it.etiqueta}</b>
                      <small>{it.detalle}</small>
                    </td>
                    {COLUMNAS.map((c) => (
                      <td key={c.op} className="permisos-celda">
                        {it.op === c.op ? (
                          <input
                            type="checkbox"
                            checked={Boolean(permisos[it.clave])}
                            onChange={() => alternar(it.clave)}
                            disabled={disabled}
                            aria-label={it.etiqueta}
                          />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {criticos.length > 0 && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          <span className="badge amber" style={{ marginRight: 6 }}>Atención</span>
          Con estos permisos puede {criticos.map((c) => c.etiqueta.toLowerCase()).join(', ')}.
        </p>
      )}
    </div>
  );
}
