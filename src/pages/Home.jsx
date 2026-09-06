import { Navigate } from 'react-router-dom';
import { useStore } from '../store/store';

export default function Home() {
  const user = useStore((s) => s.user);
  const dest = user?.rol === 'admin' ? '/hub' : user?.rol === 'tecnico' ? '/tecnico' : '/cliente';
  return <Navigate to={dest} replace />;
}