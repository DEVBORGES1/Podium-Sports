import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { HeroCarousel } from '../../components/store/HeroCarousel';
import { ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { BrandBanner, CategoriesSection, CtaBand, InfoStrip, Podium, SectionHead, Showcase } from '../../components/store/Sections';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { SearchIcon } from '../../components/ui/Icons';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useReveal } from '../../hooks/useReveal';
import { useBanners, useCategories, useProducts, useSettings } from '../../hooks/useStoreData';
import type { ProductQuery } from '../../lib/store-api';
import type { Category } from '../../types/api';

/** Catálogo da página inicial: busca + chips, com link para o catálogo completo. */
function HomeCatalog({ categories }: { categories: Category[] }) {
  const [filter, setFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const query: ProductQuery = {
    pageSize: 15,
    ...(q ? { q } : {}),
    ...(filter === 'ofertas' ? { onSale: true } : filter !== 'todos' ? { category: filter } : {}),
  };
  const products = useProducts(query);
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (filter === 'ofertas') params.set('ofertas', '1');
  else if (filter !== 'todos') params.set('categoria', filter);
  const chips = [{ slug: 'todos', name: 'Todos' }, ...categories.map((c) => ({ slug: c.slug, name: c.name })), { slug: 'ofertas', name: 'Ofertas' }];

  return (
    <section className="sec" id="catalogo" aria-labelledby="catalogo-title">
      <div className="wrap">
        <SectionHead
          eyebrow="Catálogo"
          id="catalogo-title"
          title="Catálogo completo"
          aside={
            <div className="search">
              <SearchIcon />
              <label htmlFor="home-search" className="sr-only">
                Buscar produto ou marca
              </label>
              <input id="home-search" type="search" placeholder="Buscar produto, marca…" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} />
            </div>
          }
        />
        <div className="toolbar" role="group" aria-label="Filtrar por categoria">
          {chips.map((c) => (
            <button key={c.slug} type="button" className={`chip ${filter === c.slug ? 'active' : ''}`} aria-pressed={filter === c.slug} onClick={() => setFilter(c.slug)}>
              {c.name}
            </button>
          ))}
        </div>
        {products.isPending && <ProductGridSkeleton count={10} />}
        {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
        {products.data && (
          <div className="grid" aria-busy={products.isFetching}>
            {products.data.items.length === 0 ? (
              <p className="noresult">Nenhum produto encontrado. Chama no WhatsApp que a gente procura pra você!</p>
            ) : (
              products.data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
            )}
          </div>
        )}
        {products.data && products.data.total > products.data.items.length && (
          <div className="sec-more">
            <span className="mono-note">
              {products.data.items.length} de {products.data.total}
            </span>
            <Link to={`/produtos?${params.toString()}`} className="btn btn-outline-ink">
              Ver todos os {products.data.total} produtos →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const settings = useSettings();
  const banners = useBanners();
  const categories = useCategories();
  const mainRef = useRef<HTMLDivElement>(null);
  const s = settings.data!;
  usePageMeta({ title: `${s.storeName} · Artigos esportivos em Videira, SC`, path: '/' });
  useReveal(mainRef);
  const home = s.content.home;
  const all = categories.data ?? [];
  const tiles = all.filter((c) => c.showOnHome);
  const tabs = [
    ...(home.showOnSale ? [{ id: 'ofertas', label: 'Ofertas', query: { onSale: true, pageSize: 5 }, moreLink: '/produtos?ofertas=1' }] : []),
    ...(home.showNewArrivals ? [{ id: 'novidades', label: 'Novidades', query: { sort: 'newest' as const, pageSize: 5 }, moreLink: '/produtos?ordem=newest', countShown: true }] : []),
  ];

  return (
    <>
      {banners.isPending ? (
        <section className="hero hero-fallback" aria-busy="true" />
      ) : (
        <HeroCarousel banners={banners.data ?? []} intervalSeconds={s.heroIntervalSeconds} storeName={s.storeName} />
      )}
      <div ref={mainRef} className="home">
        <InfoStrip items={s.content.benefits} className="benefits" label="Vantagens" />
        {s.content.podium.enabled && <Podium eyebrow={home.featuredTitle} title={s.content.podium.title} text={s.content.podium.text} />}
        {home.showCategories && tiles.length > 0 && <CategoriesSection tiles={tiles} others={all.filter((c) => !c.showOnHome)} />}
        <BrandBanner data={s.content.brandBanner} />
        {tabs.length > 0 && <Showcase tabs={tabs} />}
        {home.showCatalog && categories.data && <HomeCatalog categories={categories.data} />}
        {categories.isError && <EmptyState title="Categorias indisponíveis" />}
        <CtaBand data={s.content.cta} whatsappNumber={s.whatsappNumber} greeting={s.whatsappGreeting} storeName={s.storeName} />
      </div>
    </>
  );
}
