import { Link } from 'react-router-dom';
import { Icon, ResetDemoBtn } from '../components/ui';

const servicios = [
  { name: 'Automotriz', icon: 'car', desc: 'Baterias de arranque para autos, SUV y camionetas ligeras con diagnostico por resistencia interna.' },
  { name: 'Autoelevadores', icon: 'truck', desc: 'Bancos de 24V a 96V para montacargas: litio y plomo-acido con prueba de capacidad en Ah.' },
  { name: 'Ferroviario', icon: 'train', desc: 'Bancos Ni-Cd y de arranque para locomotora, con soporte certificado a material peligroso.' },
  { name: 'Industrial / UPS', icon: 'building', desc: 'Bancos estacionarios para UPS, telecom, plantas y centros de datos con monitoreo de celdas.' },
  { name: 'Marino', icon: 'ship', desc: 'Baterias de arranque y servicio para embarcaciones, selladas y de ciclo profundo.' },
];

const proceso = [
  { n: 1, t: 'Diagnostico', d: 'Voltaje, resistencia interna y prueba de carga con equipo especializado.' },
  { n: 2, t: 'Cotizacion', d: 'Propuesta clara de reparacion, reacondicionamiento o reemplazo. La aprueba el cliente.' },
  { n: 3, t: 'Reparacion', d: 'Cambio de celdas, relleno de electrolito, ecualizaciones y recarga profunda.' },
  { n: 4, t: 'Entrega', d: 'Prueba final de capacidad obligatoria antes de entregar, con garantia activa.' },
];

const confianza = [
  { big: '15+', sm: 'anos de experiencia en bancos industriales' },
  { big: '4', sm: 'especialidades: plomo-acido, litio, ferroviario e industrial pesado' },
  { big: '100%', sm: 'prueba final de carga antes de cada entrega' },
  { big: 'Cert', sm: 'manejo responsable de residuos: reciclaje de plomo y acido' },
];

const heroImg = 'https://images.pexels.com/photos/36594160/pexels-photo-36594160.jpeg?auto=compress&cs=tinysrgb&w=1600';

const img = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;

const galeria = [
  { id: 36594160, t: 'Baterias industriales', sub: 'Inspeccion de bancos de baterias' },
  { id: 1267337, t: 'Autoelevador en operacion', sub: 'Flotillas de montacargas' },
  { id: 4483561, t: 'Operaciones de taller', sub: 'Tecnicos en piso' },
  { id: 1267324, t: 'Carga y logistica', sub: 'Movimiento de equipos' },
];

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero-bg">
          <img src={heroImg} alt="Baterias industriales en taller" />
        </div>
        <div className="wrap">
          <div className="hero-inner center">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <span className="pill"><Icon name="bolt" size={13} /> Taller especializado en baterias industriales</span>
              <span className="pill"><Icon name="shield" size={13} /> Certificaciones y manejo responsable de residuos</span>
            </div>
            <h1>
              El ciclo completo de tu bateria, <span className="hl">bajo control</span>
            </h1>
            <p className="lead">
              Recepcion, diagnostico, reparacion, prueba de carga y entrega con garantia. Vertika gestiona
              cada bateria industrial con trazabilidad por numero de serie, para talleres que trabajan con
              autos, autoelevadores, trenes, UPS y embarcaciones.
            </p>
            <div className="ctas">
              <Link to="/auth" className="btn primary lg"><Icon name="bolt" size={18} /> Agendar servicio / Recoleccion en planta</Link>
              <Link to="/auth" className="btn lg"><Icon name="user" size={16} /> Entrar a la plataforma</Link>
            </div>
            <p className="muted" style={{ marginTop: 14, fontSize: 12.5 }}>
              Demo 100% navegable · Datos simulados en memoria · Vertika — Energia bajo control
            </p>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <h2 className="sec-title">Lineas de servicio</h2>
          <p className="sec-sub">Cada aplicacion tiene su propio regimen electrico, de ciclos y de seguridad. Por eso cada linea la atiende un tecnico con especialidad dedicada.</p>
          <div className="grid3">
            {servicios.map((s) => (
              <div key={s.name} className="app-card">
                <span className="ai" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}><Icon name={s.icon} size={22} /></span>
                <div>
                  <h4>{s.name}</h4>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <h2 className="sec-title">Como funciona</h2>
          <p className="sec-sub">Un proceso controlado paso a paso. Ninguna bateria sale del taller sin pasar la prueba final de carga y capacidad.</p>
          <div className="process">
            {proceso.map((p, i) => (
              <div key={p.n} className="pstep">
                <span className="num">{p.n}</span>
                <h5>{p.t}</h5>
                <p>{p.d}</p>
                {i < proceso.length - 1 && <div style={{ fontSize: 20, marginTop: 8 }}>→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <h2 className="sec-title">El taller</h2>
          <p className="sec-sub">Equipo de diagnostico, bancos de carga industriales y tecnicos certificados trabajando todos los dias con bancos de baterias de alta energia.</p>
          <div className="grid4">
            {galeria.map((g) => (
              <div key={g.id} className="card pad0">
                <img src={img(g.id)} alt={g.t} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{g.t}</div>
                  <div className="card-sub">{g.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <h2 className="sec-title center">Confianza que se mide</h2>
          <div className="trust">
            {confianza.map((c) => (
              <div key={c.big} className="trust-item">
                <div className="big">{c.big}</div>
                <div className="sm">{c.sm}</div>
              </div>
            ))}
          </div>
          <div className="center mt24">
            <Link to="/auth" className="btn primary lg"><Icon name="calendar" size={16} /> Agendar visita o solicitar recoleccion</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap row between wrap">
          <div className="brand">
            <span className="logo"><Icon name="bolt" size={18} /></span>
            <span>
              Vertika Demo
              <small>Taller de Baterias Industriales · Energia bajo control</small>
            </span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span>Tel: 1167974159</span>
            <span>contacto@argentina.prueba.com.ar</span>
            <span>Reciclaje de plomo-acido certificado</span>
            <ResetDemoBtn compact />
          </div>
        </div>
      </footer>
    </>
  );
}