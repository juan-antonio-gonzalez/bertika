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
  //  - numero de serie: texto libre (letras, digitos y guiones), sin formatear.
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
    if (!term) { toastShow('Ingresá el código de seguimiento o el número de serie', 'warn'); return; }
    try {
      const rows = await api(`/public/ordenes?q=${encodeURIComponent(term)}`);
      const norm = term.toUpperCase();
      const dig = norm.replace(/\D/g, '');
      const exact = rows.find((o) => o.id.toUpperCase() === norm
        || (o.bateria_serie || '').toUpperCase() === norm
        || (dig.length === 16 && (o.codigo || '').replace(/\D/g, '') === dig));
      if (exact) {
        navigate(`/tracker/${exact.id}`);
      } else if (rows.length === 1) {
        navigate(`/tracker/${rows[0].id}`);
      } else {
        toastShow(rows.length > 1 ? 'Se encontraron varias ordenes. Ingresá el código completo.' : 'No se encontró ninguna orden con ese dato', rows.length > 1 ? 'warn' : 'error');
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
              Ingresá tu código de seguimiento de 16 dígitos —o el número de serie de la batería— para ver el estado en tiempo real.
            </p>
            <form onSubmit={buscar} style={{ display: 'flex', gap: 10 }}>
              <input
                className="input"
                placeholder="0000-0000-0000-0000 o N° de serie"
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
              También podés buscar por número de serie de la batería.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
