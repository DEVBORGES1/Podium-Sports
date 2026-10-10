import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router';
import logo from '../../assets/logo.png';
import { useCart } from '../../contexts/CartContext';
import { useDialog } from '../../hooks/useDialog';
import type { Category } from '../../types/api';
import { BagIcon, MenuIcon, SearchIcon } from '../ui/Icons';

interface NavItem {
  to: string;
  label: string;
  sale?: boolean;
  active: boolean;
}

function useNavItems(categories: Category[]): NavItem[] {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const onCatalog = pathname === '/produtos';
  return [
    ...categories.slice(0, 7).map((c) => ({
      to: `/produtos?categoria=${c.slug}`,
      label: c.name,
      active: onCatalog && params.get('categoria') === c.slug,
    })),
    { to: '/produtos?ofertas=1', label: 'Ofertas', sale: true, active: onCatalog && params.get('ofertas') === '1' },
  ];
}

function SearchForm({ id, autoFocus, onDone }: { id: string; autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/produtos?q=${encodeURIComponent(term)}` : '/produtos');
    onDone?.();
  };
  return (
    <form role="search" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        Buscar produtos
      </label>
      <SearchIcon />
      <input id={id} type="search" placeholder="Buscar produto, marca..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} maxLength={80} />
    </form>
  );
}

export function SiteHeader({ categories, logoUrl, storeName }: { categories: Category[]; logoUrl: string | null; storeName: string }) {
  const { count, open: openCart, cartButtonRef } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  // Abertos apenas para a navegação atual: mudar de página fecha menu e busca.
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const menuOpen = menuKey === location.key;
  const searchOpen = searchKey === location.key;
  const setMenuOpen = (open: boolean) => setMenuKey(open ? location.key : null);
  const setSearchOpen = (open: boolean) => setSearchKey(open ? location.key : null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = useNavItems(categories);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useDialog(menuOpen, () => setMenuOpen(false), menuRef);

  return (
    <>
      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap">
          <button type="button" className="icon-btn menu-btn" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </button>
          <Link className="logo" to="/" aria-label={`${storeName} — página inicial`}>
            <img src={logoUrl ?? logo} alt={storeName} width={98} height={40} />
          </Link>
          <nav className="main-nav" aria-label="Categorias">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={`${item.sale ? 'sale' : ''} ${item.active ? 'active' : ''}`} aria-current={item.active ? 'page' : undefined}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <div className="header-search">
              <SearchForm id="header-search" />
            </div>
            <button type="button" className="icon-btn search-toggle" aria-label="Buscar" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>
              <SearchIcon width={22} height={22} />
            </button>
            <button type="button" className="icon-btn cart-btn" ref={cartButtonRef} onClick={openCart} aria-label={`Sacola, ${count} ${count === 1 ? 'item' : 'itens'}`}>
              <BagIcon />
              <b aria-hidden>{count}</b>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="search-panel">
            <div className="wrap">
              <SearchForm id="panel-search" autoFocus onDone={() => setSearchOpen(false)} />
            </div>
          </div>
        )}
      </header>

      <div className={`overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden />
      <div ref={menuRef} className={`mobile-menu ${menuOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu" hidden={!menuOpen} tabIndex={-1}>
        <div className="mobile-menu-head">
          <img src={logoUrl ?? logo} alt={storeName} />
          <button type="button" className="x" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}>
            ×
          </button>
        </div>
        <nav aria-label="Menu principal">
          <Link to="/">Início</Link>
          <Link to="/produtos">Todos os produtos</Link>
          {items.map((item) => (
            <Link key={item.to} to={item.to} className={`${item.sale ? 'sale' : ''} ${item.active ? 'active' : ''}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
