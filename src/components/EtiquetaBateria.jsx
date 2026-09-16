import QrImage from './QrImage';
import { CONTACTO } from '../data/siteData';

const fmt = (c) => String(c || '').replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1-').replace(/-$/, '');

function LabelRow({ k, v }) {
  if (!v) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, padding: '2px 0' }}>
      <span style={{ fontWeight: 700, color: '#555' }}>{k}</span>
      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}

export default function EtiquetaBateria({ orden, bateria, cliente }) {
  const codigo = orden.codigo_seguimiento || '';
  const url = `${window.location.origin}/tracker/${(codigo || orden.id)}`;
  const print = () => {
    document.body.classList.add('print-label');
    window.print();
    window.addEventListener('afterprint', () => document.body.classList.remove('print-label'), { once: true });
  };
  return (
    <div className="card" style={{ background: 'var(--bg-3)' }}>
      <div className="row between">
        <div className="card-title"><QrImage text={url} size={92} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--blue)', letterSpacing: '1px' }}>BERTIKA<sup style={{ fontSize: 9 }}>®</sup></div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
            Acumuladores Industriales · Rep. oficial AMSA Forbat
          </div>
          <LabelRow k="N° serie" v={orden.bateria_serie} />
          <LabelRow k="Código" v={fmt(codigo)} />
          <LabelRow k="Orden" v={orden.id} />
          <LabelRow k="Aplicacion" v={bateria?.aplicacion} />
          <LabelRow k="Cliente" v={cliente?.nombre} />
        </div>
      </div>
      <p className="card-sub" style={{ marginTop: 4 }}>
        Escaneá el QR para ver el seguimiento en tiempo real de esta batería.
      </p>
      <button className="btn primary sm" onClick={print}><span style={{ fontSize: 12 }}>Imprimir etiqueta</span></button>

      <div className="print-label">
        <div style={{ fontFamily: 'Roboto, Arial, sans-serif', padding: 14, width: 620 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', border: '2px solid #0a1740', borderRadius: 10, padding: 12 }}>
            <QrImage text={url} size={140} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0a1740', letterSpacing: '2px' }}>BERTIKA<sup style={{ fontSize: 12 }}>®</sup></div>
              <div style={{ fontSize: 10, color: '#848484', marginBottom: 8 }}>Acumuladores Industriales · Rep. oficial AMSA Forbat</div>
              <div style={{ borderTop: '2px solid #f5c116', borderBottom: '2px solid #f5c116', padding: '6px 0', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0a1740' }}>{orden.bateria_serie}</div>
              </div>
<LabelRow k="Código" v={fmt(codigo)} />
              <LabelRow k="Orden" v={orden.id} />
              <LabelRow k="Aplicacion" v={bateria?.aplicacion} />
              <LabelRow k="Bateria" v={bateria ? `${bateria.tipo} ${bateria.voltaje} ${bateria.capacidad}Ah` : ''} />
              <LabelRow k="Cliente" v={cliente?.nombre} />
              <div style={{ fontSize: 9, color: '#999', marginTop: 6 }}>{url}</div>
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#999', textAlign: 'center', marginTop: 8 }}>
            Bertika® · Tel: {CONTACTO.telefono} · www.bertika.com
          </div>
        </div>
      </div>
    </div>
  );
}