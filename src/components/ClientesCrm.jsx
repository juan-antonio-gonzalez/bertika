// Bertika - Seccion Clientes/CRM (/hub/clientes).
//
// Tabla de clientes con los KPIs que se miran todos los dias (ordenes activas,
// entregadas, equipos en flotilla, garantias vigentes y monto cobrado) y la
// ficha completa de cada uno al hacer clic.
//
// Todo el calculo sale de src/data/clientesKpis.js (probado aparte) y los datos
// del store: clientes, ordenes y baterias. Nunca se pide nada al backend.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/store';
import { Icon, Modal, EstadoPill, fmtARS, fmtFecha, waNumero } from './ui';
import { CANALES_ORIGEN, camposComercialesCargados } from '../data/crm.js';
import { TIPOS_CLIENTE } from '../data/crm';
import {
  resumenClientes, filtrarClientes, ordenarClientes, ORDENES, fichaCliente, tipoCliente,
} from '../data/clientesKpis';

// Garantia: color y texto segun los dias que faltan (null = sin fecha cargada).
const tonoGarantia = (dias) => (dias === null ? 'gray' : dias < 0 ? 'red' : dias <= 60 ? 'orange' : 'green');
const textoGarantia = (dias) => {
  if (dias === null) return 'Sin fecha';
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} d`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} d`;
};

const tonoVida = (estado) => {
  const e = String(estado || '').toLowerCase();
  if (e === 'en_garantia') return 'green';
  if (e === 'baja' || e === 'dada_de_baja') return 'red';
  return 'amber';
};

function Kpi({ icono, label, valor, sub, tono }) {
  return (
    <div className={`kpi${tono ? ` ${tono}` : ''}`}>
      <div className="kpi-label"><Icon name={icono} size={13} /> {label}</div>
      <div className="kpi-value">{valor}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

// Editar la ficha del cliente. Es lo que evita que un telefono mal cargado quede
// para siempre: nombre, contacto, empresa, telefono, email, tipo y notas.
function FormCliente({ cliente, onGuardar, onClose, busy }) {
  const [f, setF] = useState({
    nombre: cliente?.nombre || '',
    contacto: cliente?.contacto || '',
    empresa: cliente?.empresa || '',
    telefono: cliente?.telefono || '',
    email: cliente?.email || '',
    tipo: cliente?.tipo || 'particular',
    notas: cliente?.notas || '',
    direccion: cliente?.direccion || '',
    localidad: cliente?.localidad || '',
    cuit: cliente?.cuit || '',
    condicion_pago: cliente?.condicion_pago || '',
    canal_origen: cliente?.canal_origen || '',
    vendedor: cliente?.vendedor || '',
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const valido = Boolean(f.nombre.trim()) && /^\S+@\S+\.\S+$/.test(f.email.trim());

  return (
    <Modal title="Editar cliente" sub={cliente?.nombre} onClose={onClose}>
      <div className="col">
        <div className="field">
          <label>Nombre *</label>
          <input className="input" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Contacto</label>
            <input className="input" value={f.contacto} onChange={(e) => set('contacto', e.target.value)} placeholder="Quién atiende" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Teléfono</label>
            <input className="input" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="11 5555-0101" />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Email *</label>
            <input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@ejemplo.com" />
          </div>
          <div className="field" style={{ width: 200 }}>
            <label>Tipo</label>
            <select className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
              {TIPOS_CLIENTE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Empresa</label>
          <input className="input" value={f.empresa} onChange={(e) => set('empresa', e.target.value)} placeholder="Razón social (si es flotilla)" />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Datos comerciales</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Dirección</label>
            <input className="input" value={f.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle y número" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Localidad</label>
            <input className="input" value={f.localidad} onChange={(e) => set('localidad', e.target.value)} placeholder="Ciudad / partido" />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ width: 180 }}>
            <label>CUIT</label>
            <input className="input" value={f.cuit} onChange={(e) => set('cuit', e.target.value)} placeholder="30-12345678-9" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Condición de pago</label>
            <input className="input" value={f.condicion_pago} onChange={(e) => set('condicion_pago', e.target.value)} placeholder="Contado / 30 días" />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Cómo nos conoció</label>
            <input className="input" list="canales-origen-cliente" value={f.canal_origen} onChange={(e) => set('canal_origen', e.target.value)} placeholder="WhatsApp, recomendación…" />
            <datalist id="canales-origen-cliente">
              {CANALES_ORIGEN.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Vendedor</label>
            <input className="input" value={f.vendedor} onChange={(e) => set('vendedor', e.target.value)} placeholder="Quién lo atiende" />
          </div>
        </div>
        <div className="field">
          <label>Notas internas</label>
          <textarea className="input" value={f.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Preferencias, horarios de contacto, cómo nos conoció…" />
        </div>
        <button className="btn primary block" disabled={busy || !valido} onClick={() => onGuardar(f)}>
          <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </Modal>
  );
}

// Ficha del cliente: contacto, numeros, ordenes, equipos y garantias.
function Ficha({ cliente, datos, onAbrirOrden, onEditar, onBaja, onClose }) {
  const f = fichaCliente(cliente, datos);
  const k = f.kpis;
  const comerciales = camposComercialesCargados(cliente);
  const wa = waNumero(cliente.telefono);
  const abrir = (o) => { onClose(); onAbrirOrden?.(o); };

  return (
    <Modal ancho="ancho" title={cliente.nombre} sub={`${tipoCliente(cliente.tipo)}${cliente.empresa ? ` · ${cliente.empresa}` : ''}`} onClose={onClose}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <span className="pill"><Icon name="user" size={12} /> {cliente.contacto || 'Sin contacto'}</span>
        <span className="pill"><Icon name="info" size={12} /> {cliente.telefono || 'Sin teléfono'}</span>
        <span className="pill"><Icon name="mail" size={12} /> {cliente.email || 'Sin email'}</span>
        {wa && (
          <a className="btn sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
            <Icon name="mail" size={12} /> WhatsApp
          </a>
        )}
        <button className="btn sm" onClick={onEditar}><Icon name="gear" size={12} /> Editar ficha</button>
        <button className="btn sm danger" onClick={onBaja}><Icon name="x" size={12} /> Dar de baja</button>
      </div>

      {cliente.notas && (
        <div className="banner-info" style={{ marginBottom: 12 }}>
          <Icon name="info" size={15} /> <span>{cliente.notas}</span>
        </div>
      )}

      {/* Datos comerciales: solo se muestran los que tienen algo cargado. */}
      {comerciales.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title"><Icon name="building" size={14} /> Datos comerciales</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {comerciales.map((c) => (
              <span key={c.key} className="pill" title={c.label}>
                <b style={{ fontWeight: 700 }}>{c.label}:</b> {c.valor}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid3">
        <Kpi icono="tools" label="Órdenes activas" valor={k.activas} sub={`${k.ordenes} en total · ${k.entregadas} entregadas`} />
        <Kpi icono="battery" label="Flotilla" valor={k.flotilla} sub="equipos en uso" />
        <Kpi icono="dollar" label="Cobrado" valor={fmtARS(k.cobrado)} sub={`${fmtARS(k.cotizado)} cotizado`} tono="green" />
        <Kpi
          icono="shield" label="Garantías vigentes" valor={k.garantias}
          sub={k.garantiasPorVencer > 0 ? `${k.garantiasPorVencer} por vencer (60 d)` : 'ninguna por vencer'}
          tono={k.garantiasPorVencer > 0 ? 'alert' : undefined}
        />
      </div>

      <div className="mt16">
        <div className="card-title"><Icon name="clipboard" size={14} /> Órdenes ({f.ordenes.length})</div>
        {f.ordenes.length === 0 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>Este cliente todavía no tiene órdenes en el taller.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Orden</th><th>Serie</th><th>Estado</th><th>Ingreso</th><th className="num">Monto</th><th>Garantía</th></tr></thead>
              <tbody>
                {f.ordenes.map((o) => {
                  const monto = Number(o.monto_cobrado) || Number(o.cotizacion?.monto) || 0;
                  return (
                    <tr key={o.id} style={{ cursor: onAbrirOrden ? 'pointer' : undefined }} onClick={() => abrir(o)}>
                      <td className="mono">{o.id}</td>
                      <td className="mono">{o.bateria_serie || '—'}</td>
                      <td><EstadoPill estado={o.estado} /></td>
                      <td>{fmtFecha(o.fecha_ingreso)}</td>
                      <td className="num">{monto ? fmtARS(monto) : '—'}</td>
                      <td>{o.garantia ? <span className="badge green">{o.garantia.meses || 0} meses</span> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt16">
        <div className="card-title"><Icon name="battery" size={14} /> Equipos ({f.baterias.length})</div>
        {f.baterias.length === 0 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>Sin baterías asociadas a su nombre.</p>
        ) : (
          <ul className="ulist">
            {f.baterias.map((b) => (
              <li key={b.id}>
                <span><b className="mono">{b.numero_serie}</b> <span className="muted">{b.tipo || ''} {b.voltaje || ''} {b.capacidad ? `· ${b.capacidad} Ah` : ''}</span></span>
                <span className={`badge ${tonoVida(b.estado_vida)}`}>{String(b.estado_vida || 'activa').replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt16">
        <div className="card-title"><Icon name="shield" size={14} /> Garantías ({f.garantias.length})</div>
        {f.garantias.length === 0 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>Todavía no hay garantías registradas.</p>
        ) : (
          <ul className="ulist">
            {f.garantias.map((g) => (
              <li key={g.orden_id}>
                <span>
                  <b className="mono">{g.serie || g.orden_id}</b>
                  <span className="muted"> · {g.meses} meses / {g.ciclos} ciclos</span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{g.vence ? fmtFecha(g.vence) : 'sin fecha'}</span>
                  <span className={`badge ${tonoGarantia(g.dias)}`}>{textoGarantia(g.dias)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function ClientesCrm({ onAbrirOrden }) {
  const data = useStore((s) => s.data);
  const editarCliente = useStore((s) => s.editarCliente);
  const darDeBajaCliente = useStore((s) => s.darDeBajaCliente);
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState('nombre');
  const [abierto, setAbierto] = useState(null);
  const [editar, setEditar] = useState(null);   // cliente que se está editando
  const [aBaja, setABaja] = useState(null);     // cliente a dar de baja
  const [busy, setBusy] = useState(false);

  const guardarEdicion = async (campos) => {
    setBusy(true);
    try {
      const upd = await editarCliente(editar.id, campos);
      if (upd) setEditar(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmarBaja = async () => {
    setBusy(true);
    try {
      const ok = await darDeBajaCliente(aBaja.id);
      if (ok) {
        setABaja(null);
        setAbierto(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const { filas, totales } = useMemo(
    () => resumenClientes(data.clientes, data),
    [data.clientes, data.ordenes, data.baterias] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibles = useMemo(() => ordenarClientes(filtrarClientes(filas, texto), orden), [filas, texto, orden]);

  const seleccionado = abierto ? data.clientes.find((c) => c.id === abierto) || null : null;
  const hayClientes = Array.isArray(data.clientes) && data.clientes.length > 0;

  return (
    <div className="col">
      {/* Cabecera con los totales de la cartera */}
      <div className="grid4">
        <Kpi icono="users" label="Clientes" valor={totales.clientes} sub="en la cartera" />
        <Kpi icono="tools" label="Órdenes activas" valor={totales.activas} sub="en el taller ahora" />
        <Kpi icono="battery" label="Equipos en flotilla" valor={totales.flotilla} sub="baterías en uso" />
        <Kpi icono="shield" label="Garantías vigentes" valor={totales.garantias} sub="con vencimiento cargado" />
      </div>

      <div className="card">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>
            <Icon name="users" size={14} /> Clientes / CRM
            <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>· {fmtARS(totales.cobrado)} cobrados</span>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }} />
              <input
                className="input" style={{ paddingLeft: 34, width: 250 }} placeholder="Buscar cliente o teléfono"
                value={texto} onChange={(e) => setTexto(e.target.value)}
                aria-label="Buscar cliente"
              />
            </div>
            <select className="input" style={{ width: 200 }} value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar por">
              {ORDENES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <Link className="btn sm" to="/hub/papelera"><Icon name="recycl" size={13} /> Papelera</Link>
          </div>
        </div>

        {!hayClientes && (
          <div className="empty">
            <div className="big"><Icon name="users" size={30} /></div>
            Todavía no hay clientes cargados.
            <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>
              Cuando se cree una orden con un cliente nuevo, aparece acá con sus equipos y garantías.
            </p>
          </div>
        )}

        {hayClientes && visibles.length === 0 && (
          <div className="empty">
            <div className="big"><Icon name="search" size={30} /></div>
            Ningún cliente coincide con «{texto}».
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn sm" onClick={() => setTexto('')}>Limpiar búsqueda</button>
            </div>
          </div>
        )}

        {visibles.length > 0 && (
          <div className="mt16" style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th><button className="th-sort" onClick={() => setOrden('nombre')}>Cliente{orden === 'nombre' ? ' ▲' : ''}</button></th>
                  <th><button className="th-sort" onClick={() => setOrden('activas')}>Activas{orden === 'activas' ? ' ▼' : ''}</button></th>
                  <th>Entregadas</th>
                  <th><button className="th-sort" onClick={() => setOrden('flotilla')}>Flotilla{orden === 'flotilla' ? ' ▼' : ''}</button></th>
                  <th>Garantías</th>
                  <th className="num"><button className="th-sort" onClick={() => setOrden('cobrado')}>Cobrado{orden === 'cobrado' ? ' ▼' : ''}</button></th>
                  <th>Última actividad</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ cliente: c, kpis: k }) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setAbierto(c.id)}>
                    <td>
                      <b style={{ fontSize: 13.5 }}>{c.nombre}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        <span className="badge gray" style={{ marginRight: 6 }}>{tipoCliente(c.tipo)}</span>
                        {c.contacto || c.telefono || c.email || 'sin datos de contacto'}
                      </div>
                    </td>
                    <td><b>{k.activas}</b> <span className="muted" style={{ fontSize: 12 }}>/ {k.ordenes}</span></td>
                    <td>{k.entregadas}</td>
                    <td>{k.flotilla}</td>
                    <td>
                      {k.garantias > 0 ? <span className="badge green">{k.garantias}</span> : <span className="muted">—</span>}
                      {k.garantiasPorVencer > 0 && <span className="badge orange" style={{ marginLeft: 6 }}>{k.garantiasPorVencer} por vencer</span>}
                    </td>
                    <td className="num">{k.cobrado ? fmtARS(k.cobrado) : <span className="muted">—</span>}</td>
                    <td className="muted">{k.ultimaActividad ? fmtFecha(k.ultimaActividad) : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAbierto(c.id); }}><Icon name="eye" size={12} /> Ficha</button>
                        <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditar(c); }}><Icon name="gear" size={12} /> Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {visibles.length} de {filas.length} clientes · clic en una fila para ver la ficha
            </p>
          </div>
        )}
      </div>

      {seleccionado && (
        <Ficha
          cliente={seleccionado} datos={data} onAbrirOrden={onAbrirOrden}
          onEditar={() => setEditar(seleccionado)}
          onBaja={() => setABaja(seleccionado)}
          onClose={() => setAbierto(null)}
        />
      )}

      {editar && (
        <FormCliente cliente={editar} busy={busy} onGuardar={guardarEdicion} onClose={() => setEditar(null)} />
      )}

      {aBaja && (
        <Modal title="Dar de baja al cliente" sub={aBaja.nombre} onClose={() => setABaja(null)}>
          <div className="col">
            <div className="banner-info">
              <Icon name="info" size={15} />
              <span>
                El cliente <b>no se borra</b>: se guarda en la <b>Papelera</b> con quién y cuándo lo dio de baja,
                y se puede <b>restaurar</b> cuando quieras. Sus órdenes e historial quedan intactos.
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              No se puede dar de baja a un cliente con órdenes en curso: primero hay que entregarlas o cancelarlas.
            </p>
            <button className="btn danger block" disabled={busy} onClick={confirmarBaja}>
              <Icon name="x" size={14} /> {busy ? 'Dando de baja...' : 'Confirmar baja'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
