import { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { calcularVisita, normalizarConfig, CONFIG_DEFAULT, fmtUSD, MAX_KM } from '../data/cotizadorVisita';

const input = { width: '100%', minWidth: 70 };
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

const textoMargen = (pct) => {
  if (pct == null) return 'Fuera de cobertura';
  if (pct < 0) return 'A pérdida';
  if (pct < 20) return 'Margen bajo';
  if (pct < 40) return 'Margen ajustado';
  return 'Margen sano';
};

// Serie diaria de eventos [{dia, tipo, n}] → [{dia, abre, solicita}]
const agruparSerie = (serie) => {
  const porDia = new Map();
  for (const e of serie) {
    const d = porDia.get(e.dia) || { dia: e.dia, abre: 0, solicita: 0 };
    d[e.tipo] = e.n;
    porDia.set(e.dia, d);
  }
  return [...porDia.values()];
};

// Editor de TODAS las variables del cotizador de visitas (solo admin).
// Guarda en la base vía PUT /api/cotizador y el sitio público lo toma al instante.
export default function CotizadorConfig() {
  const toastShow = useStore((s) => s.toastShow);
  const [cfg, setCfg] = useState(CONFIG_DEFAULT);
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [simKm, setSimKm] = useState(300);
  const [simModo, setSimModo] = useState('sitio');

  const cargarMetricas = async () => {
    try {
      setMetricas(await api('/cotizador/metricas'));
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

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
  useEffect(() => { cargar(); cargarMetricas(); }, []);

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

  // Simulador interno: precio al cliente vs costo estimado, para decidir si
  // conviene aceptar una visita larga. Usa la config que está editando.
  const simulacion = useMemo(() => {
    if (!preview.valida) return null;
    try {
      const tipo = preview.valida.tipos[0]?.id;
      return calcularVisita({
        km: simModo === 'taller' ? 0 : simKm,
        renglones: tipo ? [{ tipoId: tipo, cantidad: 1 }] : [],
        modo: simModo,
        config: preview.valida,
      });
    } catch {
      return null;
    }
  }, [preview.valida, simKm, simModo]);

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

      {/* Revisión en nuestro taller */}
      <div className="card">
        <div className="card-title"><Icon name="tools" size={14} /> Revisión en nuestro taller</div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          Modalidad en la que el cliente trae la batería: no se cobra traslado ni viáticos y se bonifica la revisión.
        </p>
        <div className="grid2">
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox" checked={Boolean(cfg.modoTaller.habilitado)}
              onChange={(e) => set({ modoTaller: { ...cfg.modoTaller, habilitado: e.target.checked } })}
            />
            Ofrecer esta modalidad en el cotizador
          </label>
          <div className="field">
            <label>Bonificación sobre la revisión (%)</label>
            <input
              className="input" type="number" min="0" max="100" value={Math.round(cfg.modoTaller.descuentoRevisionPct * 100)}
              onChange={(e) => set({ modoTaller: { ...cfg.modoTaller, descuentoRevisionPct: num(e.target.value) / 100 } })}
            />
          </div>
        </div>
      </div>

      {/* Costos internos + simulador */}
      <div className="card">
        <div className="card-title"><Icon name="dollar" size={14} /> Costos internos y margen (no se muestran al cliente)</div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          Sirven para decidir si conviene una visita lejana. El costo estima el viaje de ida y vuelta, los días de técnico y los viáticos reales.
        </p>
        <div className="grid3">
          <div className="field"><label>USD por km (combustible, desgaste)</label><input className="input" type="number" min="0" step="0.1" value={cfg.costos.porKm} onChange={(e) => set({ costos: { ...cfg.costos, porKm: num(e.target.value) } })} /></div>
          <div className="field"><label>USD por día de técnico</label><input className="input" type="number" min="0" value={cfg.costos.tecnicoPorDia} onChange={(e) => set({ costos: { ...cfg.costos, tecnicoPorDia: num(e.target.value) } })} /></div>
          <div className="field"><label>USD viático real por día</label><input className="input" type="number" min="0" value={cfg.costos.viaticoPorDia} onChange={(e) => set({ costos: { ...cfg.costos, viaticoPorDia: num(e.target.value) } })} /></div>
        </div>
        <div className="row wrap mt16" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ maxWidth: 140 }}><label>Simular km</label><input className="input" type="number" min="0" value={simKm} onChange={(e) => setSimKm(num(e.target.value))} /></div>
          <div className="cz-seg" role="group" aria-label="Modalidad a simular">
            <button type="button" className={simModo === 'sitio' ? 'on' : ''} onClick={() => setSimModo('sitio')}>Visita</button>
            <button type="button" className={simModo === 'taller' ? 'on' : ''} onClick={() => setSimModo('taller')}>En taller</button>
          </div>
        </div>
        {simulacion && (
          <div className="grid4 mt16">
            <div className="kpi"><div className="kpi-label">Precio al cliente (sin IVA)</div><div className="kpi-value">{fmtUSD.format(simulacion.subtotal)}</div><div className="kpi-sub">{simulacion.diasTecnico} día(s) de técnico</div></div>
            <div className="kpi"><div className="kpi-label">Costo estimado</div><div className="kpi-value">{fmtUSD.format(simulacion.costoInterno)}</div><div className="kpi-sub">viaje {fmtUSD.format(simulacion.costoViaje)} + días {fmtUSD.format(simulacion.costoDias)}</div></div>
            <div className={`kpi ${simulacion.margen != null && simulacion.margen < 0 ? 'danger' : ''}`}>
              <div className="kpi-label">Margen bruto</div>
              <div className="kpi-value">{simulacion.margen == null ? '—' : fmtUSD.format(simulacion.margen)}</div>
              <div className="kpi-sub">{simulacion.margenPct == null ? 'fuera de cobertura' : `${simulacion.margenPct}% del precio`}</div>
            </div>
            <div className={`kpi ${simulacion.margenPct != null && simulacion.margenPct < 30 ? 'alert' : ''}`}>
              <div className="kpi-label">Diagnóstico</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{textoMargen(simulacion.margenPct)}</div>
              <div className="kpi-sub">sobre el precio sin IVA</div>
            </div>
          </div>
        )}
      </div>

      {/* Embudo */}
      <div className="card pad0">
        <div className="row between" style={{ padding: '12px 14px' }}>
          <div className="card-title"><Icon name="gauge" size={14} /> Embudo del cotizador (últimos {metricas?.dias || 30} días)</div>
          <button className="btn sm" onClick={cargarMetricas}><Icon name="refresh" size={13} /> Actualizar</button>
        </div>
        {!metricas ? (
          <p className="muted" style={{ padding: '0 14px 14px', fontSize: 12.5 }}>Cargando métricas...</p>
        ) : (
          <>
            <div className="grid4" style={{ padding: '0 14px 14px' }}>
              <div className="kpi"><div className="kpi-label">Abrieron el cotizador</div><div className="kpi-value">{metricas.funnel.abre}</div><div className="kpi-sub">{metricas.funnel.interactua} lo usaron (movieron algo)</div></div>
              <div className="kpi"><div className="kpi-label">Pidieron atención</div><div className="kpi-value green">{metricas.funnel.solicita}</div><div className="kpi-sub">{metricas.funnel.whatsapp} por WhatsApp · {metricas.funnel.imprime} imprimieron</div></div>
              <div className="kpi"><div className="kpi-label">Conversión</div><div className="kpi-value">{metricas.funnel.conversion == null ? '—' : `${metricas.funnel.conversion}%`}</div><div className="kpi-sub">de los que abrieron</div></div>
              <div className="kpi"><div className="kpi-label">Ticket promedio</div><div className="kpi-value">{fmtUSD.format(metricas.cotizaciones.ticket_promedio || 0)}</div><div className="kpi-sub">{metricas.cotizaciones.solicitadas} de {metricas.cotizaciones.total} estimaciones solicitaron · {metricas.cotizaciones.en_taller} en taller</div></div>
            </div>
            {metricas.serie?.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Día</th><th className="num">Abrieron</th><th className="num">Solicitaron</th></tr></thead>
                  <tbody>
                    {agruparSerie(metricas.serie).slice(-10).map((d) => (
                      <tr key={d.dia}><td className="mono">{d.dia}</td><td className="num">{d.abre || 0}</td><td className="num">{d.solicita || 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
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
