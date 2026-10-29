import { CAPACIDADES_AREA, permisosArea } from '../data/listas';
import { Icon } from './ui';

// Matriz compacta de áreas para la categoría: qué área ve y qué puede hacer
// dentro. No reemplaza la matriz de módulos del taller; la complementa.
export default function MatrizAreas({ areas = [], valor = {}, onChange, disabled = false }) {
  const cambiar = (areaId, clave, activo) => {
    const actual = permisosArea(valor, areaId);
    let siguiente;
    if (clave === 'ver' && !activo) {
      siguiente = Object.fromEntries(CAPACIDADES_AREA.map((c) => [c.clave, false]));
    } else {
      siguiente = { ...actual, [clave]: activo };
      if (clave === 'ver' && activo) siguiente.ver = true;
      if (!siguiente.ver) {
        for (const c of CAPACIDADES_AREA) siguiente[c.clave] = false;
      }
    }
    onChange({ ...valor, [areaId]: siguiente });
  };

  if (!areas.length) {
    return (
      <div className="banner-info">
        <Icon name="info" size={15} />
        <span>No hay áreas activas. El administrador puede crearlas desde la base.</span>
      </div>
    );
  }

  return (
    <div className="areas-matriz">
      {areas.map((area) => {
        const caps = permisosArea(valor, area.id);
        return (
          <div className={`area-card${caps.ver ? ' on' : ''}`} key={area.id}>
            <div className="area-card-head">
              <div className="row" style={{ gap: 8 }}>
                <span className="area-ico"><Icon name={area.icono || 'clipboard'} size={15} /></span>
                <div>
                  <b>{area.nombre}</b>
                  {area.descripcion && <small>{area.descripcion}</small>}
                </div>
              </div>
              <label className="check-line" style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
                <input
                  type="checkbox"
                  checked={caps.ver}
                  disabled={disabled}
                  onChange={(e) => cambiar(area.id, 'ver', e.target.checked)}
                />
                <span>Ver área</span>
              </label>
            </div>

            {caps.ver && (
              <div className="area-opts">
                {CAPACIDADES_AREA.filter((c) => c.clave !== 'ver').map((c) => (
                  <label key={c.clave} className={`permisos-check${disabled ? ' is-disabled' : ''}`} title={c.detalle}>
                    <input
                      type="checkbox"
                      checked={caps[c.clave]}
                      disabled={disabled}
                      onChange={(e) => cambiar(area.id, c.clave, e.target.checked)}
                    />
                    {c.etiqueta}
                  </label>
                ))}
              </div>
            )}

            {!caps.ver && (
              <small className="muted" style={{ fontSize: 11.5 }}>
                Sin acceso: no aparece en el menú y la API rechaza sus listas.
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
