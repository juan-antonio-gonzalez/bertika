import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../components/ui';
import { api } from '../store/api';

function CampoPublico({ campo, value, onChange }) {
  const tipo = campo.tipo;
  const opciones = Array.isArray(campo.config?.opciones) ? campo.config.opciones : [];
  const label = <label>{campo.nombre}{campo.requerido ? ' *' : ''}</label>;

  if (tipo === 'texto_largo') {
    return <div className="field">{label}<textarea className="input" rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></div>;
  }
  if (tipo === 'seleccion') {
    return <div className="field">{label}<select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Elegir...</option>{opciones.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  }
  if (tipo === 'multiseleccion') {
    return (
      <div className="field">
        {label}
        <div className="col" style={{ gap: 5 }}>
          {opciones.map((o) => (
            <label key={o} className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(o)}
                onChange={(e) => {
                  const actual = Array.isArray(value) ? value : [];
                  onChange(e.target.checked ? [...actual, o] : actual.filter((x) => x !== o));
                }}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (tipo === 'checkbox') {
    return <div className="field"><label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /><span>{campo.nombre}</span></label></div>;
  }
  const inputType = tipo === 'email' ? 'email' : tipo === 'telefono' ? 'tel' : tipo === 'url' ? 'url' : tipo === 'fecha' ? 'date' : (tipo === 'numero' || tipo === 'moneda') ? 'number' : 'text';
  return (
    <div className="field">
      {label}
      <input
        className="input"
        type={inputType}
        step={tipo === 'moneda' ? '0.01' : undefined}
        min={tipo === 'numero' || tipo === 'moneda' ? 0 : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(tipo === 'numero' || tipo === 'moneda' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      />
      {campo.config?.ayuda && <small className="ayuda">{campo.config.ayuda}</small>}
    </div>
  );
}

export default function FormularioPublico() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [datos, setDatos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState('');

  useEffect(() => {
    let vivo = true;
    api(`/public/formulario/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!vivo) return;
        setForm(r);
        const inicial = {};
        for (const c of r.campos || []) inicial[c.id] = c.tipo === 'multiseleccion' ? [] : c.tipo === 'checkbox' ? false : '';
        setDatos(inicial);
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [token]);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    for (const c of form?.campos || []) {
      const valor = datos[c.id];
      if (c.requerido && (valor === '' || valor === null || valor === undefined || (Array.isArray(valor) && valor.length === 0))) {
        setError(`Completá “${c.nombre}”.`);
        return;
      }
    }
    setBusy(true);
    try {
      await api(`/public/formulario/${encodeURIComponent(token)}`, { method: 'POST', body: { datos, _empresa: empresa } });
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (cargando) {
    return <div className="wrap page center" style={{ minHeight: '55vh', placeContent: 'center' }}><p className="muted">Cargando formulario...</p></div>;
  }
  if (!form) {
    return (
      <div className="wrap page center" style={{ minHeight: '55vh', placeContent: 'center' }}>
        <div className="card" style={{ maxWidth: 460 }}>
          <h2 className="card-title"><Icon name="info" size={16} /> Formulario no disponible</h2>
          <p className="muted">{error || 'El enlace no existe o fue desactivado.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-form-page">
      <div className="public-form-card">
        <div className="public-form-brand"><span className="logo"><Icon name="bolt" size={20} /></span><b>BERTIKA<sup>®</sup></b></div>
        {enviado ? (
          <div className="center" style={{ padding: '30px 0' }}>
            <span className="public-form-ok"><Icon name="check" size={28} /></span>
            <h2>¡Listo!</h2>
            <p className="muted">Recibimos tu respuesta. Gracias por escribirnos.</p>
          </div>
        ) : (
          <>
            <h1>{form.titulo}</h1>
            {form.descripcion && <p className="muted">{form.descripcion}</p>}
            <form onSubmit={enviar} className="col" style={{ gap: 10, marginTop: 16 }}>
              {form.campos.map((c) => (
                <CampoPublico key={c.id} campo={c} value={datos[c.id]} onChange={(v) => setDatos((prev) => ({ ...prev, [c.id]: v }))} />
              ))}
              <input
                type="text"
                name="_empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />
              {error && <div className="banner-red"><div><Icon name="x" size={15} /> {error}</div></div>}
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" size={14} /> {busy ? 'Enviando...' : 'Enviar respuesta'}
              </button>
              <small className="muted center">Tus datos se usan solo para responder esta consulta.</small>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
