import { Navigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { LISTA_INICIO_ADMIN } from '../data/permisos';

export default function Home() {
  const user = useStore((s) => s.user);
  const dest = user?.rol === 'admin' ? LISTA_INICIO_ADMIN : user?.rol === 'tecnico' ? '/tecnico' : '/cliente';
  return <Navigate to={dest} replace />;
}