import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { FilterIcon, SearchIcon, WhatsAppLogo } from '../../components/ui/Icons';
import { ErrorState, Pagination } from '../../components/ui/States';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDialog } from '../../hooks/useDialog';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useBrands, useCategories, useProducts, useSettings } from '../../hooks/useStoreData';
import { brl, parseMoneyToCents } from '../../lib/format';
import type { ProductQuery } from '../../lib/store-api';
import { whatsappLink } from '../../lib/whatsapp';

const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { value: 'relevance', label: 'Destaques' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'name_asc', label: 'A–Z' },
  { value: 'newest', label: 'Novidades' },
];
const PAGE_SIZE = 20;
/** Faixa do controle "Preço até", em reais. No máximo, o filtro fica desligado ("Sem limite"). */
const PRICE_MIN = 10;
const PRICE_MAX = 1000;
const MOBILE_QUERY = '(max-width: 899px)';

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number) => `${n} produto${n === 1 ? '' : 's'}`;

function SortButtons({
  value,
  onChange,
  className,
}: {
  value: ProductQuery['sort'];
  onChange: (v: NonNullable<ProductQuery['sort']>) => void;
  className: string;
}) {
  return (
    <div className={className} role="group" aria-label="Ordenar por">
      {SORTS.map((s) => (
        <button key={s.value} type="button" aria-pressed={value === s.value} onClick={() => onChange(s.value)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const settings = useSettings();
  const category = params.get('categoria') ?? '';
  const onSale = params.get('ofertas') === '1';
  // Marcas escolhidas (várias, separadas por vírgula na URL).
  const brands = (params.get('marca') ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const sort = (SORTS.find((s) => s.value === params.get('ordem'))?.value ?? 'relevance') as ProductQuery['sort'];
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const min = params.get('min') ?? '';
  const max = params.get('max') ?? '';
  const minCents = parseMoneyToCents(min);
  const maxCents = parseMoneyToCents(max);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 350);
  const [cols, setCols] = useState<3 | 4>(4);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [sheet, setSheet] = useState(false);
  const sheetOpen = sheet && mobile;
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetOpen, () => setSheet(false), sheetRef);

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

  // "Preço até": o controle desliza livre e a URL é atualizada quando ele para.
  const urlMax = maxCents === null ? PRICE_MAX : Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(maxCents / 100)));
  const [priceDraft, setPriceDraft] = useState(urlMax);
  const price = useDebouncedValue(priceDraft, 350);
  useEffect(() => {
    if (price !== urlMax) update({ max: price >= PRICE_MAX ? null : String(price) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price]);
  const [prevUrlMax, setPrevUrlMax] = useState(urlMax);
  if (urlMax !== prevUrlMax) {
    setPrevUrlMax(urlMax);
    if (urlMax !== priceDraft) setPriceDraft(urlMax);
  }

  const query: ProductQuery = {
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(params.get('q') ? { q: params.get('q')! } : {}),
    ...(category ? { category } : {}),
    ...(brands.length ? { brand: brands.join(',') } : {}),
    ...(onSale ? { onSale: true } : {}),
    ...(minCents !== null ? { minPrice: minCents } : {}),
    ...(maxCents !== null ? { maxPrice: maxCents } : {}),
  };
  const products = useProducts(query);
  const allCategories = categories.data ?? [];
  const currentCategory = allCategories.find((c) => c.slug === category);
  // Subcategoria escolhida: a mãe continua aberta na lista, com as irmãs à vista.
  const parentCategory = currentCategory?.parentId ? allCategories.find((c) => c.id === currentCategory.parentId) : undefined;
  const openParentId = parentCategory?.id ?? currentCategory?.id;
  const brandOptions = useBrands(category || undefined);
  const urlSearch = params.get('q');
  const title = currentCategory?.name ?? (onSale ? 'Ofertas' : urlSearch ? `“${urlSearch}”` : 'Catálogo completo');
  usePageMeta({
    title: currentCategory?.name ?? (onSale ? 'Ofertas' : urlSearch ? `Resultados para “${urlSearch}”` : 'Catálogo completo'),
    description: currentCategory
      ? currentCategory.description || `${currentCategory.name} na Podium Sports, em Videira, SC. Confira preços e disponibilidade e peça pelo WhatsApp.`
      : onSale
        ? 'Ofertas da Podium Sports em Videira, SC: chuteiras, tênis, suplementos e moda fitness com desconto. Peça pelo WhatsApp.'
        : 'Catálogo completo da Podium Sports: chuteiras, tênis, suplementos e moda fitness em Videira, SC. Peça pelo WhatsApp.',
    path: currentCategory ? `/produtos?categoria=${currentCategory.slug}` : onSale ? '/produtos?ofertas=1' : '/produtos',
  });

  // Filtros ativos, cada um removível.
  const chips: { label: string; remove: () => void }[] = [];
  if (currentCategory) chips.push({ label: currentCategory.name, remove: () => update({ categoria: parentCategory ? parentCategory.slug : null }) });
  for (const b of brands) chips.push({ label: b, remove: () => update({ marca: brands.filter((x) => x !== b).join(',') || null }) });
  if (urlSearch) chips.push({ label: `“${urlSearch}”`, remove: () => update({ q: null }) });
  if (onSale) chips.push({ label: 'Só ofertas', remove: () => update({ ofertas: null }) });
  if (minCents !== null) chips.push({ label: `A partir de ${brl(minCents)}`, remove: () => update({ min: null }) });
  if (maxCents !== null) chips.push({ label: `Até ${brl(maxCents)}`, remove: () => update({ max: null }) });
  // Contador do botão "Filtrar e ordenar": só o que fica dentro da folha (categoria e busca já estão à vista).
  const filterBadge = [onSale, minCents !== null, maxCents !== null, sort !== 'relevance'].filter(Boolean).length + brands.length;
  const toggleBrand = (name: string) => {
    const has = brands.some((b) => b.toLowerCase() === name.toLowerCase());
    const next = has ? brands.filter((b) => b.toLowerCase() !== name.toLowerCase()) : [...brands, name];
    update({ marca: next.join(',') || null });
  };

  const total = products.data?.total;
  const wa = settings.data ? whatsappLink(settings.data.whatsappNumber, settings.data.whatsappGreeting) : null;
  const catButtons = [
    {
      key: 'todos',
      name: 'Todos',
      count: undefined as number | undefined,
      active: !category && !onSale,
      select: () => update({ categoria: null, ofertas: null }),
    },
    ...allCategories
      .filter((c) => !c.parentId)
      .flatMap((c) => [
        { key: c.slug, name: c.name, count: c.productCount, active: category === c.slug, select: () => update({ categoria: c.slug }) },
        // Subcategorias aparecem logo abaixo da categoria aberta.
        ...(c.id === openParentId
          ? allCategories
              .filter((sub) => sub.parentId === c.id)
              .map((sub) => ({
                key: sub.slug,
                name: sub.name,
                count: sub.productCount,
                active: category === sub.slug,
                sub: true,
                select: () => update({ categoria: sub.slug }),
              }))
          : []),
      ]),
    { key: 'ofertas', name: 'Ofertas', count: undefined, active: onSale && !category, select: () => update({ ofertas: '1', categoria: null }) },
  ];

  return (
    <div className="catalog">
      <header className="cat-head">
        <div className="wrap">
          <div>
            <nav className="crumbs" aria-label="Você está em">
              <Link to="/">Início</Link> <span aria-hidden>/</span> <Link to="/produtos">Catálogo</Link>
              {parentCategory && (
                <>
                  {' '}
                  <span aria-hidden>/</span> <Link to={`/produtos?categoria=${parentCategory.slug}`}>{parentCategory.name}</Link>
                </>
              )}
              {title !== 'Catálogo completo' && (
                <>
                  {' '}
                  <span aria-hidden>/</span> <span>{title}</span>
                </>
              )}
            </nav>
            <h1 id="catalog-title" className="display">
              {title}
            </h1>
          </div>
          {total !== undefined && (
            <div className="cat-count" aria-hidden>
              <b>{pad(total)}</b>
              <span>{total === 1 ? 'produto' : 'produtos'}</span>
            </div>
          )}
        </div>
      </header>

      <div className="wrap cat-layout">
        <aside className="filters" aria-label="Filtros">
          <div className="search">
            <SearchIcon />
            <label htmlFor="catalog-search" className="sr-only">
              Buscar produto ou marca
            </label>
            <input
              id="catalog-search"
              type="search"
              placeholder="Buscar produto, marca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className="f-group f-cats" role="group" aria-label="Filtrar por categoria">
            <span className="f-title" aria-hidden>
              Categoria
            </span>
            {catButtons.map((c) => (
              <button
                key={c.key}
                type="button"
                className={[c.active ? 'active' : '', 'sub' in c ? 'sub' : ''].filter(Boolean).join(' ')}
                aria-pressed={c.active}
                onClick={c.select}
              >
                {c.name}
                {c.count !== undefined && <span aria-hidden>{c.count}</span>}
              </button>
            ))}
          </div>

          <button type="button" className="f-open" onClick={() => setSheet(true)} aria-haspopup="dialog">
            <FilterIcon />
            Filtrar e ordenar
            {filterBadge > 0 && <span className="f-badge">{filterBadge}</span>}
          </button>

          {sheetOpen && <div className="overlay open" onClick={() => setSheet(false)} aria-hidden />}
          <div
            ref={sheetRef}
            className={`f-more ${sheetOpen ? 'open' : ''}`}
            {...(mobile ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Filtrar e ordenar', hidden: !sheetOpen, tabIndex: -1 } : {})}
          >
            <div className="sheet-head">
              <b className="display">Filtrar e ordenar</b>
              <button type="button" className="sheet-x" onClick={() => setSheet(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            {mobile && (
              <div className="f-group">
                <span className="f-title">Ordenar por</span>
                <SortButtons value={sort} onChange={(v) => update({ ordem: v === 'relevance' ? null : v })} className="sort-grid" />
              </div>
            )}
            <div className="f-group">
              <label htmlFor="price-max" className="f-title f-title-row">
                Preço até <b>{priceDraft >= PRICE_MAX ? 'Sem limite' : brl(priceDraft * 100)}</b>
              </label>
              <input
                id="price-max"
                type="range"
                min={PRICE_MIN}
                max={PRICE_MAX}
                step={10}
                value={priceDraft}
                onChange={(e) => setPriceDraft(Number(e.target.value))}
                aria-valuetext={priceDraft >= PRICE_MAX ? 'Sem limite' : brl(priceDraft * 100)}
              />
              <div className="range-ends" aria-hidden>
                <span>{brl(PRICE_MIN * 100)}</span>
                <span>Sem limite</span>
              </div>
            </div>
            {(brandOptions.data?.length ?? 0) > 1 && (
              <div className="f-group f-brands" role="group" aria-label="Filtrar por marca">
                <span className="f-title">Marca</span>
                {brandOptions.data!.map((b) => (
                  <label key={b.name} className="f-check">
                    <span>
                      {b.name} <span className="muted">({b.count})</span>
                    </span>
                    <input type="checkbox" checked={brands.some((x) => x.toLowerCase() === b.name.toLowerCase())} onChange={() => toggleBrand(b.name)} />
                  </label>
                ))}
              </div>
            )}
            <div className="f-group">
              <span className="f-title">Mostrar</span>
              <label className="f-check">
                Só ofertas
                <input type="checkbox" checked={onSale} onChange={() => update({ ofertas: onSale ? null : '1' })} />
              </label>
            </div>
            <button type="button" className="btn btn-ink sheet-done" onClick={() => setSheet(false)}>
              Ver {total ?? ''} produtos
            </button>
            {wa && (
              <div className="f-help">
                <b>Não achou?</b>
                Chama no WhatsApp que a gente procura pra você.
                <a className="btn btn-wa btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                  Falar no WhatsApp
                </a>
              </div>
            )}
          </div>
        </aside>

        <section className="cat-main" aria-labelledby="catalog-title">
          <div className="cat-toolbar">
            <div className="active-chips">
              <p className="count" aria-live="polite">
                {total !== undefined ? plural(total) : ' '}
              </p>
              {chips.map((c) => (
                <button key={c.label} type="button" className="active-chip" onClick={c.remove} aria-label={`Remover filtro ${c.label}`}>
                  {c.label}
                  <span aria-hidden>×</span>
                </button>
              ))}
              {chips.length > 1 && (
                <button
                  type="button"
                  className="clear-all"
                  onClick={() => update({ categoria: null, marca: null, q: null, ofertas: null, min: null, max: null })}
                >
                  Limpar tudo
                </button>
              )}
            </div>
            {!mobile && (
              <div className="cat-tools">
                <SortButtons value={sort} onChange={(v) => update({ ordem: v === 'relevance' ? null : v })} className="segmented" />
                <div className="cols" role="group" aria-label="Produtos por linha">
                  {([3, 4] as const).map((n) => (
                    <button key={n} type="button" aria-pressed={cols === n} onClick={() => setCols(n)} aria-label={`${n} por linha`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {products.isPending && <ProductGridSkeleton count={8} />}
          {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
          {products.data &&
            (products.data.items.length === 0 ? (
              <div className="nothing">
                <b className="display">Nada por aqui</b>
                <p>Nenhum produto encontrado. Chama no WhatsApp que a gente procura pra você!</p>
                {wa && (
                  <a className="btn btn-wa btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                    <WhatsAppLogo width={18} height={18} />
                    Falar no WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <>
                <div className="grid cat-grid" style={{ '--cols': cols } as CSSProperties} aria-busy={products.isFetching}>
                  {products.data.items.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
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
            ))}
        </section>
      </div>
    </div>
  );
}
