import { Link, Navigate, useParams } from 'react-router-dom';
import { CONTACTO, PRODUCTOS } from '../data/siteData';
import { ORDEN_LINEAS, PRODUCTO_DETALLE } from '../data/productosDetalle';

// Ficha de una línea de producto. Misma estructura que la ficha del fabricante
// (resumen, aplicaciones, características, rendimiento) con la piel del sitio:
// imagen + ficha técnica pegadas al costado y el contenido a la derecha.
export default function ProductoDetalle() {
  const { id } = useParams();
  const producto = PRODUCTOS.find((p) => p.id === id);
  const detalle = PRODUCTO_DETALLE[id];

  if (!producto || !detalle) return <Navigate to="/productos" replace />;

  const otras = ORDEN_LINEAS.filter((x) => x !== id)
    .map((x) => PRODUCTOS.find((p) => p.id === x))
    .filter(Boolean);

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <div className="page-hero-kicker">Producto</div>
          <h1 className="page-hero-title">{producto.titulo}</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / <Link to="/productos">Productos</Link> / {producto.titulo}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap pd">
          <aside className="pd-media">
            <figure className="pd-foto">
              <img src={detalle.imagen} alt={producto.titulo} width="428" height="321" />
            </figure>

            <dl className="pd-ficha">
              {detalle.ficha.map((f) => (
                <div key={f.k}>
                  <dt>{f.k}</dt>
                  <dd>{f.v}</dd>
                </div>
              ))}
            </dl>

            <Link
              to={`/contacto?asunto=${encodeURIComponent(producto.titulo)}`}
              className="btn primary pd-cta"
            >
              Consultar disponibilidad
            </Link>
          </aside>

          <div className="pd-body">
            <p className="pd-lead">{detalle.resumen}</p>

            {detalle.aplicaciones?.length > 0 && (
              <section className="pd-seccion">
                <h2 className="pd-h">Aplicaciones</h2>
                <ul className="pd-lista">
                  {detalle.aplicaciones.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>
            )}

            {detalle.bloques.map((b) => (
              <section className="pd-seccion" key={b.h}>
                <h2 className="pd-h">{b.h}</h2>
                {b.p && <p>{b.p}</p>}
                {b.items && (
                  <ul className="pd-lista">
                    {b.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <div className="pd-contacto">
              <div>
                <span className="eyebrow">¿Te interesa esta línea?</span>
                <p>Te asesoramos sobre el equipo que corresponde a tu operación.</p>
              </div>
              <div className="pd-contacto-acciones">
                <a className="btn primary" href={CONTACTO.telHref}>
                  {CONTACTO.telefono}
                </a>
                <Link className="btn" to="/contacto">
                  Formulario de contacto
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <h2 className="sec-title">Otras líneas</h2>
          <div className="pd-otras">
            {otras.map((p) => (
              <Link key={p.id} to={`/productos/${p.id}`} className="pd-otra">
                <span>{p.titulo}</span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
