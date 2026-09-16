import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

const fundadores = [
  {
    t: 'Automatización & Procesos Industriales',
    y: '+20 años de experiencia',
    d: 'Especialista en automatización y optimización de procesos productivos; aporta el rigor técnico del diagnóstico y la mejora continua de cada etapa del taller.',
    ic: 'gauge',
  },
  {
    t: 'Procesos Industriales & Comercial',
    y: '+30 años de experiencia',
    d: 'Tres décadas impulsando procesos industriales y gestión comercial; aporta la visión de negocio y el vínculo de confianza con cada cliente.',
    ic: 'users',
  },
];

const valores = [
  {
    t: 'Misión',
    d: 'Que la energía nunca sea el punto débil de tu operación: acumuladores confiables, diagnóstico preciso y reparación con garantía que prolonga la vida útil de cada batería.',
    ic: 'bolt',
  },
  {
    t: 'Visión',
    d: 'Ser la referencia en energía y arranque industrial de la región, con procesos 100% trazables y compromiso real con el ambiente.',
    ic: 'search',
  },
  {
    t: 'Calidad',
    d: 'Proceso controlado paso a paso y prueba final de capacidad obligatoria (FA8019, FA8020, S-508 AAFDM). Ninguna batería sale sin verificación real.',
    ic: 'shield',
  },
  {
    t: 'Compromiso',
    d: 'Cumplimos los plazos, avisamos cada avance en tiempo real y respondemos por cada batería entregada.',
    ic: 'check',
  },
];

const impacto = [
  { n: '+15 años', d: 'de trayectoria impulsando operaciones que no pueden detenerse', ic: 'clock' },
  { n: '100% trazable', d: 'cada batería se sigue por número de serie, del ingreso a la entrega', ic: 'search' },
  { n: 'Prueba final obligatoria', d: 'ninguna entrega sin verificación real de capacidad y carga', ic: 'gauge' },
  { n: 'Reciclaje responsable', d: 'acumuladores usados hacia operaciones de reciclaje autorizadas', ic: 'recycl' },
];

export default function Empresa() {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg">
          <img src="/img/fachada.jpg" alt="" />
        </div>
        <div className="wrap">
          <h1>Nuestra Empresa</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Nuestra Empresa
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="grid2" style={{ alignItems: 'flex-start', gap: 40 }}>
            <div>
              <img src="/img/img-automatizacion.jpg" alt="Automatización industrial" style={{ width: '100%', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }} />
            </div>
            <div>
              <h2 className="sec-title">Del terreno a la acción</h2>
              <p style={{ lineHeight: 1.7, margin: '0 0 12px', color: 'var(--text)' }}>
                Durante años compartimos proyectos, desafíos y jornadas de trabajo codo a codo en el sector
                industrial. Nos movía una misma visión y el dinamismo del día a día, pero sabíamos que podíamos
                ir un paso más allá. Tras décadas de perfeccionarnos en el sector, decidimos salir de nuestra
                zona de confort y asumir el mayor desafío de nuestras carreras: crear algo propio.
              </p>
              <p className="muted" style={{ lineHeight: 1.7, margin: '0 0 12px' }}>
                Así nació Bertika, el resultado de unir dos trayectorias complementarias con el ADN industrial
                en las venas. Por un lado, más de 20 años de experiencia liderando la automatización y
                optimización de procesos; por el otro, más de 30 años impulsando la gestión comercial e industrial.
              </p>
              <p className="muted" style={{ lineHeight: 1.7, margin: '0 0 14px' }}>
                Fusionamos la precisión de la ingeniería, la visión estratégica de negocio y el trabajo directo
                de taller para ofrecer soluciones de energía industrial de alta confiabilidad. En Bertika no
                vendemos insumos: entendemos que cada batería es un eslabón crítico en la cadena productiva de
                nuestros clientes. Sabemos que si la energía se detiene, el negocio se paraliza. Por eso,
                trabajamos para <strong>garantizar que tu operación nunca se frene</strong>.
              </p>
              <div className="banner-warn" style={{ marginBottom: 0, maxWidth: 520 }}>
                Representante oficial de AMSA Forbat
              </div>
            </div>
          </div>

          {/* Los fundadores */}
          <div className="grid2 mt32" style={{ gap: 20 }}>
            {fundadores.map((f) => (
              <div key={f.t} className="card">
                <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 4 }}>
                  <span className="chip" style={{ fontSize: 18, width: 46, height: 46, borderRadius: 12 }}>
                    <Icon name={f.ic} size={20} />
                  </span>
                  <div>
                    <h4 className="card-title" style={{ margin: 0 }}>{f.t}</h4>
                    <small style={{ color: 'var(--amber)', fontWeight: 700 }}>{f.y}</small>
                  </div>
                </div>
                <p className="card-sub">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Misión · Visión · Calidad · Compromiso */}
      <section className="sec sec-alt">
        <div className="wrap">
          <h2 className="sec-title" style={{ textAlign: 'center' }}>Misión, visión y valores</h2>
          <p className="sec-sub" style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 26px' }}>
            Lo que nos mueve y lo que prometemos con cada batería que pasa por nuestro taller.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {valores.map((v) => (
              <div key={v.t} className="card">
                <span className="chip" style={{ color: 'var(--amber)', fontSize: 16, width: 42, height: 42, borderRadius: 12, marginBottom: 10 }}>
                  <Icon name={v.ic} size={18} />
                </span>
                <h4 className="card-title">{v.t}</h4>
                <p className="card-sub">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nuestro impacto */}
      <section className="sec">
        <div className="wrap">
          <h2 className="sec-title" style={{ textAlign: 'center' }}>Nuestro impacto</h2>
          <p className="sec-sub" style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 26px' }}>
            Progreso medido en hechos: cada batería recuperada vuelve a trabajar y se convierte en un residuo menos.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {impacto.map((it) => (
              <div key={it.n} className="card" style={{ textAlign: 'center' }}>
                <span className="chip" style={{ color: 'var(--amber)', fontSize: 16, width: 46, height: 46, borderRadius: '50%', margin: '0 auto 10px' }}>
                  <Icon name={it.ic} size={18} />
                </span>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)' }}>{it.n}</div>
                <p className="card-sub" style={{ margin: '6px 0 0' }}>{it.d}</p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ lineHeight: 1.7, maxWidth: 760, margin: '26px auto 0', textAlign: 'center' }}>
            Cada batería que recuperamos es una batería que vuelve a trabajar, y un residuo menos en el ambiente.
            Ese es nuestro progreso: tecnología, proceso y compromiso caminando juntos para que tu operación nunca se detenga.
          </p>
        </div>
      </section>

      <div className="center" style={{ padding: '0 0 48px' }}>
        <Link to="/productos" className="btn primary lg">Ver nuestros productos</Link>
      </div>
    </>
  );
}