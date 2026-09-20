import { Icon, fmtARS, fmtFecha, nombreActor } from './ui';
import { CONTACTO, OFICIAL } from '../data/siteData';

// Impresion aislada: se marca el body, se imprime y se limpia la marca.
// El CSS (@media print) oculta todo menos el bloque con la clase indicada.
function imprimirClase(clase) {
  document.body.classList.add(clase);
  window.print();
  window.addEventListener('afterprint', () => document.body.classList.remove(clase), { once: true });
}

const fmtCodigo = (c) => String(c || '').replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1-').replace(/-$/, '');

function Fila({ k, v }) {
  if (!v && v !== 0) return null;
  return (
    <div className="doc-row">
      <span className="doc-k">{k}</span>
      <span className="doc-v">{v}</span>
    </div>
  );
}

function Firma({ rol }) {
  return (
    <div className="doc-firma">
      <div className="doc-firma-linea" />
      <div className="doc-firma-rol">{rol}</div>
      <div className="doc-firma-aclaracion">Aclaración y DNI</div>
    </div>
  );
}

/* ---------------- Orden de trabajo (recepción) ---------------- */
export function OrdenTrabajo({ orden, bateria, cliente, tecnico, historial = [] }) {
  const anterior = historial.filter((h) => h.id !== orden.id);
  return (
    <div className="card" style={{ background: 'var(--bg-3)' }}>
      <div className="row between wrap mb8" style={{ gap: 8 }}>
        <div className="card-title"><Icon name="clipboard" size={14} /> Orden de trabajo</div>
        <button className="btn primary sm" onClick={() => imprimirClase('print-doc')}>
          <Icon name="clipboard" size={13} /> Imprimir orden de trabajo
        </button>
      </div>

      <div className="print-doc doc">
        <div className="doc-head">
          <div>
            <div className="doc-brand">BERTIKA<sup>®</sup></div>
            <div className="doc-brand-sub">Acumuladores Industriales · {OFICIAL}</div>
          </div>
          <div className="doc-head-right">
            <div className="doc-title">ORDEN DE TRABAJO</div>
            <div className="doc-num">{orden.id}</div>
            <div className="doc-fecha">Ingreso: {fmtFecha(orden.fecha_ingreso)}</div>
            {orden.codigo_seguimiento && <div className="doc-fecha">Código: {fmtCodigo(orden.codigo_seguimiento)}</div>}
          </div>
        </div>

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Cliente</div>
          <Fila k="Nombre" v={cliente?.nombre} />
          <Fila k="Empresa" v={cliente?.empresa} />
          <Fila k="Contacto" v={cliente?.contacto} />
          <Fila k="Teléfono" v={cliente?.telefono} />
          <Fila k="Email" v={cliente?.email} />
        </div>

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Batería / equipo</div>
          <Fila k="N° de serie" v={orden.bateria_serie} />
          <Fila k="Tipo" v={bateria?.tipo} />
          <Fila k="Tensión / capacidad" v={bateria ? `${bateria.voltaje} · ${bateria.capacidad} Ah` : ''} />
          <Fila k="Aplicación" v={bateria?.aplicacion} />
          <Fila k="Marca / modelo" v={bateria ? `${bateria.marca || ''} ${bateria.modelo || ''}`.trim() : ''} />
          <Fila k="Equipo" v={bateria?.equipo} />
          <Fila k="Técnico asignado" v={tecnico ? `${tecnico.nombre} (${tecnico.especialidad})` : 'Sin asignar'} />
        </div>

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Falla reportada por el cliente</div>
          <div className="doc-texto">{orden.falla || '—'}</div>
        </div>

        {orden.diagnostico && (
          <div className="doc-seccion">
            <div className="doc-seccion-titulo">Diagnóstico del taller</div>
            <Fila k="Tensión medida" v={orden.diagnostico.voltaje_medido != null ? `${orden.diagnostico.voltaje_medido} V` : ''} />
            <Fila k="Resistencia interna" v={orden.diagnostico.resistencia_interna != null ? `${orden.diagnostico.resistencia_interna} mΩ` : ''} />
            <Fila k="Prueba de carga" v={orden.diagnostico.prueba_carga === 'passed' ? 'Aprobada' : orden.diagnostico.prueba_carga === 'failed' ? 'Fallida' : 'Pendiente'} />
            <Fila k="Servicio a cotizar" v={orden.diagnostico.servicioTipo} />
            {orden.diagnostico.notas && <div className="doc-texto">{orden.diagnostico.notas}</div>}
          </div>
        )}

        {orden.cotizacion && (
          <div className="doc-seccion">
            <div className="doc-seccion-titulo">Presupuesto</div>
            <table className="doc-tabla">
              <tbody>
                {(orden.cotizacion.servicios_costos || []).map((s, i) => (
                  <tr key={`s${i}`}><td>{s.nombre}</td><td className="doc-num-col">{fmtARS(s.monto)}</td></tr>
                ))}
                {(orden.cotizacion.insumos || []).map((s, i) => (
                  <tr key={`i${i}`}><td>{s.nombre} x{s.cantidad}</td><td className="doc-num-col">{fmtARS((Number(s.precio) || 0) * (Number(s.cantidad) || 0))}</td></tr>
                ))}
                <tr className="doc-total"><td>Total</td><td className="doc-num-col">{fmtARS(orden.cotizacion.monto)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {anterior.length > 0 && (
          <div className="doc-seccion">
            <div className="doc-seccion-titulo">Antecedentes de esta batería</div>
            <Fila k="Órdenes anteriores" v={anterior.map((h) => `${h.id} (${fmtFecha(h.fecha_ingreso)})`).join(' · ')} />
          </div>
        )}

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Accesorios recibidos / observaciones</div>
          <div className="doc-lineas"><span /><span /><span /></div>
        </div>

        <div className="doc-condiciones">
          El cliente autoriza la revisión y el diagnóstico del acumulador. El presupuesto de reparación se informa
          aparte y requiere su aprobación. El taller no se responsabiliza por baterías no retiradas dentro de los
          90 días de notificada la finalización.
        </div>

        <div className="doc-firmas">
          <Firma rol="Firma del cliente" />
          <Firma rol="Recepción del taller" />
        </div>

        <div className="doc-pie">
          {CONTACTO.direccion} · Ventas {CONTACTO.telefono} · Soporte {CONTACTO.telefonoSoporte} · {CONTACTO.emailVentas}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Comprobante de entrega y garantía ---------------- */
export function ComprobanteEntrega({ orden, bateria, cliente, tecnico }) {
  const g = orden.garantia;
  return (
    <div className="card" style={{ background: 'var(--bg-3)' }}>
      <div className="row between wrap mb8" style={{ gap: 8 }}>
        <div className="card-title"><Icon name="truck" size={14} /> Comprobante de entrega</div>
        <button className="btn primary sm" onClick={() => imprimirClase('print-doc')}>
          <Icon name="truck" size={13} /> Imprimir comprobante
        </button>
      </div>

      <div className="print-doc doc">
        <div className="doc-head">
          <div>
            <div className="doc-brand">BERTIKA<sup>®</sup></div>
            <div className="doc-brand-sub">Acumuladores Industriales · {OFICIAL}</div>
          </div>
          <div className="doc-head-right">
            <div className="doc-title">COMPROBANTE DE ENTREGA Y GARANTÍA</div>
            <div className="doc-num">{orden.id}</div>
            <div className="doc-fecha">Entrega: {fmtFecha(orden.fecha_entrega || orden.hora_entrega)}</div>
            {orden.codigo_seguimiento && <div className="doc-fecha">Código: {fmtCodigo(orden.codigo_seguimiento)}</div>}
          </div>
        </div>

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Cliente</div>
          <Fila k="Nombre" v={cliente?.nombre} />
          <Fila k="Empresa" v={cliente?.empresa} />
          <Fila k="Teléfono" v={cliente?.telefono} />
        </div>

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Trabajo entregado</div>
          <Fila k="N° de serie" v={orden.bateria_serie} />
          <Fila k="Batería" v={bateria ? `${bateria.tipo} · ${bateria.voltaje} · ${bateria.capacidad} Ah` : ''} />
          <Fila k="Equipo" v={bateria?.equipo} />
          <Fila k="Diagnóstico" v={orden.diagnostico?.servicioTipo} />
          {orden.prueba_final?.estado && orden.prueba_final.estado !== 'pending' && (
            <Fila k="Prueba final de capacidad"
              v={`${orden.prueba_final.estado === 'passed' ? 'Aprobada' : 'Fallida'}${orden.prueba_final.capacidad_medida ? ` · ${orden.prueba_final.capacidad_medida} Ah medidas` : ''}`} />
          )}
          <Fila k="Técnico responsable" v={tecnico?.nombre} />
        </div>

        {(orden.cotizacion || orden.monto_cobrado != null) && (
          <div className="doc-seccion">
            <div className="doc-seccion-titulo">Detalle económico</div>
            <table className="doc-tabla">
              <tbody>
                {(orden.cotizacion?.servicios_costos || []).map((s, i) => (
                  <tr key={`s${i}`}><td>{s.nombre}</td><td className="doc-num-col">{fmtARS(s.monto)}</td></tr>
                ))}
                {(orden.insumos_utilizados || []).map((u, i) => (
                  <tr key={`u${i}`}><td>{u.nombre} x{u.cantidad}</td><td className="doc-num-col">{fmtARS((Number(u.precio) || 0) * (Number(u.cantidad) || 0))}</td></tr>
                ))}
                <tr className="doc-total">
                  <td>Total cobrado{orden.medio_pago ? ` (${orden.medio_pago})` : ''}</td>
                  <td className="doc-num-col">{fmtARS(orden.monto_cobrado ?? orden.cotizacion?.monto)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="doc-seccion">
          <div className="doc-seccion-titulo">Garantía</div>
          {g ? (
            <>
              <Fila k="Plazo" v={`${g.meses} meses`} />
              <Fila k="Ciclos de carga cubiertos" v={g.ciclos} />
              <Fila k="Vence" v={fmtFecha(g.vence)} />
            </>
          ) : (
            <div className="doc-texto">Sin garantía registrada.</div>
          )}
        </div>

        <div className="doc-condiciones">
          La garantía cubre los trabajos realizados por el taller sobre el acumulador entregado, dentro del plazo y
          los ciclos indicados. No cubre daños por mal uso, sobrecarga, descarga profunda por falla del cargador o del
          equipo, golpes, ni intervenciones de terceros. La batería se entrega probada y en las condiciones
          registradas en esta orden.
        </div>

        <div className="doc-firmas">
          <Firma rol="Recibí conforme (cliente)" />
          <Firma rol="Entrega del taller" />
        </div>

        <div className="doc-pie">
          {CONTACTO.direccion} · Ventas {CONTACTO.telefono} · Soporte {CONTACTO.telefonoSoporte} · {CONTACTO.emailVentas}
        </div>
      </div>
    </div>
  );
}

// Reexport util para la pestaña de auditoria de cotizaciones.
export { nombreActor };
