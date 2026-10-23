import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui';
import { useStore } from '../store/store';
import { api } from '../store/api';

export default function Seguimiento() {
  const toastShow = useStore((s) => s.toastShow);
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  // El campo acepta las dos formas de busqueda:
  //  - codigo de seguimiento: solo digitos; se formatea con guion cada 4 cifras.
  const alEscribir = (e) => {
    const v = e.target.value;
    if (/^[\d\s-]*$/.test(v)) {
      const digitos = v.replace(/\D/g, '').slice(0, 16);
      setQ(digitos.replace(/(.{4})/g, '$1-').replace(/-$/, ''));
    } else {
      setQ(v.slice(0, 64));
    }
  };

  const buscar = async (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) { toastShow('Ingresá el código de seguimiento (16 dígitos)', 'warn'); return; }
    // Se navega con los digitos que escribio el cliente: el endpoint publico de
    // busqueda no devuelve el codigo (el cliente ya lo tiene en el comprobante),
    // asi que leerlo de la respuesta llevaba a /tracker/undefined.
    const digitos = term.replace(/\D/g, '');
    try {
      // El seguimiento publico se resuelve SOLO con el codigo de 16 digitos del
      // comprobante: antes tambien aceptaba el numero de serie y el id interno,
      // y eso dejaba listar todas las ordenes del taller sin sesion.
      const rows = await api(`/public/ordenes?q=${encodeURIComponent(digitos)}`);
      if (rows.length === 1 && digitos.length === 16) {
        navigate(`/tracker/${digitos}`);
      } else if (digitos.length === 16) {
        toastShow('No se encontró ninguna orden con ese código. Revisá los 16 dígitos del comprobante.', 'error');
      } else {
        toastShow('Ingresá el código de seguimiento completo (16 dígitos, como figura en el comprobante).', 'warn');
      }
    } catch (err) {
      toastShow(err.message || 'No se pudo realizar la busqueda', 'error');
    }
  };

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg"><img src="/img/slide00-drop.jpg" alt="" /></div>
        <div className="wrap">
          <h1>Seguimiento</h1>
          <div className="breadcrumb"><Link to="/">Home</Link> / Seguimiento</div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap" style={{ maxWidth: 600 }}>
          <div className="card" style={{ padding: 32 }}>
            <h2 className="sec-title center">Seguí tu reparación</h2>
            <p className="sec-sub center" style={{ margin: '8px auto 24px' }}>
              Ingresá tu código de seguimiento de 16 dígitos (está en el comprobante que te dio el taller) para ver el estado en tiempo real.
            </p>
            <form onSubmit={buscar} style={{ display: 'flex', gap: 10 }}>
              <input
                className="input"
                placeholder="0000-0000-0000-0000"
                autoComplete="off"
                value={q}
                onChange={alEscribir}
                style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.5px' }}
              />
              <button className="btn primary lg" type="submit">
                <Icon name="search" size={16} /> Buscar
              </button>
            </form>
            <p className="muted center" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
              El código viene en el comprobante y en el mensaje de WhatsApp que te enviamos.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
