import { useEffect, useState } from 'react';
import { Icon, Modal, ConfirmDialog, FormGrid, fmtFecha } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { api, setToken } from '../store/api';
import { useStore, usePermiso } from '../store/store';
import MatrizPermisos from '../components/MatrizPermisos';
import MatrizAreas from '../components/MatrizAreas';
import { AREAS_SEMILLA, normalizarAreas } from '../data/listas';
import { PasswordPair } from '../components/PasswordFields';
import { validarPassword, PASSWORD_MIN } from '../data/passwordPolicy';
import {
  CLAVES, PERMISOS, permisosPorDefecto, normalizarPermisos, resumenPermisos,
} from '../data/permisos';

const MAPA_VACIO = Object.fromEntries(CLAVES.map((k) => [k, false]));
const ROL_LABEL = { admin: 'Administrador', tecnico: 'Personal interno', cliente: 'Cliente' };

const fechaCorta = (iso) => (iso ? fmtFecha(iso) : 'Nunca');

function FormUsuariosModal({ mode, user, tecnicos, clientes, categorias, busy, onGuardar, onClose }) {
  const soyAdmin = useStore((s) => s.user?.rol === 'admin');
  const uid = useStore((s) => s.user?.uid);
  const toastShow = useStore((s) => s.toastShow);
  const esEdicion = mode === 'editar';
  const edicionPropia = esEdicion && user.id === uid;
  const [email, setEmail] = useState(esEdicion ? user.email : '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [rol, setRol] = useState(esEdicion ? user.rol : 'tecnico');
  const [tecnicoId, setTecnicoId] = useState(esEdicion ? user.tecnico_id || '' : '');
  const [clienteId, setClienteId] = useState(esEdicion ? user.cliente_id || '' : '');
  const [categoriaId, setCategoriaId] = useState(esEdicion ? user.categoria_id || '' : '');
  const [twofaEmail, setTwofaEmail] = useState(Boolean(esEdicion && user.twofa_email));
  const [permisos, setPermisos] = useState(() => (
    esEdicion ? normalizarPermisos(user.permisos, user.rol) : { ...MAPA_VACIO }
  ));
  const rolFinal = edicionPropia ? user.rol : rol;

  const categoria = categorias.find((c) => c.id === categoriaId) || null;
  const personalizado = Boolean(categoria) && CLAVES.some((k) => Boolean(permisos[k]) !== Boolean(categoria.permisos[k]));

  const cambiarRol = (nuevo) => {
    setRol(nuevo);
    setCategoriaId('');
    // Un usuario nuevo arranca sin permisos: el admin elige categoría o
    // plantilla. Nunca se regala el paquete completo por defecto.
    setPermisos(nuevo === 'tecnico' ? { ...MAPA_VACIO } : permisosPorDefecto(nuevo));
  };

  const cambiarCategoria = (id) => {
    setCategoriaId(id);
    const cat = categorias.find((c) => c.id === id);
    if (cat) setPermisos(normalizarPermisos(cat.permisos, 'tecnico'));
  };

  const volverACategoria = () => {
    if (categoria) setPermisos(normalizarPermisos(categoria.permisos, 'tecnico'));
  };

  const submit = (e) => {
    e.preventDefault();
    const emailT = email.trim();
    if (!emailT) {
      toastShow('El email es obligatorio.', 'warn');
      return;
    }
    if (!esEdicion && !password) {
      toastShow('La contraseña es obligatoria para crear el usuario.', 'warn');
      return;
    }
    if (password || password2) {
      if (password !== password2) {
        toastShow('Las contraseñas no coinciden.', 'warn');
        return;
      }
      const error = validarPassword(password, { email: emailT });
      if (error) {
        toastShow(error, 'warn');
        return;
      }
    }
    if (rolFinal === 'admin' && !soyAdmin) {
      toastShow('Solo un administrador puede crear otro administrador.', 'warn');
      return;
    }
    const body = {};
    if (!esEdicion || soyAdmin) body.email = emailT;
    if (password) body.password = password;
    if (!esEdicion || soyAdmin) {
      if (!edicionPropia) body.rol = rol;
      if (rol === 'tecnico') body.tecnico_id = tecnicoId || null;
      if (rol === 'cliente') body.cliente_id = clienteId || null;
    }
    if (soyAdmin) {
      body.permisos = permisos;
      body.twofa_email = Boolean(twofaEmail);
      body.categoria_id = rolFinal === 'tecnico' ? (categoriaId || null) : null;
    }
    onGuardar(body);
  };

  return (
    <Modal
      size="xl"
      title={esEdicion ? `Editar ${user.email}` : 'Crear usuario'}
      sub={esEdicion ? 'Cuenta, categoría, contraseña y permisos.' : 'Nueva cuenta de acceso a la plataforma.'}
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
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={esEdicion && !soyAdmin}
                data-autofocus
              />
              <small className="ayuda">
                {soyAdmin ? 'Es el usuario para entrar y donde llegan el reset y el 2FA.' : 'Solo un administrador puede cambiarlo.'}
              </small>
            </div>
            <div className="field">
              <label>Rol</label>
              <select className="input" value={rolFinal} onChange={(e) => cambiarRol(e.target.value)} disabled={edicionPropia || !soyAdmin}>
                <option value="admin">Administrador</option>
                <option value="tecnico">Personal interno</option>
                <option value="cliente">Cliente</option>
              </select>
              {edicionPropia && <small className="ayuda">No podés cambiarte el rol a vos mismo.</small>}
              {!edicionPropia && rolFinal === 'tecnico' && <small className="ayuda">Incluye técnicos y administrativos. Elegí una categoría o plantilla abajo.</small>}
            </div>

            {(!esEdicion || soyAdmin) && (
              <PasswordPair
                password={password}
                setPassword={setPassword}
                confirm={password2}
                setConfirm={setPassword2}
                label={esEdicion ? 'Nueva contraseña' : 'Contraseña *'}
                help={esEdicion
                  ? `Dejalo vacío para conservar la actual. Mínimo ${PASSWORD_MIN} caracteres.`
                  : `Mínimo ${PASSWORD_MIN} caracteres, sin datos personales ni claves comunes.`}
                required={!esEdicion}
                email={email}
                confirmLabel={esEdicion ? 'Repetir nueva contraseña' : 'Repetir contraseña'}
              />
            )}

            {esEdicion && !soyAdmin && (
              <div className="banner-info" style={{ marginTop: 10 }}>
                <Icon name="shield" size={15} />
                <span>Solo un administrador puede cambiar la contraseña de otra cuenta. Usá “Enviar reset” o pedile al administrador.</span>
              </div>
            )}

            {rolFinal === 'tecnico' && (
              <div className="field">
                <label>Categoría de acceso</label>
                <select className="input" value={categoriaId} onChange={(e) => cambiarCategoria(e.target.value)} disabled={!soyAdmin}>
                  <option value="">Personalizada (sin categoría)</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} · {c.usuarios} usuario(s)</option>
                  ))}
                </select>
                <small className="ayuda">
                  La categoría precarga la matriz. Después podés personalizar los permisos de esta persona.
                  {categorias.length === 0 && ' Creá categorías en la pestaña Categorías.'}
                </small>
              </div>
            )}

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

            {rolFinal !== 'tecnico' && (
              <div className="field">
                <label>Categoría de acceso</label>
                <input className="input" value="No aplica a este rol" readOnly />
                <small className="ayuda">
                  Las categorías agrupan permisos del <b>Personal interno</b>. Para asignar una,
                  cambiá el rol a <b>Personal interno</b>.
                  {rolFinal === 'admin'
                    ? ' El administrador ya tiene todos los permisos.'
                    : ' El cliente solo ve su portal.'}
                </small>
              </div>
            )}
          </FormGrid>

          {!edicionPropia && (
            <div className="field" style={{ marginTop: 14 }}>
              <label className="check-line" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <input
                  type="checkbox"
                  checked={twofaEmail}
                  onChange={(e) => setTwofaEmail(e.target.checked)}
                  disabled={!soyAdmin}
                />
                <span>Pedir un código por email al iniciar sesión (doble factor)</span>
              </label>
              <small className="ayuda">Se envía a {email || 'el email de la cuenta'}. Si el correo falla, la persona no podrá entrar hasta que un admin lo desactive.</small>
            </div>
          )}
        </div>

        <div className="col" style={{ marginTop: rolFinal === 'tecnico' ? 0 : 18 }}>
          <div className="fsec-head">
            <h4>Permisos</h4>
            <p>Qué ve y qué puede hacer. Rigen al instante: no hace falta que vuelva a entrar.</p>
          </div>
          {!soyAdmin && (
            <div className="banner-info" style={{ marginBottom: 10 }}>
              <Icon name="shield" size={15} />
              <span>Solo un administrador puede cambiar la matriz de permisos, las categorías o el doble factor. Podés editar los datos de la cuenta.</span>
            </div>
          )}
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
            <>
              {personalizado && (
                <div className="banner-info" style={{ marginBottom: 10 }}>
                  <Icon name="info" size={15} />
                  <span>
                    Esta persona tiene permisos personalizados respecto de la categoría <b>{categoria?.nombre}</b>.
                  </span>
                  <button type="button" className="chip" onClick={volverACategoria} style={{ marginLeft: 'auto' }}>
                    Volver a la categoría
                  </button>
                </div>
              )}
              <MatrizPermisos
                permisos={permisos}
                setPermisos={setPermisos}
                disabled={!soyAdmin || busy}
              />
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

function FormCategoriaModal({ mode, categoria, areasCatalogo, busy, onGuardar, onClose }) {
  const toastShow = useStore((s) => s.toastShow);
  const [nombre, setNombre] = useState(categoria?.nombre || '');
  const [descripcion, setDescripcion] = useState(categoria?.descripcion || '');
  const [permisos, setPermisos] = useState(() => (
    categoria ? normalizarPermisos(categoria.permisos, 'tecnico') : { ...MAPA_VACIO }
  ));
  const [areas, setAreas] = useState(() => normalizarAreas(categoria?.areas));
  const [aplicarUsuarios, setAplicarUsuarios] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      toastShow('Poné un nombre de al menos 2 caracteres.', 'warn');
      return;
    }
    onGuardar({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      permisos,
      areas,
      aplicarUsuarios: Boolean(aplicarUsuarios && mode === 'editar'),
    });
  };

  const usuarios = categoria?.usuarios || 0;

  return (
    <Modal
      size="xl"
      title={mode === 'editar' ? `Editar categoría: ${categoria.nombre}` : 'Nueva categoría de acceso'}
      sub="Agrupá permisos con un nombre y asigná usuarios a esa categoría."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn izq" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" form="form-categoria" className="btn primary" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando...' : mode === 'editar' ? 'Guardar categoría' : 'Crear categoría'}
          </button>
        </>
      )}
    >
      <form id="form-categoria" onSubmit={submit}>
        <FormGrid cols={2}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Depósito, Ventas, Administración" data-autofocus />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué sirve esta categoría" />
          </div>
        </FormGrid>

        <div className="fsec-head" style={{ marginTop: 18 }}>
          <h4>Áreas y listas</h4>
          <p>Qué espacios ve esta categoría en el menú y si puede crear listas, cargar registros o administrar vistas.</p>
        </div>
        <MatrizAreas areas={areasCatalogo} valor={areas} onChange={setAreas} disabled={busy} />

        <div className="fsec-head" style={{ marginTop: 18 }}>
          <h4>Módulos del taller</h4>
          <p>Es una plantilla. Al asignar la categoría a un usuario, su matriz se precarga con esto; después se puede personalizar.</p>
        </div>
        <MatrizPermisos permisos={permisos} setPermisos={setPermisos} disabled={busy} />

        {mode === 'editar' && usuarios > 0 && (
          <label className="check-line" style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={aplicarUsuarios} onChange={(e) => setAplicarUsuarios(e.target.checked)} />
            <span>Aplicar estos permisos ahora a los {usuarios} usuario(s) de esta categoría (sobrescribe personalizaciones).</span>
          </label>
        )}
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const currentUid = useStore((s) => s.user?.uid);
  const soyAdmin = useStore((s) => s.user?.rol === 'admin');
  const puedeBorrar = usePermiso('borrar_usuarios');
  const puedeCrear = usePermiso('crear_usuarios');
  const puedeEditar = usePermiso('editar_usuarios');
  const tecnicos = useStore((s) => s.data.tecnicos);
  const clientes = useStore((s) => s.data.clientes);
  const areasCatalogo = useStore((s) => s.data.areas);
  const toastShow = useStore((s) => s.toastShow);

  const [vista, setVista] = useState('usuarios');
  const [lista, setLista] = useState(null);
  const [categorias, setCategorias] = useState(null);
  const [modal, setModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [catBusy, setCatBusy] = useState(false);
  const [aBaja, setABaja] = useState(null);
  const [aReset, setAReset] = useState(null);
  const [catABorrar, setCatABorrar] = useState(null);
  const [filtroCat, setFiltroCat] = useState('');

  const cargar = async () => {
    try {
      setLista(await api('/usuarios'));
    } catch {
      setLista([]);
    }
  };

  const cargarCategorias = async () => {
    try {
      setCategorias(await api('/categorias'));
    } catch {
      setCategorias([]);
    }
  };

  // Refresca la lista antes de abrir el formulario: si otra persona creó una
  // categoría en otra pestaña, o la página quedó abierta, el desplegable no
  // puede quedar con datos viejos.
  const abrirUsuario = async (data) => {
    await cargarCategorias();
    setModal(data);
  };

  useEffect(() => { cargar(); cargarCategorias(); }, []);

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
        const res = await api(`/usuarios/${modal.user.id}`, { method: 'PATCH', body: payload });
        if (res?.token) setToken(res.token);
        toastShow(payload.password ? 'Contraseña actualizada. La sesión sigue abierta.' : 'Cambios guardados', 'ok');
      }
      setModal(null);
      await Promise.all([cargar(), cargarCategorias()]);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guardarCategoria = async (payload) => {
    setCatBusy(true);
    try {
      if (catModal.mode === 'crear') {
        await api('/categorias', { method: 'POST', body: payload });
        toastShow('Categoría creada', 'ok');
      } else {
        const res = await api(`/categorias/${catModal.categoria.id}`, { method: 'PATCH', body: payload });
        toastShow(res.aplicados ? `Categoría actualizada y aplicada a ${res.aplicados} usuario(s)` : 'Categoría actualizada', 'ok');
      }
      setCatModal(null);
      await Promise.all([cargarCategorias(), cargar()]);
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setCatBusy(false);
    }
  };

  const borrarCategoria = async (c) => {
    try {
      await api(`/categorias/${c.id}`, { method: 'DELETE' });
      setCatABorrar(null);
      await cargarCategorias();
      toastShow(`Categoría ${c.nombre} eliminada`, 'warn');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

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

  const enviarReset = async (u) => {
    try {
      const res = await api(`/usuarios/${u.id}/reset`, { method: 'POST' });
      setAReset(null);
      toastShow(`Enlace de restablecimiento enviado a ${res.email}`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const desbloquear = async (u) => {
    try {
      await api(`/usuarios/${u.id}/desbloquear`, { method: 'POST' });
      await cargar();
      toastShow(`${u.email}: cuenta desbloqueada`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const listaFiltrada = (lista || []).filter((u) => !filtroCat || u.categoria_id === filtroCat);
  const bloqueado = (u) => u.bloqueado_hasta && new Date(u.bloqueado_hasta).getTime() > Date.now();

  return (
    <div className="wrap page">
      <PageHeader
        group="Sistema"
        title="Usuarios y accesos"
        sub="Cuentas, categorías, permisos, doble factor y recuperación de contraseñas."
        actions={(
          <>
            {vista === 'usuarios' && puedeCrear && (
              <button className="btn primary sm" onClick={() => abrirUsuario({ mode: 'crear' })}>
                <Icon name="plus" size={14} /> Crear usuario
              </button>
            )}
            {vista === 'categorias' && soyAdmin && (
              <button className="btn primary sm" onClick={() => setCatModal({ mode: 'crear' })}>
                <Icon name="plus" size={14} /> Nueva categoría
              </button>
            )}
          </>
        )}
      />

      <div className="tabs mb16" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'usuarios'}
          className={`tab${vista === 'usuarios' ? ' active' : ''}`}
          onClick={() => { setVista('usuarios'); cargarCategorias(); }}
        >
          Usuarios {lista ? `(${lista.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'categorias'}
          className={`tab${vista === 'categorias' ? ' active' : ''}`}
          onClick={() => { setVista('categorias'); cargarCategorias(); }}
        >
          Categorías {categorias ? `(${categorias.length})` : ''}
        </button>
      </div>

      {vista === 'usuarios' && (
        <>
          <div className="row between wrap mb16" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Categoría:</span>
              <select className="input" style={{ width: 260 }} value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
                <option value="">Todas las categorías</option>
                {(categorias || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{listaFiltrada.length} usuario(s)</span>
          </div>

          <div className="col" style={{ gap: 10 }}>
            {!lista ? (
              <p className="muted">Cargando usuarios...</p>
            ) : listaFiltrada.length === 0 ? (
              <div className="card"><p className="muted">No hay usuarios con ese filtro. Creá el primero o cambiá la categoría.</p></div>
            ) : (
              listaFiltrada.map((u) => (
                <div key={u.id} className="card" style={{ opacity: u.activo ? 1 : 0.62 }}>
                  <div className="row between wrap" style={{ gap: 12 }}>
                    <div className="row" style={{ gap: 12, minWidth: 260 }}>
                      <span className="avatar">{(u.email?.[0] || '?').toUpperCase()}</span>
                      <div>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <b>{u.email}</b>
                          {u.id === currentUid && <span className="badge gray">Vos</span>}
                          {!u.activo && <span className="badge gray">Inactivo</span>}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className={`badge ${u.rol === 'admin' ? 'amber' : u.rol === 'tecnico' ? 'blue' : 'green'}`}>{ROL_LABEL[u.rol] || u.rol}</span>
                          {u.categoria_nombre && <span className="badge blue">{u.categoria_nombre}</span>}
                          <span className="badge gray">{resumenPermisos(u)}</span>
                          {u.twofa_email && <span className="badge green">2FA email</span>}
                          {bloqueado(u) && <span className="badge red">Bloqueado</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          Último acceso: {fechaCorta(u.ultimo_acceso)} · {vincular(u) ? `Vinculado a: ${vincular(u)}` : 'Sin vínculo'}
                        </div>
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {puedeEditar && (
                        <button className="btn sm" onClick={() => abrirUsuario({ mode: 'editar', user: u })}>
                          <Icon name="gear" size={13} /> Editar
                        </button>
                      )}
                      {soyAdmin && u.activo && (
                        <button className="btn sm" onClick={() => setAReset(u)} title="Enviar un enlace para que defina su contraseña">
                          <Icon name="mail" size={13} /> Enviar reset
                        </button>
                      )}
                      {soyAdmin && bloqueado(u) && (
                        <button className="btn sm" onClick={() => desbloquear(u)}>
                          <Icon name="refresh" size={13} /> Desbloquear
                        </button>
                      )}
                      {u.activo && puedeBorrar ? (
                        <button className="btn sm danger" onClick={() => setABaja(u)} disabled={u.id === currentUid}>
                          <Icon name="x" size={13} /> Dar de baja
                        </button>
                      ) : !u.activo && (
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
        </>
      )}

      {vista === 'categorias' && (
        <>
          {!categorias ? (
            <p className="muted">Cargando categorías...</p>
          ) : categorias.length === 0 ? (
            <div className="card">
              <h3 className="card-title"><Icon name="users" size={15} /> Todavía no hay categorías</h3>
              <p className="muted">Creá una categoría como “Depósito”, “Ventas” o “Administración” y marcale qué áreas puede ver y usar. Después asignala a cada usuario.</p>
              {soyAdmin && (
                <button className="btn primary" onClick={() => setCatModal({ mode: 'crear' })}>
                  <Icon name="plus" size={14} /> Crear la primera categoría
                </button>
              )}
            </div>
          ) : (
            <div className="cat-grid">
              {categorias.map((c) => {
                const habilitados = CLAVES.filter((k) => c.permisos?.[k]).length;
                const criticos = PERMISOS.filter((p) => p.critica && c.permisos?.[p.clave]).length;
                return (
                  <div key={c.id} className="card cat-card">
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <div>
                        <h3 className="card-title" style={{ margin: 0 }}>{c.nombre}</h3>
                        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                          {c.descripcion || 'Sin descripción'}
                        </p>
                      </div>
                      <span className="badge blue">{c.usuarios} usuario(s)</span>
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                      <span className="badge gray">{habilitados} de {CLAVES.length} permisos</span>
                      {criticos > 0 && <span className="badge amber">{criticos} crítico(s)</span>}
                      {c.actualizado_en && <span className="badge gray">Actualizada {fechaCorta(c.actualizado_en)}</span>}
                    </div>
                    {soyAdmin && (
                      <div className="row" style={{ gap: 8, marginTop: 14 }}>
                        <button className="btn sm" onClick={() => setCatModal({ mode: 'editar', categoria: c })}>
                          <Icon name="gear" size={13} /> Editar
                        </button>
                        <button className="btn sm danger" onClick={() => setCatABorrar(c)} disabled={c.usuarios > 0} title={c.usuarios > 0 ? 'Reasigná los usuarios antes de eliminarla' : 'Eliminar'}>
                          <Icon name="x" size={13} /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

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

      {aReset && (
        <ConfirmDialog
          title="Enviar enlace de restablecimiento"
          sub={aReset.email}
          confirmLabel="Enviar enlace"
          onCancel={() => setAReset(null)}
          onConfirm={() => enviarReset(aReset)}
        >
          <p className="muted" style={{ margin: 0 }}>
            Le vamos a enviar un correo con un enlace de un solo uso para que defina una contraseña nueva.
            El enlace vence en 30 minutos. No se envía ninguna contraseña por correo.
          </p>
        </ConfirmDialog>
      )}

      {catABorrar && (
        <ConfirmDialog
          title="Eliminar categoría"
          sub={catABorrar.nombre}
          confirmLabel="Eliminar"
          onCancel={() => setCatABorrar(null)}
          onConfirm={() => borrarCategoria(catABorrar)}
        >
          <p className="muted" style={{ margin: 0 }}>
            La categoría se elimina del catálogo. Los usuarios que la tengan asignada deben reasignarse antes
            (por eso el botón se desactiva si tiene usuarios).
          </p>
        </ConfirmDialog>
      )}

      {modal && (
        <FormUsuariosModal
          mode={modal.mode}
          user={modal.user}
          tecnicos={tecnicos}
          clientes={clientes}
          categorias={categorias || []}
          busy={busy}
          onGuardar={guardar}
          onClose={() => setModal(null)}
        />
      )}

      {catModal && (
        <FormCategoriaModal
          mode={catModal.mode}
          categoria={catModal.categoria}
          areasCatalogo={areasCatalogo?.length ? areasCatalogo : AREAS_SEMILLA}
          busy={catBusy}
          onGuardar={guardarCategoria}
          onClose={() => setCatModal(null)}
        />
      )}
    </div>
  );
}
