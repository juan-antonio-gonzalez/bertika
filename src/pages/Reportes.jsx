import { useMemo } from 'react';
import { Icon, fmtARS } from '../components/ui';
import { useStore } from '../store/store';

const csv = (rows) => {
  const esc = (v) => {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
};

const descargar = (nombre, contenido) => {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

const fmtF = (iso) => (iso ? new Date(iso).toLocaleString('es-AR') : '');

export default function Reportes() {
  const data = useStore((s) => s.data);

  const resumen = useMemo(() => {
    const entregadas = data.ordenes.filter((o) => o.estado === 'delivered');
    const cobrado = entregadas.reduce((t, o) => t + (Number(o.monto_cobrado) || 0), 0);
    const cotizado = data.ordenes.reduce((t, o) => t + (o.cotizacion?.monto || 0), 0);
    const enCurso = data.ordenes.filter((o) => o.estado !== 'delivered' && o.estado !== 'cancelled');
    const pendienteAprobar = data.ordenes.filter((o) => o.estado === 'quoted');
    const criticos = data.insumos.filter((i) => i.stock < 3);
    return { entregadas: entregadas.length, cobrado, cotizado, enCurso: enCurso.length, pendienteAprobar: pendienteAprobar.length, criticos };
  }, [data]);

  const exportOrdenes = () => {
    const rows = [['ID', 'N° serie', 'Cliente', 'Aplicacion', 'Estado', 'Falla', 'Ingreso', 'Total cotizado', 'Monto cobrado', 'Entrega']];
    for (const o of data.ordenes) {
      const c = data.clientes.find((x) => x.id === o.cliente_id);
      const b = data.baterias.find((x) => x.numero_serie === o.bateria_serie);
      rows.push([
        o.id, o.bateria_serie, c?.nombre || '', b?.aplicacion || '', o.estado, o.falla,
        fmtF(o.fecha_ingreso), o.cotizacion?.monto || '', o.monto_cobrado || '', fmtF(o.fecha_entrega),
      ]);
    }
    descargar('bertika-ordenes.csv', csv(rows));
  };

  const exportCobranzas = () => {
    const rows = [['ID', 'N° serie', 'Cliente', 'Monto cobrado', 'Garantia (meses)', 'Vence', 'Fecha entrega']];
    for (const o of data.ordenes.filter((x) => x.estado === 'delivered')) {
      const c = data.clientes.find((x) => x.id === o.cliente_id);
      rows.push([
        o.id, o.bateria_serie, c?.nombre || '', o.monto_cobrado || 0,
        o.garantia?.meses || '', fmtF(o.garantia?.vence), fmtF(o.fecha_entrega),
      ]);
    }
    descargar('bertika-cobranzas.csv', csv(rows));
  };

  const exportInsumos = () => {
    const rows = [['ID', 'Nombre', 'Categoria', 'Stock', 'Precio unit (ARS)']];
    for (const i of data.insumos) rows.push([i.id, i.nombre, i.categoria, i.stock, i.precio]);
    descargar('bertika-insumos.csv', csv(rows));
  };

  const exportNotif = () => {
    const rows = [['Fecha', 'Orden', 'Canal', 'Mensaje']];
    for (const n of data.notificaciones) rows.push([fmtF(n.fecha), n.orden_id, n.canal, n.mensaje]);
    descargar('bertika-notificaciones.csv', csv(rows));
  };

  return (
    <div className="wrap page">
      <h1 className="page-title">Reportes</h1>
      <p className="page-sub">Resumen de ingresos y exportacion de datos en CSV.</p>

      <div className="grid4 mt16">
        <div className="kpi green"><div className="kpi-label">Cobrado (entregadas)</div><div className="kpi-value">{fmtARS(resumen.cobrado)}</div><div className="kpi-sub">{resumen.entregadas} entregas</div></div>
        <div className="kpi"><div className="kpi-label">Cotizado (total cartera)</div><div className="kpi-value">{fmtARS(resumen.cotizado)}</div><div className="kpi-sub">({resumen.enCurso} en taller)</div></div>
        <div className="kpi alert"><div className="kpi-label">Cotizaciones a aprobar</div><div className="kpi-value">{resumen.pendienteAprobar}</div><div className="kpi-sub">esperando cliente</div></div>
        <div className="kpi danger"><div className="kpi-label">Stock critico</div><div className="kpi-value">{resumen.criticos.length}</div><div className="kpi-sub">insumos con &lt;3</div></div>
      </div>

      <div className="card mt24">
        <div className="card-title"><Icon name="box" size={14} /> Exportar CSV</div>
        <div className="row mt16 wrap" style={{ gap: 10 }}>
          <button className="btn" onClick={exportOrdenes}><Icon name="clipboard" size={14} /> Ordenes</button>
          <button className="btn" onClick={exportCobranzas}><Icon name="truck" size={14} /> Cobranzas</button>
          <button className="btn" onClick={exportInsumos}><Icon name="battery" size={14} /> Insumos</button>
          <button className="btn" onClick={exportNotif}><Icon name="bell" size={14} /> Notificaciones</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
          Los archivos se descargan en formato CSV compatible con Excel (separador comas, codificacion UTF-8).
        </p>
      </div>
    </div>
  );
}