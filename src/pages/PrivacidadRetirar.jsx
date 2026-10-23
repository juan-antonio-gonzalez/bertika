import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { api } from '../store/api';
import { LEGAL_META } from '../data/legal';

const OPCIONES = [
  'Retirar el consentimiento',
  'Acceso a mis datos',
  'Rectificación o actualización',
  'Supresión de mis datos',
  'Oposición al tratamiento',
  'Otra solicitud',
];

export default function PrivacidadRetirar() {
  const [form, setForm] = useState({ email: '', nombre: '', tipo: OPCIONES[0], motivo: '', declara: false, website: '' });
  const [idempotencyKey] = useState(() => (globalThis.crypto?.randomUUID?.() || `pr-${Date.now()}`));
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  const cambiar = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(form.email.trim())) {
      setError('Revisá el email: no parece válido.');
      return;
    }
    if (!form.declara) {
      setError('Marcá la declaración para poder continuar.');
      return;
    }
    setEnviando(true);
    try {
      await api('/privacidad/solicitud', {
        method: 'POST',
        body: {
          email: form.email.trim(),
          nombre: form.nombre,
          tipo: form.tipo,
          motivo: form.motivo,
          declara: true,
          website: form.website,
          idempotencyKey,
        },
      });
      setListo(true);
    } catch (err) {
      setError(err.message || 'No se pudo registrar la solicitud. Probá de nuevo o escribinos por email.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="legal-page">
      <div className="legal-hero">
        <div className="wrap">
          <p className="legal-kicker">Tus datos</p>
          <h1>Retirar el consentimiento o ejercer tus derechos</h1>
          <p className="legal-meta">
            Podés pedir el retiro del consentimiento, el acceso a tus datos, su rectificación o su supresión.
            Verificamos la identidad antes de actuar y respondemos en los plazos legales.
          </p>
        </div>
      </div>

      <div className="wrap legal-body">
        <div className="legal-prose">
          {listo ? (
            <div className="legal-ok">
              <h2><Icon name="check" size={18} /> Solicitud registrada</h2>
              <p>
                Guardamos tu pedido con fecha y email. Te vamos a contactar a <strong>{form.email}</strong> para verificar
                la identidad y continuar. Si no recibís respuesta en unos días, escribinos a{' '}
                <a href={`mailto:${LEGAL_META.emailPrivacidad}`}>{LEGAL_META.emailPrivacidad}</a>.
              </p>
              <p className="muted">
                El retiro no afecta la licitud del tratamiento anterior ni los datos que debamos conservar por una obligación legal.
              </p>
              <Link to="/legal/privacidad" className="btn">Volver a la política</Link>
            </div>
          ) : (
            <>
              <p>
                Usá el mismo email que figura en tu consulta. Si no lo recordás, escribinos a{' '}
                <a href={`mailto:${LEGAL_META.emailPrivacidad}`}>{LEGAL_META.emailPrivacidad}</a> y lo buscamos con vos.
              </p>
              <form onSubmit={enviar} noValidate>
                <div className="field">
                  <label htmlFor="pr-email">Tu email *</label>
                  <input
                    id="pr-email" className="input" type="email" autoComplete="email" required
                    value={form.email} onChange={(e) => cambiar('email', e.target.value)} placeholder="tu@email.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pr-nombre">Tu nombre</label>
                  <input
                    id="pr-nombre" className="input" type="text" autoComplete="name"
                    value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Tu nombre"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pr-tipo">¿Qué querés solicitar?</label>
                  <select id="pr-tipo" className="input" value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
                    {OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pr-motivo">Contanos brevemente</label>
                  <textarea
                    id="pr-motivo" className="input" rows={4} maxLength={500}
                    value={form.motivo} onChange={(e) => cambiar('motivo', e.target.value)}
                    placeholder="Detalle opcional de tu solicitud"
                  />
                </div>
                <input
                  type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
                  value={form.website} onChange={(e) => cambiar('website', e.target.value)}
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />
                <label className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13.5, margin: '10px 0' }}>
                  <input
                    type="checkbox" checked={form.declara}
                    onChange={(e) => cambiar('declara', e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>Declaro que soy el titular de los datos o que actúo en su nombre, y que la información es correcta.</span>
                </label>
                {error && <div className="alerta" style={{ marginBottom: 10 }}>{error}</div>}
                <button className="btn primary" type="submit" disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Enviar solicitud'}
                </button>
              </form>
            </>
          )}
        </div>
        <aside className="legal-aside">
          <h2>Qué pasa después</h2>
          <ol className="legal-pasos">
            <li>Registramos la solicitud con fecha, email y motivo.</li>
            <li>Verificamos que quien pide sea el titular o esté autorizado.</li>
            <li>Respondemos y, si corresponde, exportamos, corregimos o suprimimos los datos.</li>
            <li>Dejamos constancia del cierre, sin conservar más de lo necesario.</li>
          </ol>
          <p className="muted" style={{ fontSize: 12 }}>
            Más detalle en la <Link to="/legal/privacidad">Política de privacidad</Link>.
          </p>
          <Link to="/legal/privacidad" className="legal-volver">← Volver a privacidad</Link>
        </aside>
      </div>
    </div>
  );
}
