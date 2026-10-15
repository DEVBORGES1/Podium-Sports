import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import logo from '../../assets/logo.webp';
import { useCart } from '../../contexts/CartContext';
import { useDialog } from '../../hooks/useDialog';
import { estimatedTotal } from '../../lib/cart';
import { brl } from '../../lib/format';
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

// Esconde as últimas categorias que não cabem na linha, inteiras (nunca cortadas ao meio).
// Ofertas fica sempre visível. Refaz a conta quando a barra muda de largura (janela, total da sacola).
function useFitNav(navRef: RefObject<HTMLElement | null>, items: NavItem[]) {
  const labels = items.map((i) => i.label).join('|');
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const fit = () => {
      const cats = [...nav.querySelectorAll<HTMLElement>('a:not(.sale)')];
      cats.forEach((a) => (a.hidden = false));
      for (const a of cats.reverse()) {
        if (nav.scrollWidth <= nav.clientWidth) break;
        a.hidden = true;
      }
    };
    fit();
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [navRef, labels]);
}

function SearchForm({ id, autoFocus, onDone, shortcut }: { id: string; autoFocus?: boolean; onDone?: () => void; shortcut?: boolean }) {
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
      <input id={id} type="search" placeholder="Buscar produto, marca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} maxLength={80} />
      {shortcut && (
        <kbd aria-hidden title="Atalho: tecla /">
          /
        </kbd>
      )}
    </form>
  );
}

export function SiteHeader({ categories, logoUrl, storeName }: { categories: Category[]; logoUrl: string | null; storeName: string }) {
  const { count, items: cartItems, open: openCart, cartButtonRef } = useCart();
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
  const navRef = useRef<HTMLElement>(null);
  const items = useNavItems(categories);
  useFitNav(navRef, items);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Tecla "/" leva à busca do cabeçalho (quando não se está digitando em outro campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const input = document.getElementById('header-search') as HTMLInputElement | null;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
          <nav className="main-nav" aria-label="Categorias" ref={navRef}>
            {items.map((item) => (
              // Link (não NavLink): o NavLink compara só o caminho e marcaria todas as categorias em /produtos.
              <Link
                key={item.to}
                to={item.to}
                className={`${item.sale ? 'sale' : ''} ${item.active ? 'active' : ''}`}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <div className="header-search">
              <SearchForm id="header-search" shortcut />
            </div>
            <button type="button" className="icon-btn search-toggle" aria-label="Buscar" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>
              <SearchIcon width={22} height={22} />
            </button>
            <button type="button" className="cart-btn" ref={cartButtonRef} onClick={openCart} aria-label={`Sacola, ${count} ${count === 1 ? 'item' : 'itens'}`}>
              <BagIcon width={20} height={20} />
              <span className="cart-label" aria-hidden>
                Sacola
              </span>
              <b aria-hidden>{count}</b>
              {count > 0 && (
                <span className="cart-total" aria-hidden>
                  {brl(estimatedTotal(cartItems))}
                </span>
              )}
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
          <img src={logoUrl ?? logo} alt={storeName} width={236} height={96} />
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
