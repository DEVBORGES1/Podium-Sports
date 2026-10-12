import { useState, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import logo from '../assets/logo.png';
import {
  CategoryIcon,
  ExternalIcon,
  HistoryIcon,
  HomeIcon,
  ImageIcon,
  OrdersIcon,
  PercentIcon,
  ProductIcon,
  SettingsIcon,
  StockIcon,
  UsersIcon,
} from '../components/admin/AdminIcons';
import { LiveIndicator, NewOrderBanner, SoundControl } from '../components/admin/OrderAlertsUI';
import { MenuIcon } from '../components/ui/Icons';
import { useAuth } from '../contexts/AuthContext';
import { OrderAlertsProvider, useOrderAlerts } from '../contexts/OrderAlertsContext';
import '../styles/admin.css';

type NavItem = { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean; badge?: 'pending' };

/** Menu agrupado pelas tarefas do dia a dia; "Pedidos" logo no topo, com o número de pedidos novos. */
const GROUPS: { title?: string; items: NavItem[]; superOnly?: boolean }[] = [
  {
    items: [
      { to: '/admin', label: 'Visão geral', icon: HomeIcon, end: true },
      { to: '/admin/orders', label: 'Pedidos', icon: OrdersIcon, badge: 'pending' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/admin/products', label: 'Produtos', icon: ProductIcon },
      { to: '/admin/categories', label: 'Categorias', icon: CategoryIcon },
      { to: '/admin/inventory', label: 'Estoque', icon: StockIcon },
    ],
  },
  {
    title: 'Vitrine',
    items: [
      { to: '/admin/banners', label: 'Banners da página inicial', icon: ImageIcon },
      { to: '/admin/promotions', label: 'Promoções', icon: PercentIcon },
    ],
  },
  { title: 'Loja', items: [{ to: '/admin/settings', label: 'Configurações', icon: SettingsIcon }] },
  {
    title: 'Administração',
    superOnly: true,
    items: [
      { to: '/admin/users', label: 'Usuários do painel', icon: UsersIcon },
      { to: '/admin/audit', label: 'Histórico de alterações', icon: HistoryIcon },
    ],
  },
];

function PendingBadge() {
  const { counts } = useOrderAlerts();
  const n = counts?.PENDING ?? 0;
  if (n === 0) return null;
  return (
    <span className="nav-badge" aria-label={`${n} pedido(s) novo(s)`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function Shell() {
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
          {GROUPS.filter((g) => !g.superOnly || me?.role === 'SUPER_ADMIN').map((g, i) => (
            <div key={g.title ?? i} className="nav-group" role="group" aria-label={g.title}>
              {g.title && <span className="sep">{g.title}</span>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <n.icon className="nav-ico" />
                  <span className="nav-label">{n.label}</span>
                  {n.badge === 'pending' && <PendingBadge />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="adm-side-foot">
          <Link to="/" target="_blank" rel="noopener">
            Ver loja <ExternalIcon />
          </Link>
        </div>
      </aside>
      <div className={`overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="menu btn btn-outline btn-sm btn-icon" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
          <LiveIndicator />
          <div className="adm-top-actions">
            <SoundControl />
            <div className="adm-user">
              <div className="who">
                <b>{me?.name}</b>
                <small>{me?.role === 'SUPER_ADMIN' ? 'Superadministrador' : 'Administrador'}</small>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void signOut()}>
                Sair
              </button>
            </div>
          </div>
        </header>
        <NewOrderBanner />
        <main className="adm-content" id="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <OrderAlertsProvider>
      <Shell />
    </OrderAlertsProvider>
  );
}
