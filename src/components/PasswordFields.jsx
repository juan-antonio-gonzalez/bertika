import { useState } from 'react';
import { Icon } from './ui';
import {
  PASSWORD_MIN, validarPassword, fortalezaPassword, generarPasswordSegura,
} from '../data/passwordPolicy';

export function PasswordInput({
  label, value, onChange, placeholder, autoComplete, help, required = false,
  disabled = false, error = false, inputProps = {},
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="field">
      <label>{label}{required ? ' *' : ''}</label>
      <div className="pass-wrap">
        <input
          className={`input${error ? ' input-error' : ''}`}
          type={ver ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          {...inputProps}
        />
        <button
          type="button"
          className="pass-eye"
          onClick={() => setVer((v) => !v)}
          title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          disabled={disabled}
        >
          <Icon name={ver ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
      {help && <small className="ayuda">{help}</small>}
    </div>
  );
}

export function PasswordStrength({ password, email = '', nombre = '' }) {
  if (!password) return null;
  const f = fortalezaPassword(password, { email, nombre });
  return (
    <div className="pass-strength">
      <div className="pass-bar" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ background: i < f.score + 1 ? f.color : 'var(--line)' }} />
        ))}
      </div>
      <span className="pass-label" style={{ color: f.color }}>{f.label}</span>
    </div>
  );
}

// Dos campos con ojo + confirmación + medidor + generador. La validación real
// la hace la API; esto es para que el usuario vea el problema antes de guardar.
export function PasswordPair({
  password, setPassword, confirm, setConfirm, label = 'Nueva contraseña',
  help, required = false, email = '', nombre = '', confirmLabel = 'Repetir contraseña',
}) {
  const [generada, setGenerada] = useState(false);
  const noCoincide = Boolean(confirm) && password !== confirm;
  const errorPolitica = password ? validarPassword(password, { email, nombre }) : null;

  const generar = () => {
    let nueva = '';
    for (let i = 0; i < 20; i += 1) {
      nueva = generarPasswordSegura(18);
      if (!validarPassword(nueva, { email, nombre })) break;
    }
    setPassword(nueva);
    setConfirm(nueva);
    setGenerada(true);
  };

  return (
    <>
      <PasswordInput
        label={label}
        value={password}
        onChange={(e) => { setPassword(e.target.value); setGenerada(false); }}
        placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
        autoComplete="new-password"
        help={help}
        required={required}
        error={Boolean(errorPolitica) && password.length > 0}
        inputProps={{ minLength: PASSWORD_MIN }}
      />
      <PasswordInput
        label={confirmLabel}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repetí la contraseña"
        autoComplete="new-password"
        required={required}
        error={noCoincide}
      />
      <div className="pass-pair-extra" style={{ gridColumn: '1 / -1' }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <PasswordStrength password={password} email={email} nombre={nombre} />
          <button type="button" className="chip" onClick={generar}>
            <Icon name="refresh" size={12} /> Generar clave segura
          </button>
        </div>
        {errorPolitica && password && <small className="pass-error">{errorPolitica}</small>}
        {noCoincide && <small className="pass-error">Las contraseñas no coinciden.</small>}
        {generada && !errorPolitica && !noCoincide && (
          <small className="ayuda">Clave generada. Guardala en tu gestor antes de continuar.</small>
        )}
      </div>
    </>
  );
}
