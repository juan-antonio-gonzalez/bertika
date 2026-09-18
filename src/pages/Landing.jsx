import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { PRODUCTOS } from '../data/siteData';
import { useStore } from '../store/store';
import { api } from '../store/api';

export default function Landing() {
  const user = useStore((s) => s.user);
  const [stats, setStats] = useState({ clientes: 0, baterias: 0, activas: 0, entregadas: 0 });

  useEffect(() => {
    let activo = true;
    api('/public/stats')
      .then((s) => { if (activo) setStats(s); })
      .catch(() => { /* estadisticas opcionales */ });
    return () => { activo = false; };
  }, []);

  const dest = user?.rol === 'admin' ? '/hub' : user?.rol === 'tecnico' ? '/tecnico' : user?.rol === 'cliente' ? '/cliente' : '/auth';

  const statList = [
    { n: stats.clientes, l: 'Clientes', ic: 'users' },
    { n: stats.baterias, l: 'Baterías en gestión', ic: 'battery' },
    { n: stats.activas, l: 'Reparaciones en curso', ic: 'tools' },
    { n: stats.entregadas, l: 'Baterías entregadas', ic: 'truck' },
  ];

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg">
          <img src="/img/slide00-drop.jpg" alt="Baterías industriales" />
        </div>
        <div className="wrap">
          <div className="hero-inner">
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <span className="pill"><Icon name="bolt" size={13} /> Taller especializado en baterías industriales</span>
              <span className="pill"><Icon name="shield" size={13} /> Representante oficial de AMSA Forbat</span>
            </div>
            <h1>
              La energía industrial que tu operación necesita, <span className="hl">bajo control</span>
            </h1>
            <p className="lead">
              Recepción, diagnóstico, reparación, prueba de carga y entrega con garantía. Un proceso
              controlado paso a paso con trazabilidad por número de serie y prueba final de capacidad obligatoria.
            </p>
            <div className="ctas">
              <Link to="/productos" className="btn primary lg"><Icon name="bolt" size={18} /> Ver productos</Link>
              <Link to={dest} className="btn lg"><Icon name="user" size={16} /> Ingreso clientes</Link>
              <Link to="/cotizador" className="btn lg"><Icon name="calculator" size={16} /> Cotizador de visita</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cifras */}
      <section className="sec">
        <div className="wrap">
          <h2 className="sec-title" style={{ textAlign: 'center' }}>Nuestro progreso en números</h2>
          <p className="sec-sub" style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 26px' }}>
            Cada batería es un eslabón crítico de tu cadena productiva. Trabajamos para que tu operación nunca se detenga.
          </p>
          <div className="grid4">
            {statList.map((s) => (
              <div key={s.l} className="card" style={{ textAlign: 'center', padding: '22px 14px' }}>
                <span className="chip" style={{ color: 'var(--amber)', width: 46, height: 46, borderRadius: '50%', margin: '0 auto 10px', fontSize: 18 }}>
                  <Icon name={s.ic} size={18} />
                </span>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)' }}>{s.n}</div>
                <p className="card-sub" style={{ margin: '6px 0 0' }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Productos */}
      <section className="sec sec-alt page-light">
        <div className="wrap">
          <h2 className="sec-title" style={{ textAlign: 'center' }}>Nuestras líneas de productos</h2>
          <p className="sec-sub" style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 26px' }}>
            Ferroviarias, tracción, estacionarias, solar y eólico, arranque, especiales y cargadores.
            Diseñadas para las exigencias reales de cada aplicación industrial.
          </p>
          <div className="grid3">
            {PRODUCTOS.slice(0, 6).map((p) => (
              <Link key={p.id} to={`/productos#${p.id}`} className="card pad0" style={{ textDecoration: 'none' }}>
                <img src={p.img} alt={p.titulo} style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--blue)' }}>{p.titulo}</div>
                  <p className="card-sub" style={{ margin: '6px 0 0' }}>{p.desc}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="center" style={{ marginTop: 24 }}>
            <Link to="/productos" className="btn primary lg">Ver todos los productos</Link>
          </div>
        </div>
      </section>

      {/* Empresa */}
      <section className="sec sec-alt" style={{ background: '#fff' }}>
        <div className="wrap">
          <div className="grid2" style={{ alignItems: 'center', gap: 40 }}>
            <div>
              <img src="/img/img-automatizacion.jpg" alt="Automatización industrial" style={{ width: '100%', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }} />
            </div>
            <div>
              <h2 className="sec-title">Nuestra empresa</h2>
              <p className="sec-sub" style={{ marginBottom: 14 }}>
                Bertika® Acumuladores Industriales nació de la unión de dos trayectorias complementarias:
                más de 20 años en automatización y optimización de procesos, y más de 30 años en gestión
                industrial y comercial.
              </p>
              <div className="banner-warn" style={{ marginBottom: 16, maxWidth: 520 }}>
                <Icon name="check" size={15} /> Representante oficial de la empresa AMSA Forbat
              </div>
              <p className="muted" style={{ lineHeight: 1.7, margin: '0 0 20px' }}>
                Fusionamos la precisión de la ingeniería con la visión de negocio y el trabajo directo de taller.
                Nuestra planta cuenta con departamento técnico propio, bancos de carga industriales y un proceso
                controlado paso a paso: ninguna batería sale del taller sin la prueba final de capacidad y carga.
              </p>
              <Link to="/empresa" className="btn primary">Conozca más</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Ecología */}
      <section className="sec" style={{ backgroundColor: '#0a1740' }}>
        <div className="wrap">
          <div className="grid2" style={{ alignItems: 'center', gap: 40 }}>
            <div>
              <img src="/img/img-mundo.jpg" alt="Reciclaje de baterías" style={{ width: '100%', borderRadius: 12 }} />
            </div>
            <div style={{ color: '#fff' }}>
              <h2 className="sec-title" style={{ color: '#fff' }}>Comprometidos con el medio ambiente</h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 16px' }}>
                A nivel de gestión de recursos, los acumuladores eléctricos usados se consideran como una
                fuente de materias primas secundarias. Metales, plásticos y ácidos son recolectados,
                clasificados y desviados de los residuos urbanos hacia operaciones de reutilización autorizadas.
              </p>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
                <span className="pill"><Icon name="check" size={12} /> Reciclaje responsable</span>
                <span className="pill"><Icon name="check" size={12} /> Operaciones autorizadas</span>
                <span className="pill"><Icon name="check" size={12} /> Menos residuos urbanos</span>
              </div>
              <Link to="/politica-ecologica" className="btn lg">Conocé nuestra política ecológica</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}