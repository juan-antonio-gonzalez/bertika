import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { api } from '../store/api';

export default function RecuperarPassword() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Ingresá el email de tu cuenta.');
      return;
    }
    setEnviando(true);
    try {
      // La API responde siempre ok para no revelar si el email existe.
      await api('/auth/recuperar', { method: 'POST', body: { email: email.trim() } });
      setListo(true);
    } catch (err) {
      setError(err.message || 'No se pudo procesar la solicitud. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="wrap page-wide">
      <div className="auth-card auth-card-wide" style={{ maxWidth: 560, margin: '44px auto' }}>
        <h2>Recuperar contraseña</h2>
        {listo ? (
          <>
            <p className="auth-sub">
              Si <b>{email.trim()}</b> corresponde a una cuenta activa, te enviamos un enlace
              para crear una contraseña nueva. Revisá también la carpeta de spam.
            </p>
            <div className="banner-info" style={{ marginBottom: 16 }}>
              <Icon name="mail" size={15} />
              <span>El enlace vence en 30 minutos y sirve una sola vez.</span>
            </div>
            <Link to="/auth" className="btn primary lg block"><Icon name="logout" size={15} /> Volver al login</Link>
          </>
        ) : (
          <>
            <p className="auth-sub">
              Poné el email de tu cuenta. Te vamos a enviar un enlace de un solo uso para
              definir una contraseña nueva. No te vamos a enviar la contraseña por correo.
            </p>
            {error && (
              <div className="banner-red" style={{ marginBottom: 16 }}>
                <div><Icon name="x" size={15} /> {error}</div>
              </div>
            )}
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label>Email *</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  disabled={enviando}
                  autoFocus
                />
              </div>
              <button className="btn primary lg block auth-submit" disabled={enviando}>
                <Icon name="mail" size={16} /> {enviando ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </form>
            <div className="auth-foot">
              <Link to="/auth" className="auth-back"><Icon name="logout" size={13} /> Volver al login</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
