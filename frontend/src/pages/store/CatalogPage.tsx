import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { SearchIcon } from '../../components/ui/Icons';
import { ErrorState, Pagination } from '../../components/ui/States';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCategories, useProducts, useSettings } from '../../hooks/useStoreData';
import { parseMoneyToCents } from '../../lib/format';
import type { ProductQuery } from '../../lib/store-api';
import { whatsappLink } from '../../lib/whatsapp';

const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { value: 'relevance', label: 'Destaques' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'name_asc', label: 'Nome (A–Z)' },
  { value: 'newest', label: 'Novidades' },
];
const PAGE_SIZE = 20;

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const settings = useSettings();
  const category = params.get('categoria') ?? '';
  const onSale = params.get('ofertas') === '1';
  const sort = (SORTS.find((s) => s.value === params.get('ordem'))?.value ?? 'relevance') as ProductQuery['sort'];
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const min = params.get('min') ?? '';
  const max = params.get('max') ?? '';

  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 350);

  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('pagina');
    setParams(next, { replace: true });
  };

  // Mantém a busca sincronizada com a URL (inclusive quando vem do cabeçalho).
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // Busca feita pelo cabeçalho: atualiza o campo sem sobrescrever o que já foi digitado aqui.
  const urlQ = params.get('q') ?? '';
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    if (urlQ !== q) setSearch(urlQ);
  }

  const query: ProductQuery = {
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(params.get('q') ? { q: params.get('q')! } : {}),
    ...(category ? { category } : {}),
    ...(onSale ? { onSale: true } : {}),
    ...(parseMoneyToCents(min) !== null ? { minPrice: parseMoneyToCents(min)! } : {}),
    ...(parseMoneyToCents(max) !== null ? { maxPrice: parseMoneyToCents(max)! } : {}),
  };
  const products = useProducts(query);
  const currentCategory = categories.data?.find((c) => c.slug === category);
  const title = onSale ? 'Ofertas' : currentCategory?.name ?? (params.get('q') ? `Resultados para “${params.get('q')}”` : 'Catálogo completo');
  useDocumentTitle(title);

  return (
    <div className="wrap">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Você está em">
          <Link to="/">Início</Link> <span aria-hidden>›</span> <span>{title}</span>
        </nav>
      </div>
      <section className="sec" style={{ paddingTop: 8 }} aria-labelledby="catalog-title">
        <h1 id="catalog-title" className="sec-title">
          <span className="slash" aria-hidden>
            ///
          </span>{' '}
          {title}{' '}
          <span className="slash" aria-hidden>
            ///
          </span>
        </h1>
        <div className="search">
          <SearchIcon />
          <label htmlFor="catalog-search" className="sr-only">
            Buscar produto ou marca
          </label>
          <input id="catalog-search" type="search" placeholder="Buscar produto, marca..." value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} />
        </div>
        <div className="toolbar" role="group" aria-label="Filtrar por categoria">
          <button type="button" className={`chip ${!category && !onSale ? 'active' : ''}`} aria-pressed={!category && !onSale} onClick={() => update({ categoria: null, ofertas: null })}>
            Todos
          </button>
          {categories.data?.map((c) => (
            <button key={c.id} type="button" className={`chip ${category === c.slug ? 'active' : ''}`} aria-pressed={category === c.slug} onClick={() => update({ categoria: c.slug, ofertas: null })}>
              {c.name}
            </button>
          ))}
          <button type="button" className={`chip ${onSale ? 'active' : ''}`} aria-pressed={onSale} onClick={() => update({ ofertas: onSale ? null : '1', categoria: null })}>
            Ofertas
          </button>
        </div>

        <div className="catalog-controls">
          <p className="count" aria-live="polite">
            {products.data ? `${products.data.total} produto${products.data.total === 1 ? '' : 's'}` : ' '}
          </p>
          <div className="filters">
            <div className="field">
              <label htmlFor="min">Preço mín. (R$)</label>
              <input id="min" className="input" inputMode="decimal" placeholder="0,00" defaultValue={min} onBlur={(e) => update({ min: e.target.value.trim() || null })} />
            </div>
            <div className="field">
              <label htmlFor="max">Preço máx. (R$)</label>
              <input id="max" className="input" inputMode="decimal" placeholder="999,00" defaultValue={max} onBlur={(e) => update({ max: e.target.value.trim() || null })} />
            </div>
            <div className="field">
              <label htmlFor="sort">Ordenar por</label>
              <select id="sort" className="select" value={sort} onChange={(e) => update({ ordem: e.target.value === 'relevance' ? null : e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {products.isPending && <ProductGridSkeleton count={10} />}
        {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
        {products.data && (
          <>
            <div className="grid" aria-busy={products.isFetching}>
              {products.data.items.length === 0 ? (
                <div className="noresult">
                  <p>Nenhum produto encontrado. Chama no WhatsApp que a gente procura pra você!</p>
                  {settings.data && (
                    <p style={{ marginTop: 12 }}>
                      <a className="btn btn-wa btn-sm" href={whatsappLink(settings.data.whatsappNumber, settings.data.whatsappGreeting)} target="_blank" rel="noopener noreferrer">
                        Falar no WhatsApp
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                products.data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
              )}
            </div>
            <Pagination
              page={products.data.page}
              totalPages={products.data.totalPages}
              onChange={(p) => {
                update({ pagina: p > 1 ? String(p) : null }, false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
