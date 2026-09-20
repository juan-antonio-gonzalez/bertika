import { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { calcularVisita, normalizarConfig, CONFIG_DEFAULT, fmtUSD, MAX_KM } from '../data/cotizadorVisita';

const input = { width: '100%', minWidth: 70 };
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

// Editor de TODAS las variables del cotizador de visitas (solo admin).
// Guarda en la base vía PUT /api/cotizador y el sitio público lo toma al instante.
export default function CotizadorConfig() {
  const toastShow = useStore((s) => s.toastShow);
  const [cfg, setCfg] = useState(CONFIG_DEFAULT);
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    try {
      const d = await api('/public/cotizador');
      setCfg(normalizarConfig(d.config || {}));
      setInfo({ actualizado: d.actualizado, actualizadoPor: d.actualizadoPor });
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const filasZona = (i, patch) => set({ zonas: cfg.zonas.map((z, j) => (j === i ? { ...z, ...patch } : z)) });
  const borrarZona = (i) => set({ zonas: cfg.zonas.filter((_, j) => j !== i) });
  const agregarZona = () => {
    const ult = cfg.zonas[cfg.zonas.length - 1];
    set({ zonas: [...cfg.zonas, { id: `z${cfg.zonas.length + 1}`, nombre: 'Nueva franja', hastaKm: (ult?.hastaKm || 0) + 100, base: 0, cubreKm: 0, kmAdicional: 0 }] });
  };
  const filasTipo = (i, patch) => set({ tipos: cfg.tipos.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const filasExtra = (i, patch) => set({ extras: cfg.extras.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const filasDesc = (i, patch) => set({ descuentos: cfg.descuentos.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  // Vista previa en vivo: primero se valida la config y, si está bien, se
  // calculan ejemplos para ver el efecto antes de guardar.
  const preview = useMemo(() => {
    try {
      const valida = normalizarConfig(cfg);
      const tipo = valida.tipos[0]?.id;
      const kms = [50, 150, 300, 500, valida.maxKm];
      return {
        valida,
        error: '',
        filas: [...new Set(kms)].map((km) => {
          const r = calcularVisita({ km, renglones: tipo ? [{ tipoId: tipo, cantidad: 1 }] : [], config: valida });
          return { km, traslado: r.traslado, viaticos: r.viaticos, dias: r.viaticosDias, total: r.total, ok: r.ok };
        }),
      };
    } catch (e) {
      return { valida: null, error: e.message, filas: [] };
    }
  }, [cfg]);

  const guardar = async () => {
    if (preview.error) return toastShow(preview.error, 'error');
    setBusy(true);
    try {
      const r = await api('/cotizador', { method: 'PUT', body: { config: preview.valida } });
      setCfg(normalizarConfig(r.config));
      setInfo({ actualizado: new Date().toISOString(), actualizadoPor: r.actualizadoPor });
      toastShow('Tarifas del cotizador actualizadas', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (cargando) return <p className="muted">Cargando configuración del cotizador...</p>;

  return (
    <div className="col">
      <div className="row between wrap mb16" style={{ gap: 10 }}>
        <div>
          <h3 className="card-title"><Icon name="calculator" size={15} /> Tarifas del cotizador de visitas</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
            Todo lo que se cobra en <b>/cotizador</b> se calcula con esta tabla. Los cambios se aplican al guardar.
            {info?.actualizado && <> Última edición: {new Date(info.actualizado).toLocaleString('es-AR')}{info.actualizadoPor ? ` por ${info.actualizadoPor}` : ''}.</>}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setCfg(CONFIG_DEFAULT)}><Icon name="refresh" size={13} /> Valores de fábrica</button>
          <button className="btn sm primary" disabled={busy || Boolean(preview.error)} onClick={guardar}>
            <Icon name="check" size={13} /> {busy ? 'Guardando...' : 'Guardar tarifas'}
          </button>
        </div>
      </div>

      {preview.error && <div className="banner-red"><Icon name="warn" size={15} /> {preview.error}</div>}

      {/* Traslado */}
      <div className="card pad0">
        <div className="row between" style={{ padding: '12px 14px' }}>
          <div className="card-title"><Icon name="truck" size={14} /> Traslado por franjas</div>
          <button className="btn sm" onClick={agregarZona}><Icon name="plus" size={13} /> Agregar franja</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre</th><th className="num">Hasta km</th><th className="num">Base (USD)</th>
                <th className="num">Cubre hasta (km)</th><th className="num">USD por km extra</th><th />
              </tr>
            </thead>
            <tbody>
              {cfg.zonas.map((z, i) => (
                <tr key={i}>
                  <td><input className="input" style={input} value={z.nombre} onChange={(e) => filasZona(i, { nombre: e.target.value })} /></td>
                  <td><input className="input" type="number" min="1" style={input} value={z.hastaKm} onChange={(e) => filasZona(i, { hastaKm: num(e.target.value) })} /></td>
                  <td><input className="input" type="number" min="0" style={input} value={z.base} onChange={(e) => filasZona(i, { base: num(e.target.value) })} /></td>
                  <td><input className="input" type="number" min="0" style={input} value={z.cubreKm} onChange={(e) => filasZona(i, { cubreKm: num(e.target.value) })} /></td>
                  <td><input className="input" type="number" min="0" step="0.5" style={input} value={z.kmAdicional} onChange={(e) => filasZona(i, { kmAdicional: num(e.target.value) })} /></td>
                  <td><button className="btn sm danger" aria-label={`Quitar franja ${z.nombre}`} disabled={cfg.zonas.length <= 1} onClick={() => borrarZona(i)}><Icon name="x" size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ padding: '8px 14px 14px', fontSize: 12, margin: 0 }}>
          La base cubre hasta "cubre hasta" km; a partir de ahí se suma "USD por km extra".
          La última franja define la <b>cobertura máxima</b> ({preview.valida?.maxKm || MAX_KM} km): arriba de eso no se cotiza.
        </p>
      </div>

      {/* Viáticos */}
      <div className="card">
        <div className="card-title"><Icon name="clock" size={14} /> Viáticos de viaje</div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          Se activan desde cierta distancia: 1 día y uno más cada X km (con tope). Poner 0 en "por día" los desactiva.
        </p>
        <div className="grid4">
          <div className="field"><label>Desde (km)</label><input className="input" type="number" min="0" value={cfg.viaticos.desdeKm} onChange={(e) => set({ viaticos: { ...cfg.viaticos, desdeKm: num(e.target.value) } })} /></div>
          <div className="field"><label>USD por día</label><input className="input" type="number" min="0" value={cfg.viaticos.porDia} onChange={(e) => set({ viaticos: { ...cfg.viaticos, porDia: num(e.target.value) } })} /></div>
          <div className="field"><label>1 día más cada (km)</label><input className="input" type="number" min="1" value={cfg.viaticos.diaCadaKm} onChange={(e) => set({ viaticos: { ...cfg.viaticos, diaCadaKm: num(e.target.value) } })} /></div>
          <div className="field"><label>Tope de días</label><input className="input" type="number" min="1" max="30" value={cfg.viaticos.maxDias} onChange={(e) => set({ viaticos: { ...cfg.viaticos, maxDias: num(e.target.value) } })} /></div>
        </div>
      </div>

      {/* Revisión por tipo */}
      <div className="card pad0">
        <div className="row between" style={{ padding: '12px 14px' }}>
          <div className="card-title"><Icon name="battery" size={14} /> Revisión por tipo de batería (USD por unidad)</div>
          <button className="btn sm" onClick={() => set({ tipos: [...cfg.tipos, { id: '', nombre: 'Nuevo tipo', precioUnidad: 0 }] })}><Icon name="plus" size={13} /> Agregar tipo</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Tipo</th><th className="num">Precio por unidad</th><th /></tr></thead>
            <tbody>
              {cfg.tipos.map((t, i) => (
                <tr key={i}>
                  <td><input className="input" value={t.nombre} onChange={(e) => filasTipo(i, { nombre: e.target.value })} /></td>
                  <td><input className="input" type="number" min="0" style={input} value={t.precioUnidad} onChange={(e) => filasTipo(i, { precioUnidad: num(e.target.value) })} /></td>
                  <td><button className="btn sm danger" aria-label={`Quitar ${t.nombre}`} disabled={cfg.tipos.length <= 1} onClick={() => set({ tipos: cfg.tipos.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Descuentos */}
      <div className="card pad0">
        <div className="row between" style={{ padding: '12px 14px' }}>
          <div className="card-title"><Icon name="dollar" size={14} /> Descuento por volumen (sobre la revisión)</div>
          <button className="btn sm" onClick={() => set({ descuentos: [...cfg.descuentos, { desde: 50, pct: 0.2 }] })}><Icon name="plus" size={13} /> Agregar tramo</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th className="num">Desde (unidades)</th><th className="num">Descuento (%)</th><th /></tr></thead>
            <tbody>
              {cfg.descuentos.map((d, i) => (
                <tr key={i}>
                  <td><input className="input" type="number" min="1" style={input} value={d.desde} onChange={(e) => filasDesc(i, { desde: num(e.target.value) })} /></td>
                  <td><input className="input" type="number" min="0" max="100" style={input} value={Math.round(d.pct * 100)} onChange={(e) => filasDesc(i, { pct: num(e.target.value) / 100 })} /></td>
                  <td><button className="btn sm danger" aria-label="Quitar tramo" onClick={() => set({ descuentos: cfg.descuentos.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extras */}
      <div className="card pad0">
        <div className="row between" style={{ padding: '12px 14px' }}>
          <div className="card-title"><Icon name="box" size={14} /> Servicios adicionales (sujetos a análisis comercial)</div>
          <button className="btn sm" onClick={() => set({ extras: [...cfg.extras, { id: '', nombre: 'Nuevo servicio', precio: 0, porEquipo: false }] })}><Icon name="plus" size={13} /> Agregar servicio</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Servicio</th><th className="num">Precio (USD)</th><th>¿Por equipo?</th><th /></tr></thead>
            <tbody>
              {cfg.extras.map((e, i) => (
                <tr key={i}>
                  <td><input className="input" value={e.nombre} onChange={(ev) => filasExtra(i, { nombre: ev.target.value })} /></td>
                  <td><input className="input" type="number" min="0" style={input} value={e.precio} onChange={(ev) => filasExtra(i, { precio: num(ev.target.value) })} /></td>
                  <td>
                    <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
                      <input type="checkbox" checked={Boolean(e.porEquipo)} onChange={(ev) => filasExtra(i, { porEquipo: ev.target.checked })} /> se multiplica por equipo
                    </label>
                  </td>
                  <td><button className="btn sm danger" aria-label={`Quitar ${e.nombre}`} onClick={() => set({ extras: cfg.extras.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recargos y generales */}
      <div className="grid2">
        <div className="card">
          <div className="card-title"><Icon name="gauge" size={14} /> Recargos e IVA</div>
          <div className="grid2 mt8">
            <div className="field"><label>Urgencia express (%)</label><input className="input" type="number" min="0" max="100" value={Math.round(cfg.urgencia.express * 100)} onChange={(e) => set({ urgencia: { ...cfg.urgencia, express: num(e.target.value) / 100 } })} /></div>
            <div className="field"><label>Fin de semana (%)</label><input className="input" type="number" min="0" max="100" value={Math.round(cfg.turno.finde * 100)} onChange={(e) => set({ turno: { ...cfg.turno, finde: num(e.target.value) / 100 } })} /></div>
            <div className="field"><label>IVA (%)</label><input className="input" type="number" min="0" max="100" value={Math.round(cfg.iva * 100)} onChange={(e) => set({ iva: num(e.target.value) / 100 })} /></div>
            <div className="field"><label>Vigencia (días)</label><input className="input" type="number" min="1" max="365" value={cfg.vigenciaDias} onChange={(e) => set({ vigenciaDias: num(e.target.value) })} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title"><Icon name="info" size={14} /> Límites del formulario</div>
          <div className="grid2 mt8">
            <div className="field"><label>Unidades por renglón</label><input className="input" type="number" min="1" value={cfg.maxUnidadesPorRenglon} onChange={(e) => set({ maxUnidadesPorRenglon: num(e.target.value) })} /></div>
            <div className="field"><label>Renglones por estimación</label><input className="input" type="number" min="1" max="50" value={cfg.maxRenglones} onChange={(e) => set({ maxRenglones: num(e.target.value) })} /></div>
            <div className="field"><label>Cantidad máxima de un extra</label><input className="input" type="number" min="1" value={cfg.maxCantidadExtra} onChange={(e) => set({ maxCantidadExtra: num(e.target.value) })} /></div>
            <div className="field"><label>Moneda</label><input className="input" value={cfg.moneda} onChange={(e) => set({ moneda: e.target.value })} /></div>
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div className="card pad0">
        <div className="card-title" style={{ padding: '12px 14px' }}><Icon name="search" size={14} /> Cómo queda (1 batería del primer tipo)</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th className="num">km</th><th className="num">Traslado</th><th className="num">Viáticos</th><th className="num">Total estimado</th></tr></thead>
            <tbody>
              {preview.filas.map((f) => (
                <tr key={f.km}>
                  <td className="num">{f.km}</td>
                  <td className="num mono">{f.ok ? fmtUSD.format(f.traslado) : '—'}</td>
                  <td className="num mono">{f.dias ? `${fmtUSD.format(f.viaticos)} (${f.dias}d)` : '—'}</td>
                  <td className="num mono"><b>{f.ok ? fmtUSD.format(f.total) : 'no se cotiza'}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
