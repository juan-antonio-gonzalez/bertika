import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/ui';
import { PasswordPair } from '../components/PasswordFields';
import { validarPassword } from '../data/passwordPolicy';
import { api } from '../store/api';

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!password || !confirm) {
      setError('Completá las dos contraseñas.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    const errorPolitica = validarPassword(password);
    if (errorPolitica) {
      setError(errorPolitica);
      return;
    }
    setEnviando(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } });
      setListo(true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="wrap page-wide">
      <div className="auth-card auth-card-wide" style={{ maxWidth: 580, margin: '44px auto' }}>
        <h2>{listo ? 'Contraseña actualizada' : 'Crear contraseña nueva'}</h2>
        {listo ? (
          <>
            <p className="auth-sub">
              La contraseña quedó guardada y cerramos las sesiones anteriores. Ya podés ingresar
              con la clave nueva.
            </p>
            <div className="banner-info" style={{ marginBottom: 16 }}>
              <Icon name="shield" size={15} />
              <span>Por seguridad, el enlace ya no se puede volver a usar.</span>
            </div>
            <Link to="/auth" className="btn primary lg block"><Icon name="check" size={15} /> Ir al login</Link>
          </>
        ) : (
          <>
            <p className="auth-sub">
              Elegí una contraseña nueva para tu cuenta. El enlace vence en 30 minutos y es de un solo uso.
            </p>
            {error && (
              <div className="banner-red" style={{ marginBottom: 16 }}>
                <div><Icon name="x" size={15} /> {error}</div>
              </div>
            )}
            <form onSubmit={submit} noValidate>
              <PasswordPair
                password={password}
                setPassword={setPassword}
                confirm={confirm}
                setConfirm={setConfirm}
                label="Contraseña nueva"
                confirmLabel="Repetir contraseña nueva"
                help="Mínimo 12 caracteres, sin datos personales ni claves comunes."
                required
              />
              <button className="btn primary lg block auth-submit" disabled={enviando} style={{ marginTop: 14 }}>
                <Icon name="check" size={16} /> {enviando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
            <div className="auth-foot">
              <Link to="/auth/recuperar" className="auth-back"><Icon name="refresh" size={13} /> Pedir un enlace nuevo</Link>
              <Link to="/auth" className="auth-back"><Icon name="logout" size={13} /> Volver al login</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
