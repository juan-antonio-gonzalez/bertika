import { useEffect, useState } from 'react';
import { Icon, Modal, ConfirmDialog, FormGrid } from '../components/ui';
import { api } from '../store/api';
import { useStore, usePermiso } from '../store/store';
import { Fragment } from 'react';
import {
  COLUMNAS, PERMISOS, CLAVES, agruparPermisos, permisosPorDefecto, normalizarPermisos, resumenPermisos,
} from '../data/permisos';

// El catalogo es estatico: se agrupa una sola vez.
const GRUPOS_PERMISOS = agruparPermisos();
const MAPA_VACIO = Object.fromEntries(CLAVES.map((k) => [k, false]));

const ROL_LABEL = { admin: 'Administrador', tecnico: 'Técnico', cliente: 'Cliente' };

function FormUsuariosModal({ mode, user, tecnicos, clientes, busy, onGuardar, onClose }) {
  const uid = useStore((s) => s.user?.uid);
  const toastShow = useStore((s) => s.toastShow);
  const esEdicion = mode === 'editar';
  const edicionPropia = esEdicion && user.id === uid;
  const [email, setEmail] = useState(esEdicion ? user.email : '');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState(esEdicion ? user.rol : 'cliente');
  const [tecnicoId, setTecnicoId] = useState(esEdicion ? user.tecnico_id || '' : '');
  const [clienteId, setClienteId] = useState(esEdicion ? user.cliente_id || '' : '');
  // Permisos: arrancan con los del rol del usuario (o los suyos si ya los tiene).
  const [permisos, setPermisos] = useState(() => normalizarPermisos(esEdicion ? user.permisos : null, esEdicion ? user.rol : 'cliente'));
  const rolFinal = edicionPropia ? user.rol : rol;

  const alternar = (clave) => setPermisos((p) => ({ ...p, [clave]: !p[clave] }));
  const marcarGrupo = (items, valor) => setPermisos((p) => {
    const nuevo = { ...p };
    for (const it of items) nuevo[it.clave] = valor;
    return nuevo;
  });
  // Tilde por columna: si ya estaba todo marcado, lo apaga.
  const marcarColumna = (op) => setPermisos((p) => {
    const items = PERMISOS.filter((x) => x.op === op);
    const todos = items.every((x) => p[x.clave]);
    const nuevo = { ...p };
    for (const it of items) nuevo[it.clave] = !todos;
    return nuevo;
  });
  const cambiarRol = (nuevo) => { setRol(nuevo); setPermisos(permisosPorDefecto(nuevo)); };
  const criticos = PERMISOS.filter((x) => x.critica && permisos[x.clave]);

  const submit = (e) => {
    e.preventDefault();
    if (!esEdicion && (!email.trim() || password.length < 8)) {
      toastShow('Email y contraseña (mínimo 8 caracteres) son obligatorios.', 'warn');
      return;
    }
    if (password && password.length < 8) {
      toastShow('La contraseña debe tener al menos 8 caracteres.', 'warn');
      return;
    }
    const body = { email: email.trim() };
    if (password) body.password = password;
    if (!edicionPropia) {
      body.rol = rol;
      if (rol === 'tecnico') body.tecnico_id = tecnicoId || null;
      if (rol === 'cliente') body.cliente_id = clienteId || null;
    }
    // La tabla de casillas viaja tal cual al servidor.
    body.permisos = permisos;
    onGuardar(body);
  };

  return (
    <Modal
      size="xl"
      title={esEdicion ? `Editar ${user.email}` : 'Crear usuario'}
      sub={esEdicion ? 'Cambiá email, contraseña, rol y permisos.' : 'Nueva cuenta de acceso a la plataforma.'}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-usuario" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </>
      )}
    >
      <form id="form-usuario" onSubmit={submit} className={rolFinal === 'tecnico' ? 'modal-2col' : undefined}>
        <div className="col">
          <div className="fsec-head">
            <h4>Cuenta</h4>
            <p>Con estos datos la persona entra a la plataforma.</p>
          </div>
          <FormGrid cols={2}>
            <div className="field">
              <label>Email *</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={esEdicion} data-autofocus />
              {esEdicion && <small className="ayuda">El email no se cambia desde acá.</small>}
            </div>
            <div className="field">
              <label>{esEdicion ? 'Nueva contraseña' : 'Contraseña *'}</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
              <small className="ayuda">{esEdicion ? 'Dejalo vacío para conservar la contraseña actual.' : 'Mínimo 8 caracteres.'}</small>
            </div>
            <div className="field">
              <label>Rol</label>
              <select className="input" value={rolFinal} onChange={(e) => cambiarRol(e.target.value)} disabled={edicionPropia}>
                <option value="admin">Administrador</option>
                <option value="tecnico">Técnico</option>
                <option value="cliente">Cliente</option>
              </select>
              {edicionPropia && <small className="ayuda">No podés cambiarte el rol a vos mismo.</small>}
            </div>
            {rolFinal === 'tecnico' && (
              <div className="field">
                <label>Vincular a técnico</label>
                <select className="input" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                  <option value="">Sin vínculo</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            {rolFinal === 'cliente' && (
              <div className="field">
                <label>Vincular a cliente</label>
                <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Sin vínculo</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </FormGrid>
        </div>

        <div className="col" style={{ marginTop: rolFinal === 'tecnico' ? 0 : 18 }}>
          <div className="fsec-head">
            <h4>Permisos</h4>
            <p>Qué ve y qué puede hacer. Rigen al instante: no hace falta que vuelva a entrar.</p>
          </div>
          {rolFinal === 'admin' ? (
            <div className="banner-info">
              <Icon name="shield" size={15} />
              <span>El administrador tiene todos los permisos y no se le pueden quitar: así nunca se pierde la administración de la plataforma.</span>
            </div>
          ) : rolFinal === 'cliente' ? (
            <div className="banner-info">
              <Icon name="user" size={15} />
              <span>Un cliente ve solo su portal (sus baterías, cotizaciones, historial y garantías) y no puede recibir permisos internos del taller.</span>
            </div>
          ) : (
            <div className="permisos">
              <div className="row between wrap" style={{ gap: 8, marginBottom: 8 }}>
                <div>
                  <b style={{ fontSize: 13 }}>Qué ve y qué puede hacer</b>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    Los permisos rigen al instante: no hace falta que el usuario vuelva a entrar.
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 11.5 }}>Aplicar plantilla:</span>
                  <button type="button" className="chip" onClick={() => setPermisos(permisosPorDefecto('tecnico'))}>Técnico</button>
                  <button type="button" className="chip" onClick={() => setPermisos(permisosPorDefecto('admin'))}>Todo</button>
                  <button type="button" className="chip" onClick={() => setPermisos({ ...MAPA_VACIO })}>Nada</button>
                </div>
              </div>
              <div className="permisos-tabla-wrap">
                <table className="permisos-tabla">
                  <thead>
                    <tr>
                      <th>Permiso</th>
                      {COLUMNAS.map((c) => (
                        <th key={c.op}>
                          <button type="button" className="permisos-col-todos" onClick={() => marcarColumna(c.op)}>
                            {c.label}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GRUPOS_PERMISOS.map((g) => (
                      <Fragment key={g.grupo}>
                        <tr className="permisos-fila-grupo">
                          <td colSpan={COLUMNAS.length + 1}>
                            <span className="permisos-grupo-nombre">{g.grupo}</span>
                            <button type="button" className="chip" onClick={() => marcarGrupo(g.items, true)}>todos</button>
                            <button type="button" className="chip" onClick={() => marcarGrupo(g.items, false)}>ninguno</button>
                          </td>
                        </tr>
                        {g.items.map((it) => (
                          <tr key={it.clave} className={it.critica ? 'permisos-critica' : ''}>
                            <td>
                              <b>{it.etiqueta}</b>
                              <small>{it.detalle}</small>
                            </td>
                            {COLUMNAS.map((c) => (
                              <td key={c.op} className="permisos-celda">
                                {it.op === c.op ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(permisos[it.clave])}
                                    onChange={() => alternar(it.clave)}
                                    aria-label={it.etiqueta}
                                  />
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {criticos.length > 0 && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  <span className="badge amber" style={{ marginRight: 6 }}>Atención</span>
                  Con estos permisos este usuario puede {criticos.map((c) => c.etiqueta.toLowerCase()).join(', ')}.
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const currentUid = useStore((s) => s.user?.uid);
  // Los botones de alta/baja solo aparecen si el usuario puede hacerlo.
  const puedeBorrar = usePermiso('borrar_usuarios');
  const puedeCrear = usePermiso('crear_usuarios');
  const tecnicos = useStore((s) => s.data.tecnicos);
  const clientes = useStore((s) => s.data.clientes);
  const toastShow = useStore((s) => s.toastShow);
  const [lista, setLista] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'crear' } | { mode: 'editar', user }
  const [busy, setBusy] = useState(false);
  const [aBaja, setABaja] = useState(null);

  const cargar = async () => {
    try {
      setLista(await api('/usuarios'));
    } catch {
      setLista([]);
    }
  };

  useEffect(() => { cargar(); }, []);

  const vincular = (u) => {
    if (u.rol === 'tecnico' && u.tecnico_id) {
      const t = tecnicos.find((x) => x.id === u.tecnico_id);
      if (t) return t.nombre;
    }
    if (u.rol === 'cliente' && u.cliente_id) {
      const c = clientes.find((x) => x.id === u.cliente_id);
      if (c) return c.nombre;
    }
    return null;
  };

  const guardar = async (payload) => {
    setBusy(true);
    try {
      if (modal.mode === 'crear') {
        await api('/usuarios', { method: 'POST', body: payload });
        toastShow('Usuario creado', 'ok');
      } else {
        await api(`/usuarios/${modal.user.id}`, { method: 'PATCH', body: payload });
        toastShow('Cambios guardados', 'ok');
      }
      setModal(null);
      await cargar();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // La baja es logica (activo = false): la ficha se conserva y se puede reactivar.
  const reactivar = async (u) => {
    if (u.id === currentUid) return;
    try {
      await api(`/usuarios/${u.id}`, { method: 'PATCH', body: { activo: true } });
      await cargar();
      toastShow(`${u.email}: acceso reactivado`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const darDeBaja = async (u) => {
    try {
      await api(`/usuarios/${u.id}`, { method: 'DELETE' });
      setABaja(null);
      await cargar();
      toastShow(`${u.email}: acceso dado de baja (se puede reactivar)`, 'warn');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Usuarios y accesos</h1>
          <p className="page-sub">Cuentas de la plataforma y permisos por usuario. Solo el administrador (o quien tenga el permiso) edita esto.</p>
        </div>
        {puedeCrear && (
          <button className="btn primary" onClick={() => setModal({ mode: 'crear' })}>
            <Icon name="plus" size={14} /> Crear usuario
          </button>
        )}
      </div>

      <div className="col" style={{ maxWidth: 860 }}>
        {!lista ? (
          <p className="muted">Cargando usuarios...</p>
        ) : lista.length === 0 ? (
          <div className="card"><p className="muted">Todavía no hay usuarios. Creá el primero.</p></div>
        ) : (
          lista.map((u) => (
            <div key={u.id} className="card" style={{ opacity: u.activo ? 1 : 0.6 }}>
              <div className="row between wrap">
                <div className="row" style={{ gap: 12, minWidth: 240 }}>
                  <span className="avatar">{u.email?.[0]?.toUpperCase()}</span>
                  <div>
                    <b>{u.email}</b>
                    <div className="row" style={{ gap: 8, marginTop: 2 }}>
                      <span className={`badge ${u.rol === 'admin' ? 'amber' : u.rol === 'tecnico' ? 'blue' : 'green'}`}>{ROL_LABEL[u.rol] || u.rol}</span>
                      <span className="badge gray">{resumenPermisos(u)}</span>
                      {!u.activo && <span className="badge gray">Inactivo</span>}
                      {u.id === currentUid && <span className="badge gray">Vos</span>}
                    </div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
                  {vincular(u) ? `Vinculado a: ${vincular(u)}` : 'Sin vínculo'}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn sm" onClick={() => setModal({ mode: 'editar', user: u })}><Icon name="gear" size={13} /> Editar</button>
                  {u.activo && puedeBorrar ? (
                    <button className="btn sm danger" onClick={() => setABaja(u)} disabled={u.id === currentUid}>
                      <Icon name="x" size={13} /> Dar de baja
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => reactivar(u)}>
                      <Icon name="check" size={13} /> Reactivar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {aBaja && (
        <ConfirmDialog
          title="Dar de baja el acceso"
          sub={aBaja.email}
          confirmLabel="Dar de baja"
          onCancel={() => setABaja(null)}
          onConfirm={() => darDeBaja(aBaja)}
        >
          <div className="col">
            <div className="banner-info">
              <Icon name="info" size={15} />
              <span>
                Se da de baja <b>solo el acceso a la plataforma</b>: la ficha del usuario no se borra y
                el cliente o técnico vinculado queda intacto. Se puede <b>reactivar</b> cuando quieras.
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Al darlo de baja, su sesión deja de servir al instante.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {modal && (
        <FormUsuariosModal
          mode={modal.mode}
          user={modal.user}
          tecnicos={tecnicos}
          clientes={clientes}
          busy={busy}
          onGuardar={guardar}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}