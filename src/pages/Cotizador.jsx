import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Modal } from '../components/ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { imprimirDocumento } from '../components/DocumentosTaller';
import { CONTACTO } from '../data/siteData';
import {
  calcularVisita, normalizarConfig, CONFIG_DEFAULT, textoFueraCobertura,
  fmtUSD, fmtARS, NOTA_CAMBIO,
} from '../data/cotizadorVisita';

const td = { padding: '6px 8px', fontSize: 13.5, verticalAlign: 'top' };

// Detalle imprimible de la estimación (código, vigencia y datos del cliente).
function DocumentoCotizacion({ cot, codigo, km, dolar, cliente, config }) {
  const hoy = new Date();
  return (
    <div className="print-doc doc">
      <div className="doc-head">
        <div>
          <div className="doc-brand">BERTIKA<sup>®</sup></div>
          <div className="doc-brand-sub">Acumuladores Industriales · {CONTACTO.direccion}</div>
        </div>
        <div className="doc-head-right">
          <div className="doc-title">ESTIMACIÓN DE VISITA TÉCNICA</div>
          {codigo && <div className="doc-num">{codigo}</div>}
          <div className="doc-fecha">Fecha: {hoy.toLocaleDateString('es-AR')}</div>
          <div className="doc-fecha">Validez: {config.vigenciaDias} días</div>
        </div>
      </div>

      {(cliente?.nombre || cliente?.empresa) && (
        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Cliente</div>
          {cliente.nombre && <div className="doc-row"><span className="doc-k">Nombre</span><span className="doc-v">{cliente.nombre}</span></div>}
          {cliente.empresa && <div className="doc-row"><span className="doc-k">Empresa</span><span className="doc-v">{cliente.empresa}</span></div>}
        </div>
      )}

      <div className="doc-seccion">
        <div className="doc-seccion-titulo">Visita</div>
        <div className="doc-row"><span className="doc-k">Distancia</span><span className="doc-v">{km} km · {cot.zona?.nombre}</span></div>
        <div className="doc-row"><span className="doc-k">Traslado</span><span className="doc-v">{fmtUSD.format(cot.traslado)}</span></div>
        {cot.viaticos > 0 && (
          <div className="doc-row"><span className="doc-k">Viáticos ({cot.viaticosDias} día/s)</span><span className="doc-v">{fmtUSD.format(cot.viaticos)}</span></div>
        )}
        <div className="doc-row"><span className="doc-k">Baterías a revisar</span><span className="doc-v">{cot.totalUnidades} unidad(es)</span></div>
        <div className="doc-row"><span className="doc-k">Urgencia / turno</span><span className="doc-v">{cot.urgencia === 'express' ? 'Express 48 h' : 'Normal'} · {cot.turno === 'finde' ? 'Fin de semana' : 'Horario comercial'}</span></div>
      </div>

      <div className="doc-seccion">
        <div className="doc-seccion-titulo">Detalle</div>
        <table className="doc-tabla">
          <tbody>
            {cot.detalle.map((d, i) => (
              <tr key={i}><td>{d.tipo.nombre} × {d.cantidad}</td><td className="doc-num-col">{fmtUSD.format(d.subtotal)}</td></tr>
            ))}
            {cot.detExtras.map((e, i) => (
              <tr key={`e${i}`}><td>{e.nombre} × {e.cantidad} <span style={{ color: '#777' }}>(sujeto a análisis)</span></td><td className="doc-num-col">{fmtUSD.format(e.subtotal)}</td></tr>
            ))}
            {cot.descuentoVol > 0 && (
              <tr><td>Descuento por volumen (−{Math.round(cot.descPct * 100)}%)</td><td className="doc-num-col">−{fmtUSD.format(cot.descuentoVol)}</td></tr>
            )}
            <tr><td>Subtotal</td><td className="doc-num-col">{fmtUSD.format(cot.subtotal)}</td></tr>
            {cot.recargo > 0 && <tr><td>Recargos (+{Math.round(cot.recargoPct * 100)}%)</td><td className="doc-num-col">{fmtUSD.format(cot.recargo)}</td></tr>}
            <tr><td>IVA {Math.round(config.iva * 100)}%</td><td className="doc-num-col">{fmtUSD.format(cot.iva)}</td></tr>
            <tr className="doc-total"><td>Total estimado</td><td className="doc-num-col">{fmtUSD.format(cot.total)}</td></tr>
          </tbody>
        </table>
        {cot.ars && dolar?.venta && (
          <div className="doc-row" style={{ marginTop: 6 }}>
            <span className="doc-k">Equivalente informativo</span>
            <span className="doc-v">{fmtARS.format(cot.ars)} (dólar oficial venta {fmtARS.format(dolar.venta)})</span>
          </div>
        )}
      </div>

      <div className="doc-condiciones">
        Estimación orientativa por el servicio de revisión y diagnóstico en el sitio del cliente. No incluye reparación,
        repuestos ni recambio de celdas. Los servicios adicionales quedan sujetos a análisis del comercial.
        {cot.kmExcedente > 0 && ' El traslado corresponde a una visita de larga distancia y queda sujeto a revisión.'}
        {' '}{NOTA_CAMBIO}
      </div>

      <div className="doc-pie">{CONTACTO.direccion} · Ventas {CONTACTO.telefono} · {CONTACTO.emailVentas}</div>
    </div>
  );
}

export default function Cotizador() {
  const navigate = useNavigate();
  const toastShow = useStore((s) => s.toastShow);
  const [km, setKm] = useState('');
  const [errorKm, setErrorKm] = useState('');
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [configInfo, setConfigInfo] = useState(null);
  const [renglones, setRenglones] = useState([{ tipoId: CONFIG_DEFAULT.tipos[0].id, cantidad: 1 }]);
  const [extrasSel, setExtrasSel] = useState([]);
  const [urgencia, setUrgencia] = useState('normal');
  const [turno, setTurno] = useState('comercial');
  const [cliente, setCliente] = useState({ nombre: '', empresa: '', email: '' });
  const [fechaPref, setFechaPref] = useState('');
  const [dolar, setDolar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [verDoc, setVerDoc] = useState(false);
  const [codigo, setCodigo] = useState('');
  const kmRef = useRef(null);

  // Tarifas vigentes + cotización del dólar: las resuelve la API (proxy con
  // caché y respaldo). La config la edita el admin desde el panel.
  useEffect(() => {
    let vivo = true;
    api('/public/cotizador')
      .then((d) => {
        if (!vivo) return;
        const cfg = normalizarConfig(d.config || {});
        setConfig(cfg);
        setConfigInfo({ actualizado: d.actualizado, actualizadoPor: d.actualizadoPor });
        // Si la config del panel ya no tiene el tipo elegido, se cae al primero.
        setRenglones((ls) => ls.map((x) => (cfg.tipos.some((t) => t.id === x.tipoId) ? x : { ...x, tipoId: cfg.tipos[0].id })));
      })
      .catch(() => { /* se usan las tarifas de fábrica */ });
    api('/public/dolar')
      .then((d) => { if (vivo) setDolar(d); })
      .catch(() => { if (vivo) setDolar({ disponible: false }); });
    return () => { vivo = false; };
  }, []);

  const r = useMemo(
    () => calcularVisita({ km: Number(km) || 0, renglones, extrasSel, urgencia, turno, dolar: dolar?.disponible ? dolar : null, config }),
    [km, renglones, extrasSel, urgencia, turno, dolar, config],
  );

  const tieneKm = Number(km) > 0;
  const fuera = tieneKm && r.fueraDeZona;
  const unidades = r.totalUnidades;

  const setRenglon = (i, patch) => setRenglones((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const toggleExtra = (id) => setExtrasSel((s) => (s.some((x) => x.id === id) ? s.filter((x) => x.id !== id) : [...s, { id }]));
  const setCantidadExtra = (id, cantidad) => setExtrasSel((s) => s.map((x) => (x.id === id ? { ...x, cantidad } : x)));
  const extraSel = (id) => extrasSel.find((x) => x.id === id);
  const cantidadExtra = (def) => {
    const propio = extraSel(def.id)?.cantidad;
    if (propio != null && propio !== '') return Number(propio) || 0;
    return def.porEquipo ? Math.max(1, unidades) : 1;
  };

  const limpiar = () => {
    setKm('');
    setErrorKm('');
    setRenglones([{ tipoId: config.tipos[0].id, cantidad: 1 }]);
    setExtrasSel([]);
    setUrgencia('normal');
    setTurno('comercial');
    setCliente({ nombre: '', empresa: '', email: '' });
    setFechaPref('');
    setCodigo('');
  };

  const validarKm = (valor = km) => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 'La distancia es obligatoria: ingresá los kilómetros aproximados.';
    if (n > config.maxKm) return textoFueraCobertura(config.maxKm);
    return '';
  };

  // Guarda la estimación en la API (el servidor recalcula el total) y sigue al
  // formulario con el código corto. Si falla, se conserva el envío por resumen.
  const solicitar = async () => {
    const err = validarKm();
    if (err) {
      setErrorKm(err);
      kmRef.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      const res = await api('/public/cotizacion-visita', {
        method: 'POST',
        body: {
          km: Number(km),
          renglones: renglones.map((x) => ({ tipoId: x.tipoId, cantidad: Number(x.cantidad) || 0 })),
          extrasSel: extrasSel.map((x) => ({ id: x.id, cantidad: cantidadExtra(config.extras.find((e) => e.id === x.id)) })),
          urgencia, turno, ...cliente, fecha_preferida: fechaPref, website: '',
        },
      });
      setCodigo(res.codigo);
      if (res.codigo) {
        toastShow(`Estimación ${res.codigo} guardada por ${fmtUSD.format(res.total)}`, 'ok');
        navigate(`/contacto?asunto=${encodeURIComponent('Visita técnica en planta')}&cotizacion=${encodeURIComponent(res.codigo)}`);
        return;
      }
    } catch (e) {
      toastShow(`${e.message} Podés enviarnos la consulta igual.`, 'warn');
    } finally {
      setEnviando(false);
    }
    navigate(`/contacto?asunto=${encodeURIComponent('Visita técnica en planta')}&resumen=${encodeURIComponent(r.resumen)}`);
  };

  const waLink = `https://wa.me/${CONTACTO.waVentas}?text=${encodeURIComponent(`Hola, quiero consultar por una visita técnica.\n${r.resumenCorto}`)}`;

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
              Armá un cálculo aproximado en segundos: distancia, tipos y cantidades de baterías a revisar, y servicios
              extra. Si te convence, pedinos una atención personalizada y te cotizamos por escrito.
            </p>
          </div>

          <div className="grid2" style={{ alignItems: 'start', gap: 22 }}>
            {/* Configuración */}
            <div className="card" style={{ padding: 22 }}>
              <h3 className="card-title"><Icon name="gear" size={14} /> Configurá tu visita</h3>

              <div className="field">
                <label htmlFor="km">Distancia desde nuestra planta (km) *</label>
                <div className="form-row">
                  <input
                    id="km"
                    className={`input${errorKm ? ' input-error' : ''}`}
                    type="number" min="1" max={config.maxKm} step="1" inputMode="numeric"
                    value={km} ref={kmRef}
                    aria-invalid={Boolean(errorKm)}
                    aria-describedby={errorKm ? 'km-error' : 'km-info'}
                    onChange={(e) => { setKm(e.target.value); if (validarKm(e.target.value) === '') setErrorKm(''); }}
                    onBlur={() => setErrorKm(validarKm())}
                    placeholder="Ej: 35" style={{ width: 160 }}
                  />
                  <div id="km-info" style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>
                    {tieneKm && !fuera ? (
                      <>
                        Zona: <b>{r.zona.nombre}</b> · base {fmtUSD.format(r.zona.base)}
                        <span style={{ display: 'block' }}>
                          {r.kmExcedente > 0 ? `+ ${fmtUSD.format(r.zona.kmAdicional)}/km adicional (${r.kmExcedente} km)` : 'km adicionales incluidos'}
                        </span>
                      </>
                    ) : (
                      `Ingresá los km para calcular el traslado (cobertura hasta ${config.maxKm} km).`
                    )}
                  </div>
                </div>
                {errorKm && (
                  <div id="km-error" className="banner-red" role="alert" style={{ marginBottom: 0, marginTop: 8 }}>
                    <Icon name="warn" size={14} /> {errorKm}
                  </div>
                )}
              </div>

              <div className="field">
                <label>Baterías a revisar</label>
                <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                  Ajustá tipo y cantidad reales, o quitá todas las filas para calcular solo el traslado.
                  Los extras &quot;por equipo&quot; se calculan sobre estas unidades.
                </p>
                {renglones.map((ren, i) => (
                  <div className="form-row" key={i} style={{ marginBottom: 8 }}>
                    <select
                      className="input" style={{ flex: 1 }} aria-label={`Tipo de batería ${i + 1}`}
                      value={ren.tipoId} onChange={(e) => setRenglon(i, { tipoId: e.target.value })}
                    >
                      {config.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                    <input
                      className="input" type="number" min="1" max={config.maxUnidadesPorRenglon} inputMode="numeric"
                      aria-label={`Cantidad ${i + 1}`}
                      value={ren.cantidad} onChange={(e) => setRenglon(i, { cantidad: e.target.value })}
                      style={{ width: 80 }} title="Cantidad"
                    />
                    <button
                      className="btn sm ghost" type="button" aria-label={`Quitar renglón ${i + 1}`}
                      onClick={() => setRenglones((ls) => ls.filter((_, j) => j !== i))}
                    ><Icon name="x" size={14} /></button>
                  </div>
                ))}
                <button
                  className="btn sm" type="button"
                  disabled={renglones.length >= config.maxRenglones}
                  onClick={() => setRenglones((ls) => [...ls, { tipoId: config.tipos[0].id, cantidad: 1 }])}
                >
                  <Icon name="plus" size={13} /> Agregar batería
                </button>
              </div>

              <div className="field">
                <label>Servicios adicionales</label>
                <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                  Los precios son de referencia y el comercial los revisa antes de confirmar.
                </p>
                {config.extras.map((e) => {
                  const sel = extraSel(e.id);
                  return (
                    <div key={e.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13.5 }}>
                        <input type="checkbox" checked={Boolean(sel)} onChange={() => toggleExtra(e.id)} />
                        <span style={{ flex: 1 }}>
                          {e.nombre}
                          {e.porEquipo && <span className="muted" style={{ fontSize: 11.5 }}> · por equipo</span>}
                        </span>
                        <span className="mono">{fmtUSD.format(e.precio)}</span>
                      </label>
                      {sel && (
                        <div className="row" style={{ gap: 8, marginTop: 6, paddingLeft: 24, alignItems: 'center' }}>
                          <label className="muted" style={{ fontSize: 12 }} htmlFor={`extra-${e.id}`}>
                            Cantidad {e.porEquipo ? '(equipos)' : '(servicios)'}
                          </label>
                          <input
                            id={`extra-${e.id}`} className="input" type="number" min="1" max={config.maxCantidadExtra}
                            style={{ width: 84 }} value={sel.cantidad ?? cantidadExtra(e)}
                            onChange={(ev) => setCantidadExtra(e.id, ev.target.value)}
                          />
                          <span className="muted mono" style={{ fontSize: 12.5 }}>
                            = {fmtUSD.format(e.precio * (Number(sel.cantidad) || cantidadExtra(e)))}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
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

              <div className="field">
                <label>Turno</label>
                <div className="form-row">
                  {[['comercial', 'Horario comercial'], ['finde', 'Fin de semana (+30%)']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, marginRight: 14 }}>
                      <input type="radio" name="turno" checked={turno === v} onChange={() => setTurno(v)} /> {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Datos para la estimación (opcional)</label>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input className="input" placeholder="Nombre y apellido" aria-label="Nombre" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
                  <input className="input" placeholder="Empresa" aria-label="Empresa" value={cliente.empresa} onChange={(e) => setCliente({ ...cliente, empresa: e.target.value })} />
                </div>
                <div className="form-row">
                  <input className="input" type="email" placeholder="Email" aria-label="Email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} />
                  <input className="input" type="date" aria-label="Fecha preferida de visita" title="Fecha preferida de visita" value={fechaPref} onChange={(e) => setFechaPref(e.target.value)} />
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
              ) : fuera ? (
                <div className="col">
                  <div className="banner-warn" style={{ marginBottom: 12 }}>
                    <Icon name="warn" size={15} /> {textoFueraCobertura(config.maxKm)}
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>
                    La visita a {km} km queda sujeta a análisis: cobertura, logística y cantidad de equipos.
                    Escribinos y un vendedor te contacta para evaluarla.
                  </p>
                  <a className="btn primary lg block" href={waLink} target="_blank" rel="noopener noreferrer">
                    <Icon name="mail" size={15} /> Hablar con un vendedor por WhatsApp
                  </a>
                  <Link to={`/contacto?asunto=${encodeURIComponent('Visita fuera de cobertura')}&resumen=${encodeURIComponent(`Visita a ${km} km: fuera de la cobertura de ${config.maxKm} km. Solicito análisis de viabilidad.`)}`} className="btn block mt8">
                    <Icon name="clipboard" size={15} /> Pedir análisis por formulario
                  </Link>
                </div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={td}>Traslado ({km} km · {r.zona.nombre})</td>
                        <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.traslado)}</td>
                      </tr>
                      {r.viaticos > 0 && (
                        <tr>
                          <td style={td}>Viáticos ({r.viaticosDias} día/s)</td>
                          <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.viaticos)}</td>
                        </tr>
                      )}
                      {r.revision > 0 && (
                        <tr>
                          <td style={td}>Revisión de baterías ({r.totalUnidades} unid.)</td>
                          <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.revision)}</td>
                        </tr>
                      )}
                      {r.detalle.map((d, i) => (
                        <tr key={i}>
                          <td style={{ ...td, paddingLeft: 16, color: 'var(--muted)', fontSize: 12.5 }}>— {d.tipo.nombre} × {d.cantidad}</td>
                          <td style={{ ...td, textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }} className="mono">{fmtUSD.format(d.subtotal)}</td>
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
                      {r.detExtras.map((e, i) => (
                        <tr key={`e${i}`}>
                          <td style={{ ...td, paddingLeft: 16, color: 'var(--muted)', fontSize: 12.5 }}>— {e.nombre} × {e.cantidad}</td>
                          <td style={{ ...td, textAlign: 'right', color: 'var(--muted)', fontSize: 12.5 }} className="mono">{fmtUSD.format(e.subtotal)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ ...td, borderTop: '1px solid var(--line)' }}>Subtotal</td>
                        <td style={{ ...td, textAlign: 'right', borderTop: '1px solid var(--line)' }} className="mono">{fmtUSD.format(r.subtotal)}</td>
                      </tr>
                      {r.recargo > 0 && (
                        <tr>
                          <td style={td}>Recargos (+{Math.round(r.recargoPct * 100)}%)</td>
                          <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.recargo)}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={td}>IVA ({Math.round(config.iva * 100)}%)</td>
                        <td style={{ ...td, textAlign: 'right' }} className="mono">{fmtUSD.format(r.iva)}</td>
                      </tr>
                      <tr>
                        <td style={{ ...td, paddingTop: 12, fontSize: 15, fontWeight: 800 }}>Total estimado</td>
                        <td style={{ ...td, paddingTop: 12, textAlign: 'right' }} className="mono" aria-live="polite">
                          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{fmtUSD.format(r.total)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {dolar?.disponible && r.ars && (
                    <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
                      ≈ <b>{fmtARS.format(r.ars)}</b> al dólar {dolar.casa || 'oficial'} venta {fmtARS.format(dolar.venta)}
                      {dolar.actualizado && <> · actualizado {new Date(dolar.actualizado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}
                      {dolar.vencido && ' (valor previo)'}
                      {dolar.fuente && <span className="muted"> · {dolar.fuente}</span>}
                    </p>
                  )}
                  {!dolar?.disponible && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                      Cotización del dólar no disponible en este momento: los importes son en USD.
                    </p>
                  )}

                  {r.avisos.map((a) => (
                    <div key={a.id} className="banner-info" style={{ marginTop: 10, marginBottom: 0, textAlign: 'left' }}>
                      <Icon name="info" size={15} /> {a.texto}
                    </div>
                  ))}

                  <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                    Valor estimativo orientativo, <b>solo para el servicio de revisión y diagnóstico en el sitio del cliente</b>.
                    No incluye reparación, repuestos ni recambio de celdas. La cotización final se confirma por escrito.
                    {configInfo?.actualizado && (
                      <> Tarifas vigentes al {new Date(configInfo.actualizado).toLocaleDateString('es-AR')}.</>
                    )}
                  </p>
                </>
              )}

              {!fuera && (
                <button className="btn primary lg block" disabled={enviando} onClick={solicitar}>
                  <Icon name="clipboard" size={16} /> {enviando ? 'Guardando estimación...' : 'Solicitar atención personalizada'}
                </button>
              )}
              {tieneKm && !fuera && (
                <a className="btn block mt8" href={waLink} target="_blank" rel="noopener noreferrer">
                  <Icon name="mail" size={15} /> Enviar la estimación por WhatsApp
                </a>
              )}
              {tieneKm && !fuera && (
                <button className="btn block mt8" onClick={() => setVerDoc(true)}>
                  <Icon name="clipboard" size={15} /> Ver / imprimir estimación{codigo ? ` (${codigo})` : ''}
                </button>
              )}
              <button className="btn sm ghost block center" onClick={limpiar} style={{ marginTop: 10 }}>
                <Icon name="x" size={13} /> Limpiar cotizador
              </button>

              <div className="center" style={{ marginTop: 12 }}>
                <Link to="/seguimiento" className="auth-back"><Icon name="search" size={13} /> Ver seguimiento de una orden</Link>
              </div>
            </div>
          </div>

          <div className="banner-info" style={{ textAlign: 'left', marginTop: 22 }}>
            <Icon name="info" size={15} /> El importe corresponde solo al servicio de revisión y diagnóstico en tu planta.
            No incluye reparación, repuestos ni recambio de celdas: eso se cotiza por separado según el resultado del diagnóstico.
          </div>
          <div className="banner-cambio" style={{ textAlign: 'left' }}>
            <Icon name="dollar" size={15} /> {NOTA_CAMBIO}
          </div>
        </div>
      </section>

      {verDoc && (
        <Modal title="Estimación de visita" sub={`${km} km · ${r.totalUnidades} unidad(es)${codigo ? ` · ${codigo}` : ''}`} onClose={() => setVerDoc(false)}>
          <DocumentoCotizacion cot={r} codigo={codigo} km={km} dolar={dolar || {}} cliente={cliente} config={config} />
          <button className="btn primary block mt16" onClick={() => imprimirDocumento('print-doc')}>
            <Icon name="clipboard" size={15} /> Imprimir / guardar como PDF
          </button>
        </Modal>
      )}
    </div>
  );
}
