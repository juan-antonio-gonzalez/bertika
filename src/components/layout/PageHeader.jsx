import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Lleva el título, subtítulo y acciones de la pantalla a la barra superior del
// shell. El cuerpo queda limpio: primero el contenido, sin repetir la cabecera.
// Es el patrón para las próximas pantallas (listas, ventas, etc.).
export default function PageHeader({ group, title, sub, actions }) {
  const [slots, setSlots] = useState(null);

  useEffect(() => {
    const head = document.getElementById('shell-page-head');
    const acts = document.getElementById('shell-page-actions');
    const top = document.querySelector('.shell-top');
    if (!head || !acts) return undefined;
    setSlots({ head, acts });
    top?.classList.add('has-page-head');
    return () => {
      top?.classList.remove('has-page-head');
      setSlots(null);
    };
  }, []);

  if (!slots) return null;

  return (
    <>
      {createPortal(
        <div className="shell-page-head-inner">
          {group && <div className="shell-crumb-g">{group}</div>}
          <h1 className="shell-title">{title}</h1>
          {sub && <div className="shell-page-sub">{sub}</div>}
        </div>,
        slots.head
      )}
      {actions && createPortal(
        <div className="shell-page-actions-inner">{actions}</div>,
        slots.acts
      )}
    </>
  );
}
