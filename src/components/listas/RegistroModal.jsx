import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { api } from '../../store/api';
import { validarRegistro, etiquetaTipo, valorVisible } from '../../data/listas';

function RelacionInput({ campo, value, onChange }) {
  const [opciones, setOpciones] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const targetId = campo.config?.lista_id;

  useEffect(() => {
    if (!targetId) {
      setError('Este campo no tiene una lista relacionada configurada.');
      return undefined;
    }
    let vivo = true;
    setCargando(true);
    setError('');
    Promise.all([api(`/listas/${targetId}`), api(`/listas/${targetId}/registros`)])
      .then(([detalle, listado]) => {
        if (!vivo) return;
        const campos = detalle.campos || [];
        const etiqueta = campos.find((c) => /nombre|t[ií]tulo|material|herramienta|insumo|prospecto|cliente/i.test(c.nombre))
          || campos.find((c) => c.tipo === 'texto')
          || campos[0];
        setOpciones((listado.registros || []).map((r) => ({
          id: r.id,
          etiqueta: etiqueta ? valorVisible(etiqueta, r.datos?.[etiqueta.id]) : r.id,
        })));
      })
      .catch((e) => { if (vivo) setError(e.message || 'No se pudo cargar la lista relacionada.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [targetId]);

  const listaOpciones = value?.id && !opciones.some((o) => o.id === value.id)
    ? [...opciones, { id: value.id, etiqueta: value.etiqueta || value.id }]
    : opciones;

  return (
    <div className="col" style={{ gap: 4 }}>
      <select
        className="input"
        value={value?.id || ''}
        onChange={(e) => {
          const op = listaOpciones.find((o) => o.id === e.target.value);
          onChange(op ? { id: op.id, etiqueta: op.etiqueta } : null);
        }}
        disabled={cargando || Boolean(error)}
      >
        <option value="">{cargando ? 'Cargando...' : 'Elegir...'}</option>
        {listaOpciones.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
      </select>
      {error && <small className="pass-error">{error}</small>}
    </div>
  );
}

function AdjuntoInput({ listaId, value, onChange }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const subir = async (file) => {
    if (!file) return;
    setError('');
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append('archivo', file);
      const subido = await api(`/listas/${listaId}/adjuntos`, { method: 'POST', form });
      onChange(subido);
    } catch (e) {
      setError(e.message || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="col" style={{ gap: 5 }}>
      {value?.url ? (
        <div className="lista-adjunto">
          <a href={value.url} target="_blank" rel="noreferrer">
            <Icon name="folder" size={14} /> {value.nombre || 'Ver adjunto'}
          </a>
          <button type="button" className="btn icon sm danger" onClick={() => onChange(null)} title="Quitar adjunto">
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : (
        <input
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={(e) => subir(e.target.files?.[0])}
          disabled={subiendo}
        />
      )}
      {subiendo && <small className="muted">Subiendo...</small>}
      {error && <small className="pass-error">{error}</small>}
      <small className="ayuda">Imagen o PDF, hasta 8 MB.</small>
    </div>
  );
}

function CampoInput({ campo, value, onChange, listaId }) {
  const opciones = Array.isArray(campo.config?.opciones) ? campo.config.opciones : [];
  const ayuda = campo.config?.ayuda;
  const placeholder = campo.config?.placeholder || '';
  const tipo = campo.tipo;

  let control;
  if (tipo === 'texto_largo') {
    control = (
      <textarea
        className="input"
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  } else if (tipo === 'seleccion') {
    control = (
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir...</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (tipo === 'multiseleccion') {
    const actuales = Array.isArray(value) ? value : [];
    control = (
      <div className="lista-multiselect">
        {opciones.length === 0 && <span className="muted">Sin opciones configuradas.</span>}
        {opciones.map((o) => (
          <label key={o} className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input
              type="checkbox"
              checked={actuales.includes(o)}
              onChange={(e) => {
                const set = new Set(actuales);
                if (e.target.checked) set.add(o); else set.delete(o);
                onChange([...set]);
              }}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    );
  } else if (tipo === 'checkbox') {
    control = (
      <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{placeholder || 'Sí'}</span>
      </label>
    );
  } else if (tipo === 'adjunto') {
    control = <AdjuntoInput listaId={listaId} value={value} onChange={onChange} />;
  } else if (tipo === 'relacion') {
    control = <RelacionInput campo={campo} value={value} onChange={onChange} />;
  } else {
    const inputType = tipo === 'numero' || tipo === 'moneda' ? 'number'
      : tipo === 'fecha' ? 'date'
        : tipo === 'email' ? 'email'
          : tipo === 'url' ? 'url'
            : tipo === 'telefono' ? 'tel'
              : 'text';
    control = (
      <input
        className="input"
        type={inputType}
        step={tipo === 'moneda' ? '0.01' : tipo === 'numero' ? 'any' : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="field" style={tipo === 'texto_largo' ? { gridColumn: '1 / -1' } : undefined}>
      <label>
        {campo.nombre}{campo.requerido ? ' *' : ''}
        <span className="lista-tipo">{etiquetaTipo(tipo)}</span>
      </label>
      {control}
      {ayuda && <small className="ayuda">{ayuda}</small>}
    </div>
  );
}

export default function RegistroModal({ lista, registro, puedeBorrar, puedeConvertir, busy, onGuardar, onEliminar, onConvertir, onClose }) {
  const campos = lista.campos || [];
  const [datos, setDatos] = useState(() => {
    const salida = {};
    for (const campo of campos) {
      if (Object.prototype.hasOwnProperty.call(registro?.datos || {}, campo.id)) {
        salida[campo.id] = registro.datos[campo.id];
      } else if (campo.config?.defecto !== undefined) {
        salida[campo.id] = campo.config.defecto;
      } else if (campo.tipo === 'multiseleccion') {
        salida[campo.id] = [];
      } else if (campo.tipo === 'checkbox') {
        salida[campo.id] = false;
      } else {
        salida[campo.id] = '';
      }
    }
    return salida;
  });
  const [error, setError] = useState('');

  const setCampo = (id, valor) => setDatos((prev) => ({ ...prev, [id]: valor }));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    const validado = validarRegistro(campos, datos);
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    onGuardar(validado.datos);
  };

  return (
    <Modal
      size="lg"
      title={registro ? 'Editar registro' : `Nuevo registro en ${lista.nombre}`}
      sub={registro ? 'Cambiá los datos y guardá.' : 'Completá los campos de la lista.'}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <div className="row" style={{ gap: 6, marginRight: 'auto' }}>
            {registro && puedeConvertir && (
              <button type="button" className="btn" onClick={() => onConvertir(registro)} disabled={busy}>
                <Icon name="external" size={14} /> Convertir a cliente
              </button>
            )}
            {registro && puedeBorrar && (
              <button type="button" className="btn danger" onClick={() => onEliminar(registro)} disabled={busy}>
                <Icon name="x" size={14} /> Archivar
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-registro-lista" className="btn primary" disabled={busy || !campos.length}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : registro ? 'Guardar cambios' : 'Guardar registro'}
          </button>
        </>
      )}
    >
      <form id="form-registro-lista" onSubmit={submit} noValidate>
        {error && (
          <div className="banner-red" style={{ marginBottom: 14 }}>
            <div><Icon name="x" size={15} /> {error}</div>
          </div>
        )}
        {campos.length === 0 ? (
          <div className="banner-info">
            <Icon name="info" size={15} />
            <span>Esta lista todavía no tiene campos. Primero configurá la lista.</span>
          </div>
        ) : (
          <FormGrid cols={2}>
            {campos.map((campo) => (
              <CampoInput
                key={campo.id}
                campo={campo}
                value={datos[campo.id]}
                onChange={(valor) => setCampo(campo.id, valor)}
                listaId={lista.id}
              />
            ))}
          </FormGrid>
        )}
      </form>
    </Modal>
  );
}
