import { Outlet } from 'react-router';
import { AuthProvider } from '../contexts/AuthContext';

/** Raiz do painel: o cliente do Supabase Auth só é carregado quando alguém acessa /admin. */
export default function AdminRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
