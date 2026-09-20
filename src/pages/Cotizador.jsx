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
        <div className="doc-row"><span className="doc-k">Modalidad</span><span className="doc-v">{cot.modo === 'taller' ? 'Revisión en nuestro taller (sin traslado)' : 'Visita técnica en el sitio del cliente'}</span></div>
        {cot.modo !== 'taller' && (
          <div className="doc-row"><span className="doc-k">Distancia</span><span className="doc-v">{km} km · {cot.zona?.nombre}</span></div>
        )}
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
  const [modo, setModo] = useState('sitio');
  const [km, setKm] = useState(60);
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

  // Sesión anónima + eventos del embudo (abre / interactúa / solicita / ...).
  // Sin datos personales: solo números de la estimación.
  const sesion = useRef(null);
  if (sesion.current === null) {
    try {
      const k = 'bertika-cotizador-sesion';
      let v = sessionStorage.getItem(k);
      if (!v) {
        v = (globalThis.crypto?.randomUUID?.() || `s${Date.now()}${Math.random().toString(16).slice(2)}`).slice(0, 36);
        sessionStorage.setItem(k, v);
      }
      sesion.current = v;
    } catch {
      sesion.current = 'anon';
    }
  }
  const yaAviso = useRef({ abre: false, interactua: false });
  const medir = (tipo, extra = {}) => {
    api('/public/cotizador-evento', { method: 'POST', body: { tipo, sesion: sesion.current, modo, ...extra } }).catch(() => {});
  };

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
        setRenglones((ls) => ls.map((x) => (cfg.tipos.some((t) => t.id === x.tipoId) ? x : { ...x, tipoId: cfg.tipos[0].id })));
        setExtrasSel((xs) => xs.filter((x) => cfg.extras.some((e) => e.id === x.id)));
      })
      .catch(() => { /* se usan las tarifas de fábrica */ });
    api('/public/dolar')
      .then((d) => { if (vivo) setDolar(d); })
      .catch(() => { if (vivo) setDolar({ disponible: false }); });
    return () => { vivo = false; };
  }, []);

  const r = useMemo(
    () => calcularVisita({
      km: modo === 'taller' ? 0 : Number(km) || 0,
      renglones, extrasSel, urgencia, turno, modo,
      dolar: dolar?.disponible ? dolar : null, config,
    }),
    [km, modo, renglones, extrasSel, urgencia, turno, dolar, config],
  );

  const esTaller = r.modo === 'taller';
  const listo = esTaller || Number(km) > 0;
  const fuera = !esTaller && Number(km) > 0 && r.fueraDeZona;
  const unidades = r.totalUnidades;

  // Embudo: primera visita y primera interacción real (una sola vez por sesión).
  useEffect(() => {
    if (yaAviso.current.abre) return;
    yaAviso.current.abre = true;
    medir('abre');
  }, []);
  useEffect(() => {
    if (yaAviso.current.interactua) return;
    yaAviso.current.interactua = true;
    medir('interactua', { km: modo === 'taller' ? 0 : Number(km) || 0, total: r.total ?? undefined });
  }, [km, modo, renglones, extrasSel, urgencia, turno]);

  const setRenglon = (i, patch) => setRenglones((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const cantRenglon = (i, delta) => setRenglones((ls) => ls.map((x, j) => (j === i
    ? { ...x, cantidad: Math.min(config.maxUnidadesPorRenglon, Math.max(1, (Number(x.cantidad) || 1) + delta)) }
    : x)));
  const toggleExtra = (id) => setExtrasSel((s) => (s.some((x) => x.id === id) ? s.filter((x) => x.id !== id) : [...s, { id }]));
  const setCantidadExtra = (id, cantidad) => setExtrasSel((s) => s.map((x) => (x.id === id ? { ...x, cantidad } : x)));
  const extraSel = (id) => extrasSel.find((x) => x.id === id);
  const cantidadExtra = (def) => {
    const propio = extraSel(def.id)?.cantidad;
    if (propio != null && propio !== '') return Number(propio) || 0;
    return def.porEquipo ? Math.max(1, unidades) : 1;
  };

  const validarKm = (valor = km) => {
    if (esTaller) return '';
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 'Ingresá la distancia aproximada para poder estimar.';
    if (n > config.maxKm) return textoFueraCobertura(config.maxKm);
    return '';
  };

  const limpiar = () => {
    setModo('sitio');
    setKm(60);
    setErrorKm('');
    setRenglones([{ tipoId: config.tipos[0].id, cantidad: 1 }]);
    setExtrasSel([]);
    setUrgencia('normal');
    setTurno('comercial');
    setCliente({ nombre: '', empresa: '', email: '' });
    setFechaPref('');
    setCodigo('');
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
          km: esTaller ? 0 : Number(km),
          modo,
          renglones: renglones.map((x) => ({ tipoId: x.tipoId, cantidad: Number(x.cantidad) || 0 })),
          extrasSel: extrasSel.map((x) => ({ id: x.id, cantidad: cantidadExtra(config.extras.find((e) => e.id === x.id)) })),
          urgencia, turno, ...cliente, fecha_preferida: fechaPref, website: '',
        },
      });
      setCodigo(res.codigo);
      if (res.codigo) {
        medir('solicita', { km: esTaller ? 0 : Number(km), total: res.total, codigo: res.codigo });
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

  const waLink = `https://wa.me/${CONTACTO.waVentas}?text=${encodeURIComponent(`Hola, quiero consultar por ${esTaller ? 'la revisión de una batería en el taller' : 'una visita técnica'}.\n${r.resumenCorto}`)}`;

  return (
    <div className="cz">
      <header className="cz-top">
        <Link to="/" className="cz-brand">
          <span className="logo"><Icon name="bolt" size={16} /></span>
          BERTIKA<sup style={{ fontSize: 9 }}>®</sup>
        </Link>
        <span className="cz-top-title">Cotizador de visita técnica</span>
        <div className="cz-top-right">
          <span className={`cz-dolar${dolar?.disponible ? '' : ' off'}`} title={dolar?.actualizado ? `Actualizado ${new Date(dolar.actualizado).toLocaleString('es-AR')} · ${dolar.fuente}` : 'Sin datos del dólar'}>
            <span className="dot" />
            {dolar?.disponible ? `Dólar oficial ${fmtARS.format(dolar.venta)}` : 'Dólar no disponible'}
          </span>
          <Link to="/" className="btn sm ghost"><Icon name="home" size={13} /> Volver al sitio</Link>
        </div>
      </header>

      <div className="cz-body">
        {/* ---------- Configuración ---------- */}
        <div className="cz-col">
          {config.modoTaller.habilitado && (
            <section className="cz-card">
              <div className="cz-card-title"><Icon name="tools" size={13} /> ¿Cómo nos ocupamos de la batería?</div>
              <div className="cz-seg" role="group" aria-label="Modalidad" style={{ width: '100%' }}>
                <button
                  type="button" className={modo === 'sitio' ? 'on' : ''} style={{ flex: 1 }}
                  onClick={() => { setModo('sitio'); medir('modo', { modo: 'sitio' }); }}
                >
                  Vamos a tu planta
                </button>
                <button
                  type="button" className={modo === 'taller' ? 'on' : ''} style={{ flex: 1 }}
                  onClick={() => { setModo('taller'); setErrorKm(''); medir('modo', { modo: 'taller' }); }}
                >
                  La llevo al taller (−{Math.round(config.modoTaller.descuentoRevisionPct * 100)}%)
                </button>
              </div>
              <p className="cz-help" style={{ marginTop: 8 }}>
                {esTaller
                  ? 'Traés la batería a nuestra planta: sin traslado ni viáticos, con bonificación sobre la revisión.'
                  : 'Visitamos tu planta: el precio incluye traslado por distancia y viáticos si la visita es larga.'}
              </p>
            </section>
          )}

          {!esTaller && (
          <section className="cz-card">
            <div className="cz-card-title"><span className="num">1</span> Distancia desde nuestra planta</div>
            <div className="cz-km">
              <input
                type="range" min="0" max={config.maxKm} step="5" value={Number(km) || 0}
                aria-label="Distancia en kilómetros"
                onChange={(e) => { setKm(e.target.value); setErrorKm(validarKm(e.target.value)); }}
              />
              <div className="cz-stepper">
                <button type="button" aria-label="Restar 5 km" onClick={() => { const v = Math.max(0, (Number(km) || 0) - 5); setKm(v); setErrorKm(validarKm(v)); }}>−</button>
                <input
                  ref={kmRef} className="input" type="number" min="1" max={config.maxKm} inputMode="numeric"
                  aria-label="Kilómetros" aria-invalid={Boolean(errorKm)} value={km}
                  onChange={(e) => { setKm(e.target.value); setErrorKm(validarKm(e.target.value)); }}
                  onBlur={() => setErrorKm(validarKm())}
                />
                <button type="button" aria-label="Sumar 5 km" onClick={() => { const v = Math.min(config.maxKm, (Number(km) || 0) + 5); setKm(v); setErrorKm(validarKm(v)); }}>+</button>
              </div>
            </div>
            <div className="cz-zone">
              {Number(km) > 0 && !fuera ? (
                <>
                  <span>
                    Zona <b>{r.zona.nombre}</b> · base {fmtUSD.format(r.zona.base)}
                    {r.kmExcedente > 0 && <> + {fmtUSD.format(r.zona.kmAdicional)}/km desde {r.zona.cubreKm} km</>}
                  </span>
                  <span className="cz-badge amber">traslado {fmtUSD.format(r.traslado)}</span>
                </>
              ) : (
                <span>Cobertura hasta {config.maxKm} km. Movés el control y ves el precio al instante.</span>
              )}
            </div>
            {errorKm && (
              <div className="cz-alert danger" role="alert" style={{ marginTop: 10 }}>
                <Icon name="warn" size={14} /> <span>{errorKm}</span>
              </div>
            )}
          </section>
          )}

          <section className="cz-card">
            <div className="cz-card-title">
              <span className="num">2</span> Baterías a revisar
              <span className="right cz-badge">{unidades} unidad{unidades === 1 ? '' : 'es'}</span>
            </div>
            {renglones.map((ren, i) => (
              <div className="cz-row" key={i}>
                <select
                  className="input" style={{ flex: 1, minWidth: 0 }} aria-label={`Tipo de batería ${i + 1}`}
                  value={ren.tipoId} onChange={(e) => setRenglon(i, { tipoId: e.target.value })}
                >
                  {config.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {fmtUSD.format(t.precioUnidad)}</option>)}
                </select>
                <div className="cz-stepper">
                  <button type="button" aria-label="Restar una unidad" onClick={() => cantRenglon(i, -1)}>−</button>
                  <input
                    className="input" type="number" min="1" max={config.maxUnidadesPorRenglon} aria-label={`Cantidad ${i + 1}`}
                    value={ren.cantidad} onChange={(e) => setRenglon(i, { cantidad: e.target.value })}
                  />
                  <button type="button" aria-label="Sumar una unidad" onClick={() => cantRenglon(i, 1)}>+</button>
                </div>
                <button
                  className="btn icon sm ghost" type="button" aria-label={`Quitar renglón ${i + 1}`}
                  onClick={() => setRenglones((ls) => ls.filter((_, j) => j !== i))}
                ><Icon name="x" size={13} /></button>
              </div>
            ))}
            <div className="row between" style={{ marginTop: 10, gap: 10 }}>
              <button
                className="btn sm" type="button" disabled={renglones.length >= config.maxRenglones}
                onClick={() => setRenglones((ls) => [...ls, { tipoId: config.tipos[0].id, cantidad: 1 }])}
              >
                <Icon name="plus" size={13} /> Agregar tipo
              </button>
              {r.descuentoVol > 0 && <span className="cz-badge green">descuento por volumen −{Math.round(r.descPct * 100)}%</span>}
            </div>
          </section>

          <section className="cz-card">
            <div className="cz-card-title">
              <span className="num">3</span> Servicios adicionales
              <span className="right cz-badge">sujetos a análisis comercial</span>
            </div>
            <div className="cz-chips">
              {config.extras.map((e) => {
                const sel = extraSel(e.id);
                return (
                  <div key={e.id} className={`cz-chip${sel ? ' on' : ''}`}>
                    <button type="button" className="cz-chip-main" onClick={() => toggleExtra(e.id)} aria-pressed={Boolean(sel)}>
                      <span className="tick"><Icon name="check" size={10} /></span>
                      <span className="nm" title={e.nombre}>{e.nombre}</span>
                      {!sel && <span className="price">{fmtUSD.format(e.precio)}{e.porEquipo ? ' ×eq' : ''}</span>}
                    </button>
                    {sel && (
                      <div className="cz-stepper sm">
                        <button type="button" aria-label="Restar" onClick={() => setCantidadExtra(e.id, Math.max(1, cantidadExtra(e) - 1))}>−</button>
                        <input
                          className="input" type="number" min="1" max={config.maxCantidadExtra} aria-label={`Cantidad de ${e.nombre}`}
                          value={cantidadExtra(e)} onChange={(ev) => setCantidadExtra(e.id, ev.target.value)}
                        />
                        <button type="button" aria-label="Sumar" onClick={() => setCantidadExtra(e.id, Math.min(config.maxCantidadExtra, cantidadExtra(e) + 1))}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="cz-card">
            <div className="cz-card-title"><span className="num">4</span> Urgencia y turno</div>
            <div className="row wrap between" style={{ gap: 10 }}>
              <div className="cz-seg" role="group" aria-label="Urgencia">
                <button type="button" className={urgencia === 'normal' ? 'on' : ''} onClick={() => setUrgencia('normal')}>Normal</button>
                <button type="button" className={urgencia === 'express' ? 'on' : ''} onClick={() => setUrgencia('express')}>Express 48 h +{Math.round(config.urgencia.express * 100)}%</button>
              </div>
              <div className="cz-seg" role="group" aria-label="Turno">
                <button type="button" className={turno === 'comercial' ? 'on' : ''} onClick={() => setTurno('comercial')}>Horario comercial</button>
                <button type="button" className={turno === 'finde' ? 'on' : ''} onClick={() => setTurno('finde')}>Fin de semana +{Math.round(config.turno.finde * 100)}%</button>
              </div>
            </div>
          </section>

          <details className="cz-card">
            <summary className="cz-summary">5 · Datos para la estimación (opcional)</summary>
            <div className="cz-two" style={{ marginTop: 10 }}>
              <div className="cz-field"><label htmlFor="cz-nombre">Nombre</label><input id="cz-nombre" className="input" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Tu nombre" /></div>
              <div className="cz-field"><label htmlFor="cz-empresa">Empresa</label><input id="cz-empresa" className="input" value={cliente.empresa} onChange={(e) => setCliente({ ...cliente, empresa: e.target.value })} placeholder="Empresa / planta" /></div>
              <div className="cz-field"><label htmlFor="cz-email">Email</label><input id="cz-email" className="input" type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} placeholder="tu@email.com" /></div>
              <div className="cz-field"><label htmlFor="cz-fecha">Fecha preferida</label><input id="cz-fecha" className="input" type="date" value={fechaPref} onChange={(e) => setFechaPref(e.target.value)} /></div>
            </div>
          </details>
        </div>

        {/* ---------- Resultado ---------- */}
        <div className="cz-col">
          <section className="cz-card" style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
            <div className="cz-card-title">
              <Icon name="calculator" size={13} /> Estimación en vivo
              <span className="right cz-badge">{config.moneda}</span>
            </div>

            {!listo ? (
              <div className="cz-empty">Movés el control de distancia y acá aparece el precio.</div>
            ) : fuera ? (
              <>
                <div className="cz-alert warn"><Icon name="warn" size={15} /> <span>{textoFueraCobertura(config.maxKm)}</span></div>
                <div className="cz-cta">
                  <a className="btn primary lg block" href={waLink} target="_blank" rel="noopener noreferrer"><Icon name="mail" size={15} /> Hablar con un vendedor</a>
                  <Link to={`/contacto?asunto=${encodeURIComponent('Visita fuera de cobertura')}&resumen=${encodeURIComponent(`Visita a ${km} km: fuera de la cobertura de ${config.maxKm} km. Solicito análisis de viabilidad.`)}`} className="btn block">
                    <Icon name="clipboard" size={15} /> Pedir análisis por formulario
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="cz-lines">
                  {esTaller ? (
                    <div className="cz-line">
                      <span className="k">Revisión en nuestro taller (sin traslado){r.descuentoTaller > 0 ? ` · −${Math.round(config.modoTaller.descuentoRevisionPct * 100)}%` : ''}</span>
                      <span className="v">{r.descuentoTaller > 0 ? `−${fmtUSD.format(r.descuentoTaller)}` : fmtUSD.format(0)}</span>
                    </div>
                  ) : (
                    <div className="cz-line">
                      <span className="k">Traslado · {km} km ({r.zona.nombre})</span>
                      <span className="v">{fmtUSD.format(r.traslado)}</span>
                    </div>
                  )}
                  {r.viaticos > 0 && (
                    <div className="cz-line">
                      <span className="k">Viáticos · {r.viaticosDias} día/s</span>
                      <span className="v">{fmtUSD.format(r.viaticos)}</span>
                    </div>
                  )}
                  {r.revision > 0 && (
                    <div className="cz-line">
                      <span className="k">Revisión · {r.totalUnidades} unidad/es</span>
                      <span className="v">{fmtUSD.format(r.revision)}</span>
                    </div>
                  )}
                  {r.descuentoVol > 0 && (
                    <div className="cz-line">
                      <span className="k">Descuento por volumen (−{Math.round(r.descPct * 100)}%)</span>
                      <span className="v" style={{ color: 'var(--green)' }}>−{fmtUSD.format(r.descuentoVol)}</span>
                    </div>
                  )}
                  {r.extras > 0 && (
                    <div className="cz-line">
                      <span className="k">Servicios adicionales ({r.detExtras.length})</span>
                      <span className="v">{fmtUSD.format(r.extras)}</span>
                    </div>
                  )}
                  {r.recargo > 0 && (
                    <div className="cz-line">
                      <span className="k">Recargos (+{Math.round(r.recargoPct * 100)}%)</span>
                      <span className="v">{fmtUSD.format(r.recargo)}</span>
                    </div>
                  )}
                  <div className="cz-line">
                    <span className="k">Subtotal</span>
                    <span className="v">{fmtUSD.format(r.subtotal)}</span>
                  </div>
                  <div className="cz-line">
                    <span className="k">IVA {Math.round(config.iva * 100)}%</span>
                    <span className="v">{fmtUSD.format(r.iva)}</span>
                  </div>
                </div>

                <div className="cz-total" aria-live="polite">
                  <div className="lbl">Total estimado</div>
                  <div className="amt">{fmtUSD.format(r.total)}</div>
                  {dolar?.disponible && r.ars && (
                    <div className="ars">
                      ≈ {fmtARS.format(r.ars)} al dólar oficial venta {fmtARS.format(dolar.venta)}
                      {dolar.vencido ? ' (valor previo)' : ''}
                    </div>
                  )}
                  {!dolar?.disponible && <div className="ars">Cotización del dólar no disponible: importes en USD.</div>}
                </div>

                {r.avisos.filter((a) => a.id !== 'fuera_cobertura').map((a) => (
                  <div key={a.id} className="cz-alert info" style={{ marginTop: 10 }}>
                    <Icon name="info" size={14} /> <span>{a.texto}</span>
                  </div>
                ))}

                <div className="cz-cta">
                  <button className="btn primary lg block" disabled={enviando} onClick={solicitar}>
                    <Icon name="clipboard" size={16} /> {enviando ? 'Guardando estimación...' : 'Solicitar atención personalizada'}
                  </button>
                  <div className="cz-two">
                    <a className="btn block" href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => medir('whatsapp', { km: esTaller ? 0 : Number(km), total: r.total ?? undefined })}><Icon name="mail" size={14} /> Por WhatsApp</a>
                    <button className="btn block" onClick={() => { setVerDoc(true); medir('imprime', { km: esTaller ? 0 : Number(km), total: r.total ?? undefined }); }}><Icon name="eye" size={14} /> Ver / imprimir</button>
                  </div>
                  <button className="btn sm ghost block center" onClick={limpiar}><Icon name="refresh" size={13} /> Empezar de nuevo</button>
                </div>

                <p className="cz-note">
                  Estimación orientativa por revisión y diagnóstico en tu planta (no incluye reparación, repuestos ni celdas).
                  Se confirma por escrito{codigo ? ` · ${codigo}` : ''}.
                  {configInfo?.actualizado && <> Tarifas vigentes al {new Date(configInfo.actualizado).toLocaleDateString('es-AR')}.</>}
                </p>
              </>
            )}
          </section>

          <details className="cz-card" style={{ flex: '0 0 auto' }}>
            <summary className="cz-summary">Cómo se arma el precio</summary>
            <div className="cz-lines" style={{ marginTop: 10 }}>
              <div className="cz-line"><span className="k">Franjas de traslado</span><span className="v">{config.zonas.map((z) => `${z.hastaKm} km`).join(' · ')}</span></div>
              <div className="cz-line"><span className="k">Base de la última franja</span><span className="v">{fmtUSD.format(config.zonas.at(-1)?.base || 0)} hasta {config.zonas.at(-1)?.cubreKm} km</span></div>
              <div className="cz-line"><span className="k">Km adicional</span><span className="v">{fmtUSD.format(config.zonas.at(-1)?.kmAdicional || 0)} por km</span></div>
              <div className="cz-line"><span className="k">Viáticos</span><span className="v">{config.viaticos.porDia > 0 ? `${fmtUSD.format(config.viaticos.porDia)} por día desde ${config.viaticos.desdeKm} km` : 'no se aplican'}</span></div>
              <div className="cz-line"><span className="k">Descuento por volumen</span><span className="v">{config.descuentos.map((d) => `${d.desde}+ → ${Math.round(d.pct * 100)}%`).join(' · ') || '—'}</span></div>
              <div className="cz-line"><span className="k">Cobertura máxima</span><span className="v">{config.maxKm} km</span></div>
            </div>
            <p className="cz-note">{NOTA_CAMBIO}</p>
          </details>
        </div>
      </div>

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
