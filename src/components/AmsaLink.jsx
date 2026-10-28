import { AMSA } from '../data/siteData';

// Enlace al sitio oficial de AMSA Forbat. Centraliza target/rel para que
// ninguna mención al fabricante quede como enlace interno o sin noopener.
export default function AmsaLink({
  href = AMSA.url,
  children,
  className = '',
  showIcon = false,
  ...rest
}) {
  return (
    <a
      href={href}
      className={className}
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      {showIcon && <span className="amsa-ext" aria-hidden="true">↗</span>}
    </a>
  );
}
