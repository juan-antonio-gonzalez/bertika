import { useState } from 'react';
import { useStore } from '../store/store';
import { Icon } from './ui';
import { CANALES_ORIGEN, TIPOS_CLIENTE } from '../data/crm.js';

// Acciones globales de la plataforma (las dispara la topbar del AppShell).
// Vivian dentro de Hub.jsx: se movieron aca para que esten disponibles en
// cualquier pantalla autenticada sin arrastrar el chunk del Hub.

/* ---------------- Altas: cliente / tecnico / insumo ---------------- */
export function AltasForm({ onClose }) {
  const crearCliente = useStore((s) => s.crearCliente);
  const crearTecnico = useStore((s) => s.crearTecnico);
  const crearInsumo = useStore((s) => s.crearInsumo);
  const [tipo, setTipo] = useState('cliente');
  const [cliente, setCliente] = useState({
    nombre: '', empresa: '', email: '', telefono: '', tipo: 'particular',
    direccion: '', localidad: '', cuit: '', condicion_pago: '', canal_origen: '', vendedor: '',
  });
  const [tecnico, setTecnico] = useState({ nombre: '', especialidad: '', certificaciones: '' });
  const [insumo, setInsumo] = useState({ nombre: '', categoria: '', stock: '', precio: '' });
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setBusy(true);
    if (tipo === 'cliente') {
      await crearCliente(cliente);
    } else if (tipo === 'tecnico') {
      await crearTecnico({ ...tecnico, certificaciones: tecnico.certificaciones.split(',').map((c) => c.trim()).filter(Boolean) });
    } else {
      await crearInsumo({ ...insumo, stock: Number(insumo.stock) || 0, precio: Number(insumo.precio) || 0 });
    }
    setBusy(false);
    onClose();
  };

  return (
    <div>
      <div className="tabs mb16">
        <button className={`tab ${tipo === 'cliente' ? 'active' : ''}`} onClick={() => setTipo('cliente')}><Icon name="building" size={13} /> Cliente</button>
        <button className={`tab ${tipo === 'tecnico' ? 'active' : ''}`} onClick={() => setTipo('tecnico')}><Icon name="users" size={13} /> Tecnico</button>
        <button className={`tab ${tipo === 'insumo' ? 'active' : ''}`} onClick={() => setTipo('insumo')}><Icon name="box" size={13} /> Insumo</button>
      </div>

      {tipo === 'cliente' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre del cliente" /></div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>Empresa / flotilla</label>
              <input className="input" value={cliente.empresa} onChange={(e) => setCliente({ ...cliente, empresa: e.target.value })} placeholder="ej. Transportes La Union" />
            </div>
            <div className="field" style={{ width: 220 }}>
              <label>Tipo</label>
              <select className="input" value={cliente.tipo} onChange={(e) => setCliente({ ...cliente, tipo: e.target.value })}>
                {TIPOS_CLIENTE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Email</label><input className="input" type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} placeholder="cliente@empresa.com" /></div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Teléfono</label><input className="input" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} placeholder="11 5555-0101" /></div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            Datos comerciales (opcionales, se pueden completar después):
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}><label>Dirección</label><input className="input" value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} placeholder="Calle y número" /></div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Localidad</label><input className="input" value={cliente.localidad} onChange={(e) => setCliente({ ...cliente, localidad: e.target.value })} placeholder="Ciudad / partido" /></div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="field" style={{ width: 180 }}><label>CUIT</label><input className="input" value={cliente.cuit} onChange={(e) => setCliente({ ...cliente, cuit: e.target.value })} placeholder="30-12345678-9" /></div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Condición de pago</label><input className="input" value={cliente.condicion_pago} onChange={(e) => setCliente({ ...cliente, condicion_pago: e.target.value })} placeholder="Contado / 30 días" /></div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Cómo nos conoció</label>
              <input className="input" list="canales-origen" value={cliente.canal_origen} onChange={(e) => setCliente({ ...cliente, canal_origen: e.target.value })} placeholder="WhatsApp, recomendación…" />
              <datalist id="canales-origen">
                {CANALES_ORIGEN.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Vendedor</label><input className="input" value={cliente.vendedor} onChange={(e) => setCliente({ ...cliente, vendedor: e.target.value })} placeholder="Quién lo atiende" /></div>
          </div>
        </div>
      )}

      {tipo === 'tecnico' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={tecnico.nombre} onChange={(e) => setTecnico({ ...tecnico, nombre: e.target.value })} placeholder="Nombre del tecnico" /></div>
          <div className="field"><label>Especialidad</label><input className="input" value={tecnico.especialidad} onChange={(e) => setTecnico({ ...tecnico, especialidad: e.target.value })} placeholder="ej. Plomo-Acido" /></div>
          <div className="field"><label>Certificaciones (separadas por coma)</label><input className="input" value={tecnico.certificaciones} onChange={(e) => setTecnico({ ...tecnico, certificaciones: e.target.value })} placeholder="ej. Cert. Bosch, Seguridad industrial" /></div>
        </div>
      )}

      {tipo === 'insumo' && (
        <div className="col">
          <div className="field"><label>Nombre</label><input className="input" value={insumo.nombre} onChange={(e) => setInsumo({ ...insumo, nombre: e.target.value })} placeholder="ej. Acido sulfurico" /></div>
          <div className="field"><label>Categoría</label><input className="input" value={insumo.categoria} onChange={(e) => setInsumo({ ...insumo, categoria: e.target.value })} placeholder="ej. Insumo / Repuesto" /></div>
          <div className="row">
            <div className="field"><label>Stock inicial</label><input className="input" type="number" value={insumo.stock} onChange={(e) => setInsumo({ ...insumo, stock: e.target.value })} placeholder="0" /></div>
            <div className="field"><label>Precio unitario (ARS)</label><input className="input" type="number" value={insumo.precio} onChange={(e) => setInsumo({ ...insumo, precio: e.target.value })} placeholder="0" /></div>
          </div>
        </div>
      )}

      <button className="btn primary block lg" disabled={busy} onClick={guardar}><Icon name="plus" size={15} /> {busy ? 'Guardando...' : 'Dar de alta'}</button>
    </div>
  );
}

/* ---------------- Nueva orden de trabajo ---------------- */
export function NewOrdenForm({ onClose }) {
  const data = useStore((s) => s.data);
  const addOrder = useStore((s) => s.addOrder);
  const [serie, setSerie] = useState('');
  const [existe, setExiste] = useState(true);
  const batSel = data.baterias.find((b) => b.numero_serie === serie);
  const [tipo, setTipo] = useState('Plomo-Acido');
  const [volt, setVolt] = useState('12V');
  const [cap, setCap] = useState('');
  const [aplic, setAplic] = useState('Automotriz');
  const [maMa, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [equipo, setEquipo] = useState('');
  const [cli, setCli] = useState('');
  const [falla, setFalla] = useState('');

  const onSerie = (val) => {
    setSerie(val);
    const b = data.baterias.find((x) => x.numero_serie === val);
    setExiste(!!b);
    if (b) {
      setTipo(b.tipo); setVolt(b.voltaje); setCap(b.capacidad); setAplic(b.aplicacion);
      setMarca(b.marca); setModelo(b.modelo); setEquipo(b.equipo);
      if (!cli) setCli(b.cliente_id);
    }
  };

  const batData = batSel || null;

  return (
    <div className="col">
      <div className="field"><label>Numero de serie</label><input className="input mono" value={serie} onChange={(e) => onSerie(e.target.value)} placeholder='ej. BAT-AUT-004' /></div>
      {serie && existe && batData && (
        <div className="banner-green"><Icon name="battery" size={15} /> Bateria existente: {batData.tipo} {batData.voltaje} {batData.capacidad}Ah · {batData.equipo} · Cliente: {data.clientes.find((c) => c.id === batData.cliente_id)?.nombre}</div>
      )}
      {serie && !existe && (
        <>
          <div className="banner-warn"><Icon name="warn" size={15} /> Serie nueva: se registrara la bateria en el sistema.</div>
          <div className="grid2">
            <div className="field"><label>Tipo</label>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {['Plomo-Acido', 'AGM', 'Gel', 'Litio (Ion-Litio)', 'Ni-Cd'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Voltaje</label>
              <select className="input" value={volt} onChange={(e) => setVolt(e.target.value)}>
                {['6V', '12V', '24V', '36V', '48V', '72V', '96V'].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Capacidad (Ah)</label><input className="input" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="ej. 60" /></div>
            <div className="field"><label>Aplicacion</label>
              <select className="input" value={aplic} onChange={(e) => setAplic(e.target.value)}>
                {['Automotriz', 'Autoelevador', 'Ferroviario', 'Industrial/UPS', 'Marino'].map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="field"><label>Marca</label><input className="input" value={maMa} onChange={(e) => setMarca(e.target.value)} /></div>
            <div className="field"><label>Modelo</label><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Equipo asociado</label><input className="input" value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="ej. Montacargas Toyota 8FGU25 - Unidad 9" /></div>
          </div>
        </>
      )}
      <div className="field"><label>Cliente</label>
        <select className="input" value={cli} onChange={(e) => setCli(e.target.value)}>
          <option value="">— Seleccionar cliente —</option>
          {data.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field"><label>Falla reportada / motivo de ingreso</label><textarea className="input" value={falla} onChange={(e) => setFalla(e.target.value)} placeholder="ej. No mantiene carga en operacion" /></div>
      <button className="btn primary block lg" disabled={!serie || !cli || !falla || (!existe && !cap)} onClick={() => { addOrder({
        serie, tipo, voltaje: volt, capacidad: cap, aplicacion: aplic, marca: maMa, modelo, equipo, cliente_id: cli, falla,
      }); onClose(); }}>
        <Icon name="plus" size={16} /> Crear orden de trabajo
      </button>
    </div>
  );
}
