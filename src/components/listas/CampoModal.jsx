import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid } from '../ui';
import { api } from '../../store/api';
import { TIPOS_CAMPO, normalizarOpciones, validarFormula } from '../../data/listas';

export default function CampoModal({ campo, listas = [], listaActual, camposActuales = [], busy, onGuardar, onClose }) {
  const [nombre, setNombre] = useState(campo?.nombre || '');
  const [tipo, setTipo] = useState(campo?.tipo || 'texto');
  const [opciones, setOpciones] = useState(() => (campo?.config?.opciones || []).join('\n'));
  const [requerido, setRequerido] = useState(Boolean(campo?.requerido));
  const [unico, setUnico] = useState(Boolean(campo?.unico));
  const [min, setMin] = useState(campo?.config?.min ?? '');
  const [max, setMax] = useState(campo?.config?.max ?? '');
  const [ayuda, setAyuda] = useState(campo?.config?.ayuda || '');
  const [relacionId, setRelacionId] = useState(campo?.config?.lista_id || '');
  const [lookupRelacion, setLookupRelacion] = useState(campo?.config?.relacion_id || '');
  const [lookupCampo, setLookupCampo] = useState(campo?.config?.campo_origen || '');
  const [formula, setFormula] = useState(campo?.config?.formula || '');
  const [camposDestino, setCamposDestino] = useState([]);
  const [mostrar, setMostrar] = useState(campo?.config?.campo_mostrar || '');
  const [error, setError] = useState('');
  const [oculto, setOculto] = useState(Array.isArray(campo?.oculto_categorias) ? campo.oculto_categorias : []);
  const [categorias, setCategorias] = useState([]);
  const esSeleccion = tipo === 'seleccion' || tipo === 'multiseleccion';
  const esNumero = tipo === 'numero' || tipo === 'moneda';
  const esRelacion = tipo === 'relacion';
  const esLookup = tipo === 'lookup';
  const esCalculado = tipo === 'calculado';
  const relacionParaLookup = (camposActuales || []).find((c) => c.id === lookupRelacion && c.tipo === 'relacion');
  const targetLookup = relacionParaLookup?.config?.lista_id || '';
  useEffect(() => {
    let vivo = true;
    api('/listas/categorias')
      .then((r) => { if (vivo) setCategorias(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivo) setCategorias([]); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const target = esRelacion ? relacionId : (esLookup ? targetLookup : '');
    if (!target) { setCamposDestino([]); return undefined; }
    let vivo = true;
    api(`/listas/${target}`)
      .then((det) => { if (vivo) setCamposDestino(det.campos || []); })
      .catch(() => { if (vivo) setCamposDestino([]); });
    return () => { vivo = false; };
  }, [esRelacion, esLookup, relacionId, targetLookup]);
  const camposCalculables = (camposActuales || []).filter((c) => ['numero', 'moneda', 'calculado'].includes(c.tipo) && c.id !== campo?.id);
  const otrasListas = (listas || []).filter((l) => l.id !== listaActual?.id);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) {
      setError('El campo necesita un nombre.');
      return;
    }
    const ops = normalizarOpciones(opciones);
    if (esSeleccion && ops.length === 0) {
      setError('Agregá al menos una opción.');
      return;
    }
    if (esRelacion && !relacionId) {
      setError('Elegí la lista con la que se relaciona este campo.');
      return;
    }
    if (esLookup && !lookupRelacion) {
      setError('Elegí el campo de relación del lookup.');
      return;
    }
    if (esLookup && !lookupCampo) {
      setError('Elegí el campo que querés mostrar en el lookup.');
      return;
    }
    if (esCalculado) {
      const err = validarFormula(formula);
      if (err) { setError(err); return; }
    }
    const config = {};
    if (esSeleccion) config.opciones = ops;
    if (esRelacion) config.lista_id = relacionId;
    if (esRelacion && mostrar) config.campo_mostrar = mostrar;
    if (esLookup) { config.relacion_id = lookupRelacion; config.campo_origen = lookupCampo; }
    if (esCalculado) config.formula = formula;
    if (esNumero) {
      if (min !== '') config.min = Number(min);
      if (max !== '') config.max = Number(max);
    }
    if (ayuda.trim()) config.ayuda = ayuda.trim();
    onGuardar({
      nombre: nombre.trim(),
      tipo,
      config,
      requerido,
      unico,
      oculto_categorias: oculto,
    });
  };

  return (
    <Modal
      size="md"
      title={campo ? `Editar campo: ${campo.nombre}` : 'Agregar campo'}
      sub="Los campos definen las columnas de la lista y el formulario de carga."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-campo-lista" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : campo ? 'Guardar campo' : 'Agregar campo'}
          </button>
        </>
      )}
    >
      <form id="form-campo-lista" onSubmit={submit} noValidate>
        {error && (
          <div className="banner-red" style={{ marginBottom: 14 }}>
            <div><Icon name="x" size={15} /> {error}</div>
          </div>
        )}
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Cliente, Etapa, Fecha" data-autofocus />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_CAMPO.map((t) => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
            </select>
          </div>

          {esCalculado && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Fórmula *</label>
              <input
                className="input"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="Ej.: {campo1} + {campo2} * 2"
              />
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                <select
                  className="input"
                  style={{ width: 240 }}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setFormula((prev) => `${prev}${prev ? ' + ' : ''}{${e.target.value}}`);
                  }}
                >
                  <option value="">Insertar campo numérico...</option>
                  {camposCalculables.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <small className="ayuda">Solo números y + - * / paréntesis. Los campos se insertan como {campo}.</small>
            </div>
          )}

          {esRelacion && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Lista relacionada *</label>
              {otrasListas.length === 0 ? (
                <div className="banner-info">
                  <Icon name="info" size={15} />
                  <span>Necesitás otra lista en esta área para crear una relación.</span>
                </div>
              ) : (
                <select className="input" value={relacionId} onChange={(e) => { setRelacionId(e.target.value); setMostrar(''); }}>
                  <option value="">Elegir lista...</option>
                  {otrasListas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              )}
              {relacionId && (
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Mostrar campo de la lista relacionada</label>
                  <select className="input" value={mostrar} onChange={(e) => setMostrar(e.target.value)}>
                    <option value="">Automático</option>
                    {camposDestino.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
              <small className="ayuda">El registro guarda el vínculo; la etiqueta la resuelve la API con el campo que elijas.</small>
            </div>
          )}

          {esLookup && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Campo de relación *</label>
              {(!camposActuales || camposActuales.filter((c) => c.tipo === 'relacion').length === 0) ? (
                <div className="banner-info">
                  <Icon name="info" size={15} />
                  <span>Primero creá un campo de tipo <b>Relación con otra lista</b> en esta lista. El lookup usa ese vínculo para traer una columna de la lista relacionada.</span>
                </div>
              ) : (
                <select
                  className="input"
                  value={lookupRelacion}
                  onChange={(e) => { setLookupRelacion(e.target.value); setLookupCampo(''); }}
                >
                  <option value="">Elegir campo de relación...</option>
                  {camposActuales.filter((c) => c.tipo === 'relacion').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}
              {lookupRelacion && (
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Campo a mostrar *</label>
                  <select className="input" value={lookupCampo} onChange={(e) => setLookupCampo(e.target.value)}>
                    <option value="">Elegir campo...</option>
                    {camposDestino.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
              <small className="ayuda">Se actualiza solo: si cambia el dato en la lista relacionada, la columna lookup muestra el valor nuevo.</small>
            </div>
          )}

          {esSeleccion && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Opciones *</label>
              <textarea
                className="input"
                rows={4}
                value={opciones}
                onChange={(e) => setOpciones(e.target.value)}
                placeholder={'Una opción por línea\nEj.: Nuevo\nContactado\nGanado\nPerdido'}
              />
              <small className="ayuda">Una por línea. También podés separarlas con comas.</small>
            </div>
          )}

          {esNumero && (
            <>
              <div className="field">
                <label>Mínimo</label>
                <input className="input" type="number" step="any" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="field">
                <label>Máximo</label>
                <input className="input" type="number" step="any" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Ayuda para completar</label>
            <input className="input" value={ayuda} onChange={(e) => setAyuda(e.target.value)} placeholder="Opcional: una aclaración para el equipo" />
          </div>
        </FormGrid>

        <div className="col" style={{ gap: 6, marginTop: 12 }}>
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={requerido} onChange={(e) => setRequerido(e.target.checked)} />
            <span>Obligatorio para guardar un registro</span>
          </label>
          <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={unico} onChange={(e) => setUnico(e.target.checked)} />
            <span>No permitir valores repetidos en este campo</span>
          </label>
        </div>

        {categorias.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Ocultar este campo para</label>
            <small className="ayuda">Esas categorías no lo ven en la tabla, el formulario, el historial ni la API.</small>
            <div className="col" style={{ gap: 4, marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, padding: 8, maxHeight: 130, overflow: 'auto' }}>
              {categorias.map((c) => (
                <label key={c.id} className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  <input
                    type="checkbox"
                    checked={oculto.includes(c.id)}
                    onChange={(e) => setOculto((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                  />
                  <span>{c.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
