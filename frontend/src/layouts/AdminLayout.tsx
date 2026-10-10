import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import logo from '../assets/logo.png';
import { MenuIcon } from '../components/ui/Icons';
import { useAuth } from '../contexts/AuthContext';
import '../styles/admin.css';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Pedidos' },
  { to: '/admin/products', label: 'Produtos' },
  { to: '/admin/categories', label: 'Categorias' },
  { to: '/admin/inventory', label: 'Estoque' },
  { to: '/admin/banners', label: 'Banners' },
  { to: '/admin/promotions', label: 'Promoções' },
  { to: '/admin/settings', label: 'Configurações' },
];
const SUPER_NAV = [
  { to: '/admin/users', label: 'Usuários' },
  { to: '/admin/audit', label: 'Auditoria' },
];

export default function AdminLayout() {
  const { me, signOut } = useAuth();
  const location = useLocation();
  // Menu móvel aberto só na navegação atual: trocar de página fecha automaticamente.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = openKey === location.key;
  const setOpen = (v: boolean) => setOpenKey(v ? location.key : null);

  return (
    <div className="adm">
      <aside className={`adm-side ${open ? 'open' : ''}`} aria-label="Menu do painel">
        <div className="adm-brand">
          <img src={logo} alt="Podium Sports" />
          <small>Painel</small>
        </div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
          {me?.role === 'SUPER_ADMIN' && (
            <>
              <span className="sep">Administração</span>
              {SUPER_NAV.map((n) => (
                <NavLink key={n.to} to={n.to}>
                  {n.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="adm-side-foot">
          <Link to="/" target="_blank" rel="noopener">
            Ver loja ↗
          </Link>
        </div>
      </aside>
      <div className={`overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="menu" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
          <div className="adm-user">
            <div>
              <b>{me?.name}</b>
              <small>{me?.role === 'SUPER_ADMIN' ? 'Superadministrador' : 'Administrador'}</small>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </header>
        <main className="adm-content" id="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
