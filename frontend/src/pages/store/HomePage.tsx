import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { HeroCarousel } from '../../components/store/HeroCarousel';
import { ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { BrandBanner, CategoryTiles, CtaBand, InfoStrip, SectionTitle } from '../../components/store/Sections';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { SearchIcon } from '../../components/ui/Icons';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useReveal } from '../../hooks/useReveal';
import { useBanners, useCategories, useProducts, useSettings } from '../../hooks/useStoreData';
import type { ProductQuery } from '../../lib/store-api';
import type { Category } from '../../types/api';

function ProductRow({ title, query, picks = false, moreLink }: { title: string; query: ProductQuery; picks?: boolean; moreLink?: string }) {
  const products = useProducts(query);
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  if (products.isSuccess && products.data.items.length === 0) return null;
  return (
    <section className="sec" ref={ref} aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      {products.isPending && <ProductGridSkeleton count={5} className={picks ? 'picks' : 'grid'} />}
      {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
      {products.data && (
        <div className={picks ? 'picks' : 'grid'}>
          {products.data.items.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
      {moreLink && products.data && products.data.total > products.data.items.length && (
        <div className="sec-more">
          <Link to={moreLink} className="btn btn-outline btn-sm">
            Ver todos →
          </Link>
        </div>
      )}
    </section>
  );
}

/** Catálogo da página inicial: busca + chips como no site original, com link para o catálogo completo. */
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
      <SectionTitle id="catalogo-title">Catálogo completo</SectionTitle>
      <div className="search">
        <SearchIcon />
        <label htmlFor="home-search" className="sr-only">
          Buscar produto ou marca
        </label>
        <input id="home-search" type="search" placeholder="Buscar produto, marca..." value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} />
      </div>
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
          <Link to={`/produtos?${params.toString()}`} className="btn btn-gold">
            Ver todos os {products.data.total} produtos →
          </Link>
        </div>
      )}
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
  const tiles = (categories.data ?? []).filter((c) => c.showOnHome);

  return (
    <>
      {banners.isPending ? (
        <section className="hero hero-fallback" aria-busy="true" />
      ) : (
        <HeroCarousel banners={banners.data ?? []} intervalSeconds={s.heroIntervalSeconds} storeName={s.storeName} />
      )}
      <div ref={mainRef}>
        <InfoStrip items={s.content.benefits} className="benefits" label="Vantagens" />
        <div className="wrap">
          <ProductRow title={home.featuredTitle} query={{ featured: true, pageSize: 5 }} picks />
          <BrandBanner data={s.content.brandBanner} />
          {home.showCategories && tiles.length > 0 && (
            <section className="sec" aria-labelledby="cats-title">
              <SectionTitle id="cats-title">Compre por categoria</SectionTitle>
              <CategoryTiles categories={tiles} />
            </section>
          )}
          {home.showOnSale && <ProductRow title="Ofertas" query={{ onSale: true, pageSize: 5 }} moreLink="/produtos?ofertas=1" />}
          {home.showNewArrivals && <ProductRow title="Novidades" query={{ sort: 'newest', pageSize: 5 }} moreLink="/produtos?ordem=newest" />}
          {home.showCatalog && categories.data && <HomeCatalog categories={categories.data} />}
          {categories.isError && <EmptyState title="Categorias indisponíveis" />}
          <CtaBand data={s.content.cta} whatsappNumber={s.whatsappNumber} greeting={s.whatsappGreeting} />
        </div>
        <InfoStrip items={s.content.trustItems} className="trust" label="Por que comprar com a gente" />
      </div>
    </>
  );
}
