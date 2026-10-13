import { useCallback, useState, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import logo from '../assets/logo.png';
import {
  CategoryIcon,
  ExternalIcon,
  HistoryIcon,
  HomeIcon,
  ImageIcon,
  LogoutIcon,
  OrdersIcon,
  PercentIcon,
  ProductIcon,
  SettingsIcon,
  StockIcon,
  UsersIcon,
} from '../components/admin/AdminIcons';
import { LiveIndicator, NewOrderBanner, SoundControl } from '../components/admin/OrderAlertsUI';
import { QuickSearchButton, QuickSearchDialog } from '../components/admin/QuickSearch';
import { MenuIcon } from '../components/ui/Icons';
import { useAuth } from '../contexts/AuthContext';
import { OrderAlertsProvider, useOrderAlerts } from '../contexts/OrderAlertsContext';
import { useQuickSearchShortcut } from '../hooks/useQuickSearchShortcut';
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

/** Trilha do cabeçalho ("PAINEL / PEDIDOS"): a primeira rota do menu que corresponde ao endereço atual. */
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
function sectionLabel(pathname: string) {
  const match = ALL_ITEMS.filter((n) => (n.end ? pathname === n.to || pathname === `${n.to}/` : pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? 'Painel';
}

const initials = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '·';

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

  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => {
    setOpenKey(null);
    setSearching(true);
  }, []);
  useQuickSearchShortcut(openSearch);
  const groups = GROUPS.filter((g) => !g.superOnly || me?.role === 'SUPER_ADMIN');
  const roleLabel = me?.role === 'SUPER_ADMIN' ? 'Superadministrador' : 'Administrador';

  return (
    <div className="adm">
      <aside className={`adm-side ${open ? 'open' : ''}`} aria-label="Menu do painel">
        <div className="adm-brand">
          <img src={logo} alt="Podium Sports" />
          <small>Painel</small>
        </div>
        <QuickSearchButton onOpen={openSearch} />
        <nav className="adm-nav">
          {groups.map((g, i) => (
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
          <span className="avatar" aria-hidden>
            {initials(me?.name)}
          </span>
          <div className="who">
            <b>{me?.name}</b>
            <small>{roleLabel}</small>
          </div>
          <Link to="/" target="_blank" rel="noopener" className="side-icon-btn" title="Ver loja (nova aba)" aria-label="Ver loja (nova aba)">
            <ExternalIcon />
          </Link>
          <button type="button" className="side-icon-btn" title="Sair do painel" aria-label="Sair do painel" onClick={() => void signOut()}>
            <LogoutIcon />
          </button>
        </div>
      </aside>
      <div className={`overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="menu btn btn-outline btn-sm btn-icon" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
          <span className="adm-crumb">
            Painel <span aria-hidden>/</span> {sectionLabel(location.pathname)}
          </span>
          <div className="adm-top-actions">
            <LiveIndicator />
            <SoundControl />
          </div>
        </header>
        {searching && <QuickSearchDialog pages={groups.flatMap((g) => g.items)} onClose={() => setSearching(false)} />}
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
