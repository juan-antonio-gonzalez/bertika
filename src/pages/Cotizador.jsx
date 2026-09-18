import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui';
import { COTIZADOR_VISITA, calcularVisita, fmtUSD, NOTA_CAMBIO } from '../data/cotizadorVisita';

export default function Cotizador() {
  const [km, setKm] = useState('');
  const [errorKm, setErrorKm] = useState(false);
  const [renglones, setRenglones] = useState([{ tipoId: COTIZADOR_VISITA.tipos[0].id, cantidad: 1 }]);
  const [extrasSel, setExtrasSel] = useState([]);
  const [urgencia, setUrgencia] = useState('normal');
  const [turno, setTurno] = useState('comercial');
  const navigate = useNavigate();
  const kmRef = useRef(null);

  const r = useMemo(
    () => calcularVisita({ km: Number(km) || 0, renglones, extrasSel, urgencia, turno }),
    [km, renglones, extrasSel, urgencia, turno],
  );
  const tieneKm = Number(km) > 0;
  const link = `/contacto?asunto=${encodeURIComponent('Visita técnica en planta')}&resumen=${encodeURIComponent(r.resumen)}`;

  const handleKmChange = (e) => {
    setKm(e.target.value);
    if (Number(e.target.value) > 0) setErrorKm(false);
  };
  const handleSolicitar = () => {
    if (!Number(km) || Number(km) <= 0) {
      setErrorKm(true);
      kmRef.current?.focus();
      return;
    }
    navigate(link);
  };
  const limpiar = () => {
    setKm('');
    setErrorKm(false);
    setRenglones([{ tipoId: COTIZADOR_VISITA.tipos[0].id, cantidad: 1 }]);
    setExtrasSel([]);
    setUrgencia('normal');
    setTurno('comercial');
  };

  const setRenglon = (i, patch) => setRenglones((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const toggleExtra = (id) => setExtrasSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="page-light">
      <section className="page-hero">
        <div className="page-hero-bg"><img src="/img/slide00-drop.jpg" alt="" /></div>
        <div className="wrap">
          <h1>Cotizador de visita</h1>
          <div className="breadcrumb"><Link to="/">Home</Link> / Cotizador de visita</div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="center" style={{ maxWidth: 720, margin: '0 auto 26px' }}>
            <h2 className="sec-title">Estimá una visita técnica en tu planta</h2>
            <p className="sec-sub">
              Armá un cálculo aproximado en segundos: distancia, tipos y cantidades de baterías a revisar,
              y servicios extra. Si te convence, pedinos una atención personalizada y te cotizamos por escrito.
            </p>
          </div>

          <div className="grid2" style={{ alignItems: 'start', gap: 22 }}>
            {/* Config */}
            <div className="card" style={{ padding: 22 }}>
              <h3 className="card-title"><Icon name="gear" size={14} /> Configurá tu visita</h3>

              <div className="field">
                <label>Distancia desde nuestra planta (km) *</label>
                <div className="form-row">
                  <input
                    className={`input${errorKm ? ' input-error' : ''}`} type="number" min="0" inputMode="numeric"
                    value={km} onChange={handleKmChange}
                    onBlur={() => { if (!Number(km) || Number(km) <= 0) setErrorKm(true); }}
                    placeholder="Ej: 35" style={{ width: 160 }}
                    ref={kmRef}
                  />
                  <div style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>
                    {tieneKm ? (
                      <>
                        Zona: <b>{r.zona.nombre}</b> · base {fmtUSD.format(r.zona.base)}
                        <span style={{ display: 'block' }}>
                          {km && km > r.zona.maxKm ? `+ ${fmtUSD.format(r.zona.kmAdicional)}/km adicional` : 'km adicionales incluidos'}
                        </span>
                      </>
                    ) : (
                      'Ingresá los km para calcular el traslado.'
                    )}
                  </div>
                </div>
                {errorKm && (
                  <div className="banner-red" style={{ marginBottom: 0, marginTop: 8 }}>
                    <Icon name="warn" size={14} /> La distancia es obligatoria: ingresá los kilómetros aproximados para poder solicitar la atención.
                  </div>
                )}
              </div>

              <div className="field">
                <label>Baterías a revisar</label>
                <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                  Por defecto se carga 1 batería <b>Plomo-Ácido × 1</b> como ejemplo.
                  Ajustá tipo y cantidad reales, o quitá todas las filas para calcular solo el traslado.
                </p>
                {renglones.map((ren, i) => (
                  <div className="form-row" key={i} style={{ marginBottom: 8 }}>
                    <select
                      className="input" style={{ flex: 1 }}
                      value={ren.tipoId} onChange={(e) => setRenglon(i, { tipoId: e.target.value })}
                    >
                      {COTIZADOR_VISITA.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                    <input
                      className="input" type="number" min="1" inputMode="numeric"
                      value={ren.cantidad} onChange={(e) => setRenglon(i, { cantidad: e.target.value })}
                      style={{ width: 80 }} title="Cantidad"
                    />
                    <button
                      className="btn sm ghost" type="button"
                      onClick={() => setRenglones((ls) => ls.filter((_, j) => j !== i))}
                      title="Quitar"
                    ><Icon name="x" size={14} /></button>
                  </div>
                ))}
                <button className="btn sm" type="button" onClick={() => setRenglones((ls) => [...ls, { tipoId: COTIZADOR_VISITA.tipos[0].id, cantidad: 1 }])}>
                  <Icon name="plus" size={13} /> Agregar batería
                </button>
              </div>

              <div className="field">
                <label>Servicios adicionales</label>
                {COTIZADOR_VISITA.extras.map((e) => (
                  <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', cursor: 'pointer', fontSize: 13.5 }}>
                    <input type="checkbox" checked={extrasSel.includes(e.id)} onChange={() => toggleExtra(e.id)} />
                    <span style={{ flex: 1 }}>{e.nombre}</span>
                    <span className="mono">{fmtUSD.format(e.precio)}</span>
                  </label>
                ))}
              </div>

              <div className="field">
                <label>Urgencia</label>
                <div className="form-row">
                  {[['normal', 'Normal'], ['express', 'Express 48 h (+25%)']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, marginRight: 14 }}>
                      <input type="radio" name="urgencia" checked={urgencia === v} onChange={() => setUrgencia(v)} /> {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Turno</label>
                <div className="form-row">
                  {[['comercial', 'Horario comercial'], ['finde', 'Fin de semana (+30%)']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, marginRight: 14 }}>
                      <input type="radio" name="turno" checked={turno === v} onChange={() => setTurno(v)} /> {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Resultado */}
            <div className="card" style={{ padding: 22, position: 'sticky', top: 96 }}>
              <h3 className="card-title"><Icon name="calculator" size={14} /> Estimación en vivo (USD)</h3>

              {!tieneKm ? (
                <div className="center" style={{ padding: '30px 10px' }}>
                  <Icon name="search" size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                  <p className="muted" style={{ fontSize: 13.5 }}>Ingresá la distancia aproximada para calcular la estimación.</p>
                </div>
              ) : (
              <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={td}>Traslado {km ? `(${km} km · ${r.zona.nombre})` : ''}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.traslado)}</td>
                  </tr>
                  {r.revision > 0 && (
                  <tr>
                    <td style={td}>Revisión de baterías ({r.totalUnidades} unid.)</td>
                    <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.revision)}</td>
                  </tr>
                )}
                  {r.detalle.map((d, i) => (
                    <tr key={i}>
                      <td style={{ ...td, paddingLeft: 16, color: 'var(--muted)', fontSize: 12.5 }}>— {d.tipo.nombre} × {d.cantidad}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }} className="mono">{fmtUSD.format(d.cantidad * d.tipo.precioUnidad)}</td>
                    </tr>
                  ))}
                  {r.descuentoVol > 0 && (
                    <tr>
                      <td style={td}>Descuento por volumen (−{Math.round(r.descPct * 100)}%)</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--green)' }} className="mono">−{fmtUSD.format(r.descuentoVol)}</td>
                    </tr>
                  )}
                  {r.extras > 0 && (
                    <tr>
                      <td style={td}>Servicios adicionales ({r.detExtras.length})</td>
                      <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.extras)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ ...td, borderTop: '1px solid var(--line)' }}>Subtotal</td>
                    <td style={{ ...td, textAlign: 'right', borderTop: '1px solid var(--line)' }} className="mono">{fmtUSD.format(r.subtotal)}</td>
                  </tr>
                  {r.recargo > 0 && (
                    <tr>
                      <td style={td}>Recargo {urgencia === 'express' ? 'express' : ''}{urgencia === 'express' && turno === 'finde' ? ' + ' : ''}{turno === 'finde' ? 'fin de semana' : ''} (+{Math.round(r.recargoPct * 100)}%)</td>
                      <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.recargo)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={td}>IVA ({Math.round(COTIZADOR_VISITA.iva * 100)}%)</td>
                    <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.iva)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...td, paddingTop: 12, fontSize: 15, fontWeight: 800 }}>Total estimado</td>
                    <td style={{ ...td, paddingTop: 12, textAlign: 'right' }} className="mono" >
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{fmtUSD.format(r.total)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                Valor estimativo orientativo, <b>solo para el servicio de revisión y diagnóstico en planta</b>.
                No incluye reparación, repuestos ni recambio de celdas. La cotización final se confirma por escrito.
              </p>
              </>
              )}

              <button className="btn primary lg block" onClick={handleSolicitar}>
                <Icon name="clipboard" size={16} /> Solicitar atención personalizada
              </button>
              <button className="btn sm ghost block center" onClick={limpiar} style={{ marginTop: 10 }}>
                <Icon name="x" size={13} /> Limpiar cotizador
              </button>

              <div className="center" style={{ marginTop: 12 }}>
                <Link to="/seguimiento" className="auth-back"><Icon name="search" size={13} /> Ver seguimiento de una orden</Link>
              </div>
            </div>
          </div>

          <div className="banner-info" style={{ textAlign: 'left', marginTop: 22 }}>
            <Icon name="info" size={15} /> El importe correspondesolo al servicio de revisión y diagnóstico en tu planta. No incluye reparación, repuestos ni recambio de celdas: eso se cotiza por separado según el resultado del diagnóstico.
          </div>
          <div className="banner-cambio" style={{ textAlign: 'left' }}>
            <Icon name="dollar" size={15} /> {NOTA_CAMBIO}
          </div>
        </div>
      </section>
    </div>
  );
}

const td = { padding: '6px 8px', fontSize: 13.5, verticalAlign: 'top' };