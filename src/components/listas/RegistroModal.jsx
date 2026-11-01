import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { api } from '../../store/api';
import ComentariosModal from './ComentariosModal';
import HistorialModal from './HistorialModal';
import AprobacionesModal from './AprobacionesModal';
import { AdjuntoLink } from './AdjuntoLink';
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
        const etiqueta = campos.find((c) => c.id === campo.config?.campo_mostrar)
          || campos.find((c) => /nombre|t[ií]tulo|material|herramienta|insumo|prospecto|cliente/i.test(c.nombre))
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

function AdjuntoInput({ listaId, campoId, value, onChange, soloImagen = false }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const subir = async (file) => {
    if (!file) return;
    setError('');
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append('archivo', file);
      const query = campoId ? `?campo_id=${encodeURIComponent(campoId)}` : '';
      const subido = await api(`/listas/${listaId}/adjuntos${query}`, { method: 'POST', form });
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
          <AdjuntoLink url={value.url} nombre={value.nombre}>
            <Icon name="folder" size={14} /> {value.nombre || 'Ver adjunto'}
          </AdjuntoLink>
          <button type="button" className="btn icon sm danger" onClick={() => onChange(null)} title="Quitar adjunto">
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : (
        <input
          className="input"
          type="file"
          accept={soloImagen ? 'image/jpeg,image/png,image/webp,image/gif' : 'image/jpeg,image/png,image/webp,image/gif,application/pdf'}
          onChange={(e) => subir(e.target.files?.[0])}
          disabled={subiendo}
        />
      )}
      {subiendo && <small className="muted">Subiendo...</small>}
      {error && <small className="pass-error">{error}</small>}
      <small className="ayuda">{soloImagen ? 'Imagen JPG, PNG, WebP o GIF, hasta 8 MB.' : 'Imagen o PDF, hasta 8 MB.'}</small>
    </div>
  );
}

function PersonaInput({ value, onChange }) {
  const [equipo, setEquipo] = useState([]);
  useEffect(() => {
    let vivo = true;
    api('/equipo')
      .then((r) => { if (vivo) setEquipo(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivo) setEquipo([]); });
    return () => { vivo = false; };
  }, []);
  const actual = String(value ?? '');
  const opciones = actual && !equipo.some((e) => e.email === actual)
    ? [...equipo, { email: actual, nombre: actual, rol: '' }]
    : equipo;
  return (
    <>
      <input
        className="input"
        list="equipo-bertika"
        value={actual}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nombre o email de la persona"
      />
      <datalist id="equipo-bertika">
        {opciones.map((e) => <option key={e.email} value={e.email}>{e.nombre}{e.rol ? ` · ${e.rol}` : ''}</option>)}
      </datalist>
      <small className="ayuda">Sugerencias del equipo interno. También podés escribir un email.</small>
    </>
  );
}

function ClienteInput({ value, onChange }) {
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    api('/listas/clientes')
      .then((r) => { if (vivo) setClientes(Array.isArray(r) ? r : []); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, []);
  const actual = value && typeof value === 'object' ? String(value.id || '') : String(value || '');
  return (
    <>
      <select className="input" value={actual} onChange={(e) => {
        const c = clientes.find((x) => x.id === e.target.value);
        onChange(c ? { id: c.id, nombre: c.nombre } : null);
      }}>
        <option value="">Elegir cliente...</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>)}
      </select>
      {error && <small className="pass-error">{error}</small>}
    </>
  );
}

export function CampoInput({ campo, value, onChange, listaId }) {
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
  } else if (tipo === 'adjunto' || tipo === 'imagen') {
    control = <AdjuntoInput listaId={listaId} campoId={campo?.id} value={value} onChange={onChange} soloImagen={tipo === 'imagen'} />;
  } else if (tipo === 'relacion') {
    control = <RelacionInput campo={campo} value={value} onChange={onChange} />;
  } else if (tipo === 'calculado') {
    control = <input className="input" value={value ?? ''} disabled placeholder="Se calcula al guardar" />;
  } else if (tipo === 'persona') {
    control = <PersonaInput value={value} onChange={onChange} />;
  } else if (tipo === 'cliente') {
    control = <ClienteInput value={value} onChange={onChange} />;
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

export default function RegistroModal({ lista, registro, puedeBorrar, puedeEditar, puedeAprobar, puedeConvertir, busy, onGuardar, onEliminar, onConvertir, onRecargar, onClose }) {
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
  const [panel, setPanel] = useState(null);
  const bloqueadoAprobacion = Boolean(registro && lista.requiere_aprobacion && !puedeAprobar && ['pendiente', 'rechazado'].includes(registro.aprobacion_estado));

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
              <button type="button" className="btn danger" onClick={() => onEliminar(registro)} disabled={busy || bloqueadoAprobacion}>
                <Icon name="x" size={14} /> Archivar
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-registro-lista" className="btn primary" disabled={busy || !campos.length || bloqueadoAprobacion}>
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
        {bloqueadoAprobacion && (
          <div className="banner-info" style={{ marginBottom: 14 }}>
            <Icon name="info" size={15} />
            <span>{registro.aprobacion_estado === 'pendiente'
              ? 'Este registro está pendiente de aprobación. Podés verlo y comentarlo, pero un gestor tiene que aprobarlo para modificarlo.'
              : 'Este registro fue rechazado. Un gestor tiene que aprobarlo antes de modificarlo.'}</span>
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

      {registro && (
        <div className="row" style={{ gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="btn sm" onClick={() => setPanel('comentarios')}>
            <Icon name="mail" size={13} /> Comentarios
          </button>
          <button type="button" className="btn sm" onClick={() => setPanel('historial')}>
            <Icon name="clock" size={13} /> Historial
          </button>
          <button type="button" className="btn sm" onClick={() => setPanel('aprobaciones')}>
            <Icon name="check" size={13} /> Aprobaciones
          </button>
        </div>
      )}

      {panel === 'comentarios' && (
        <ComentariosModal lista={lista} registro={registro} onClose={() => setPanel(null)} />
      )}
      {panel === 'aprobaciones' && (
        <AprobacionesModal
          lista={lista}
          registro={registro}
          puedeSolicitar={Boolean(puedeEditar)}
          puedeAprobar={Boolean(puedeAprobar)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'historial' && (
        <HistorialModal
          lista={lista}
          registro={registro}
          campos={campos}
          puedeEditar={Boolean(puedeEditar)}
          onRestaurada={() => { onRecargar?.(); onClose(); }}
          onClose={() => setPanel(null)}
        />
      )}
    </Modal>
  );
}
