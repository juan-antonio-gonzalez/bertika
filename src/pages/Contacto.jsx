import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/ui';
import { useStore } from '../store/store';
import { api } from '../store/api';
import { CONTACTO } from '../data/siteData';

const IcoMarker = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IcoPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export default function Contacto() {
  const toastShow = useStore((s) => s.toastShow);
  const formRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [enviando, setEnviando] = useState(false);
  const [entregado, setEntregado] = useState(null);
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '', asunto: '', serie: '', mensaje: '', website: '' });

  useEffect(() => {
    const asunto = searchParams.get('asunto');
    const resumen = searchParams.get('resumen');
    if (asunto || resumen) {
      setForm((f) => ({
        ...f,
        asunto: asunto || f.asunto,
        mensaje: resumen ? `${f.mensaje ? `${f.mensaje}\n\n` : ''}${resumen}` : f.mensaje,
      }));
    }
  }, [searchParams]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const esReparacion = form.asunto === 'Servicio de reparación';

  const limpiar = () => {
    setForm({ nombre: '', empresa: '', email: '', telefono: '', asunto: '', serie: '', mensaje: '', website: '' });
    formRef.current?.reset();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.email || !form.mensaje) {
      toastShow('Completá nombre, email y mensaje', 'warn');
      return;
    }
    if (esReparacion && !form.serie.trim()) {
      toastShow('Ingresá el número de serie de la batería a reparar', 'warn');
      return;
    }
    setEnviando(true);
    try {
      const res = await api('/public/contacto', {
        method: 'POST',
        body: {
          nombre: form.nombre, empresa: form.empresa, email: form.email,
          telefono: form.telefono, asunto: form.asunto,
          serie: form.serie.trim(), mensaje: form.mensaje, website: form.website,
        },
      });
      if (esReparacion && res?.codigo) setEntregado(res.codigo);
      toastShow(
        esReparacion
          ? `Orden de servicio creada. Tu código de seguimiento: ${res?.codigo || ''}`
          : 'Mensaje enviado. Te contactaremos a la brevedad.',
        'ok',
      );
      limpiar();
    } catch (err) {
      toastShow(err.message || 'No se pudo enviar el mensaje', 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="wrap page-wide">
      <div className="auth-wrap">
        <div className="auth-brand">
          <div>
            <div className="auth-logo">
              <span className="auth-logo-box"><Icon name="bolt" size={22} /></span>
              <span>BERTIKA<sup style={{ fontSize: 10 }}>®</sup></span>
            </div>
            <div className="auth-tag">Acumuladores Industriales</div>
          </div>

          <div className="auth-mid">
            <h2>Estamos para ayudarte</h2>
            <p className="auth-brand-lead">
              Consultas sobre baterías, servicios, presupuestos, soporte técnico o reciclaje.
              Respondemos dentro de las 24 horas hábiles.
            </p>
            <ul className="auth-contact">
              <li>
                <span className="fi"><IcoMarker /></span>
                <span><span className="lbl">Ubicación</span>{CONTACTO.direccion}</span>
              </li>
              <li>
                <span className="fi"><IcoPhone /></span>
                <span><span className="lbl">Ventas (tel/WhatsApp)</span><a href={CONTACTO.telHref} target="_blank" rel="noopener noreferrer">{CONTACTO.telefono}</a></span>
              </li>
              <li>
                <span className="fi"><IcoPhone /></span>
                <span><span className="lbl">Soporte técnico (tel/WhatsApp)</span><a href={CONTACTO.telHrefSoporte} target="_blank" rel="noopener noreferrer">{CONTACTO.telefonoSoporte}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="mail" size={13} /></span>
                <span><span className="lbl">Ventas y consultas</span><a href={`mailto:${CONTACTO.emailVentas}`}>{CONTACTO.emailVentas}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="tools" size={13} /></span>
                <span><span className="lbl">Soporte técnico</span><a href={`mailto:${CONTACTO.emailSoporte}`}>{CONTACTO.emailSoporte}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="clipboard" size={13} /></span>
                <span><span className="lbl">Cobranzas</span><a href={`mailto:${CONTACTO.emailCobranzas}`}>{CONTACTO.emailCobranzas}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="clock" size={13} /></span>
                <span><span className="lbl">Horarios</span>Lun a Vie 8:00–17:00 · Sáb 9:00–13:00</span>
              </li>
            </ul>
          </div>

          <div className="auth-amsa">Representante oficial de <b>AMSA Forbat</b></div>
        </div>

        <div className="auth-form-side">
          <div className="auth-card auth-card-wide">
            <h2>Escribinos</h2>
            <p className="auth-sub">
              Completá el formulario y te contactamos a la brevedad. Si consultás por una reparación,
              ingresá el número de serie y recibirás tu código de seguimiento de 16 dígitos.
            </p>

            {entregado && (
              <div className="banner-green" style={{ marginBottom: 16 }}>
                <div><Icon name="check" size={15} /> Tu código de seguimiento (único e irrepetible):</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '1.5px', margin: '6px 0 4px' }}>{entregado}</div>
                <Link to={`/tracker/${entregado.replace(/-/g, '')}`} className="auth-back">
                  <Icon name="search" size={13} /> Ver seguimiento en tiempo real
                </Link>
              </div>
            )}

            <form ref={formRef} onSubmit={onSubmit}>
              <div className="form-row">
                <div className="field">
                  <label>Nombre *</label>
                  <input className="input" name="nombre" value={form.nombre} onChange={onChange} placeholder="Tu nombre" />
                </div>
                <div className="field">
                  <label>Empresa</label>
                  <input className="input" name="empresa" value={form.empresa} onChange={onChange} placeholder="Empresa / taller" />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Email *</label>
                  <input className="input" type="email" name="email" value={form.email} onChange={onChange} placeholder="tu@email.com" />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input className="input" name="telefono" value={form.telefono} onChange={onChange} placeholder="Teléfono" />
                </div>
              </div>
              <div className="field">
                <label>Asunto</label>
                <select className="input" name="asunto" value={form.asunto} onChange={onChange}>
                  <option value="">Seleccioná un asunto...</option>
                  <option>Compra de batería</option>
                  <option>Servicio de reparación</option>
                  <option>Visita técnica en planta</option>
                  <option>Presupuesto / cotización</option>
                  <option>Soporte técnico</option>
                  <option>Recolección y reciclaje</option>
                  <option>Cobranzas</option>
                  <option>Otro</option>
                </select>
              </div>
              {esReparacion && (
                <div className="field">
                  <label>Número de serie de la batería *</label>
                  <input className="input" name="serie" value={form.serie} onChange={onChange} placeholder="Ej: BAT-TRC-001" />
                  <small className="muted">Al enviar te daremos tu código de 16 dígitos para el seguimiento.</small>
                </div>
              )}
              <div className="field">
                <label>Mensaje *</label>
                <textarea className="input" name="mensaje" value={form.mensaje} onChange={onChange} placeholder="Contanos qué necesitás..." />
              </div>
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={onChange}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />
              <button className="btn primary lg block auth-submit" disabled={enviando}>
                <Icon name="check" size={16} /> {enviando ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </form>

            <div className="auth-foot">
              <Link to="/" className="auth-back"><Icon name="home" size={13} /> Volver al sitio</Link>
              <Link to="/seguimiento" className="auth-back"><Icon name="search" size={13} /> Hacer seguimiento</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
