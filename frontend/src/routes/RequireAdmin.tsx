import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '../components/ui/States';
import { useAuth } from '../contexts/AuthContext';

/**
 * Protege as rotas do painel na interface. A segurança real está na API,
 * que valida o token e a função em todas as rotas /admin.
 */
export function RequireAdmin({ role }: { role?: 'SUPER_ADMIN' }) {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState label="Verificando acesso…" />;
  if (status !== 'signedIn' || !me) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (role && me.role !== role) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
