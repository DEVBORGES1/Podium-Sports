import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { adminApi, ApiError } from '../../lib/api';
import type { TargetDraft } from '../../lib/banner-targets';
import { brl, formatPhone } from '../../lib/format';
import type { Page } from '../../types/api';
import type { AdminCategory, AdminProduct, AdminSettings, BannerPage, ButtonTarget } from '../../types/admin';
import { CategoryGlyph } from '../ui/Icons';
import { CategoryIcon, ExternalIcon, HomeIcon, ProductIcon, SearchIcon, WhatsAppIcon } from './AdminIcons';
import { Modal } from './ui';

const PAGES: { value: BannerPage; label: string; hint: string }[] = [
  { value: 'catalog', label: 'Todos os produtos', hint: 'Catálogo completo da loja' },
  { value: 'offers', label: 'Produtos em oferta', hint: 'Somente itens com desconto' },
  { value: 'new', label: 'Novidades', hint: 'Catálogo ordenado pelos lançamentos' },
  { value: 'home', label: 'Página inicial', hint: 'Volta para o início da loja' },
];

const TYPES: { value: ButtonTarget['type']; label: string; icon: ReactNode }[] = [
  { value: 'product', label: 'Um produto', icon: <ProductIcon /> },
  { value: 'category', label: 'Uma categoria', icon: <CategoryIcon /> },
  { value: 'page', label: 'Página da loja', icon: <HomeIcon /> },
  { value: 'external', label: 'Link externo', icon: <ExternalIcon /> },
  { value: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon /> },
];

const useCategories = () =>
  useQuery({ queryKey: ['admin', 'categories'], queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items) });

function useProduct(id: string) {
  return useQuery({
    queryKey: ['admin', 'products', id],
    queryFn: () => adminApi.get<AdminProduct>(`/products/${id}`),
    enabled: !!id,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

export function ProductThumb({ product }: { product: Pick<AdminProduct, 'imageUrl' | 'name' | 'category'> }) {
  return (
    <span className="pick-thumb">
      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <CategoryGlyph icon={product.category.icon} strokeWidth={1.3} />}
    </span>
  );
}

function Price({ product }: { product: AdminProduct }) {
  return (
    <span className="pick-price">
      {product.onSale && <s>{brl(product.priceCents)}</s>} <b>{brl(product.effectivePriceCents)}</b>
    </span>
  );
}

/** Seletor visual de produto: busca por nome/marca, com foto e preço. */
export function ProductPickerModal({
  selectedIds,
  onPick,
  onClose,
  title = 'Escolher produto',
  actionLabel = 'Selecionar',
  selectedLabel = 'Selecionado',
}: {
  selectedIds: string[];
  onPick: (p: AdminProduct) => void;
  onClose: () => void;
  title?: string;
  actionLabel?: string;
  selectedLabel?: string;
}) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(term.trim()), 250);
    return () => window.clearTimeout(t);
  }, [term]);
  const results = useQuery({
    queryKey: ['admin', 'products', 'picker', query],
    queryFn: () => adminApi.get<Page<AdminProduct>>('/products', { q: query || undefined, status: 'active', sort: 'name', pageSize: 24 }),
    placeholderData: (prev) => prev,
  });
  const items = results.data?.items ?? [];
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="pick-search">
        <SearchIcon />
        <label htmlFor="product-picker-search" className="sr-only">
          Buscar produto
        </label>
        <input
          id="product-picker-search"
          className="input"
          placeholder="Buscar pelo nome ou pela marca…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      {results.isError ? (
        <p className="alert alert-error" role="alert">
          Não foi possível carregar os produtos.{' '}
          <button type="button" className="link-btn" onClick={() => results.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : results.isPending ? (
        <p className="notice" role="status">
          Carregando produtos…
        </p>
      ) : items.length === 0 ? (
        <p className="notice" role="status">
          Nenhum produto ativo encontrado{query ? ` para “${query}”` : ''}.
        </p>
      ) : (
        <>
          <ul className="pick-grid" aria-busy={results.isFetching}>
            {items.map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" className={`pick-card ${selected ? 'selected' : ''}`} onClick={() => onPick(p)} aria-pressed={selected}>
                    <ProductThumb product={p} />
                    <span className="pick-name">{p.name}</span>
                    <Price product={p} />
                    <span className="pick-action">{selected ? selectedLabel : actionLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {results.data && results.data.total > items.length && (
            <p className="notice">
              Mostrando {items.length} de {results.data.total}. Digite parte do nome para encontrar outros.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function ProductChoice({ value, onChange, onProduct }: { value: string; onChange: (id: string) => void; onProduct?: (p: AdminProduct | null) => void }) {
  const [open, setOpen] = useState(false);
  const product = useProduct(value);
  const removed = product.error instanceof ApiError && product.error.status === 404;
  useEffect(() => {
    onProduct?.(product.data ?? null);
  }, [product.data, onProduct]);

  return (
    <div className="target-panel">
      {!value ? (
        <button type="button" className="pick-empty" onClick={() => setOpen(true)}>
          <ProductIcon />
          <span>
            <b>Escolher produto</b>
            <small>Busque pelo nome e veja foto e preço.</small>
          </span>
        </button>
      ) : (
        <div className={`pick-selected ${removed || product.data?.isActive === false ? 'warn' : ''}`}>
          {product.data ? (
            <>
              <ProductThumb product={product.data} />
              <span className="pick-info">
                <b>{product.data.name}</b>
                <Price product={product.data} />
              </span>
            </>
          ) : (
            <span className="pick-info">
              <b>{removed ? 'Produto excluído' : product.isError ? 'Não foi possível carregar o produto' : 'Carregando produto…'}</b>
            </span>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
            Trocar
          </button>
        </div>
      )}
      {removed && (
        <p className="err" role="alert">
          O produto escolhido foi excluído da loja. Escolha outro destino para este botão.
        </p>
      )}
      {product.data && !product.data.isActive && (
        <p className="pending-hint" role="status">
          Este produto está desativado: o botão não aparece na loja até ele ser reativado ou você escolher outro.
        </p>
      )}
      {open && (
        <ProductPickerModal
          selectedIds={value ? [value] : []}
          onClose={() => setOpen(false)}
          onPick={(p) => {
            onChange(p.id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CategoryChoice({ value, onChange, name }: { value: string; onChange: (id: string) => void; name: string }) {
  const categories = useCategories();
  if (categories.isPending) return <p className="notice">Carregando categorias…</p>;
  if (categories.isError) return <p className="err">Não foi possível carregar as categorias.</p>;
  const list = categories.data.filter((c) => c.isActive || c.id === value);
  const selected = categories.data.find((c) => c.id === value);
  return (
    <div className="target-panel">
      {list.length === 0 ? (
        <p className="notice">Nenhuma categoria ativa cadastrada.</p>
      ) : (
        <div className="cat-pick" role="radiogroup" aria-label="Categoria">
          {list.map((c) => (
            <label key={c.id} className={`cat-option ${c.isActive ? '' : 'inactive'}`}>
              <input type="radio" name={name} value={c.id} checked={c.id === value} onChange={() => onChange(c.id)} />
              <span className="cat-icon" style={{ background: `radial-gradient(circle at 70% 30%, ${c.colorFrom}, ${c.colorTo})` }}>
                {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : <CategoryGlyph icon={c.icon} strokeWidth={1.4} />}
              </span>
              <span>
                <b>{c.name}</b>
                <small>{c.isActive ? `${c.productCount} produto(s)` : 'Desativada'}</small>
              </span>
            </label>
          ))}
        </div>
      )}
      {value && !selected && (
        <p className="err" role="alert">
          A categoria escolhida foi excluída. Escolha outra.
        </p>
      )}
      {selected && !selected.isActive && (
        <p className="pending-hint" role="status">
          Esta categoria está desativada: o botão não aparece na loja até ela ser reativada.
        </p>
      )}
    </div>
  );
}

/**
 * Destino do botão sem digitar endereços: tipo (produto, categoria, página, link externo ou WhatsApp) e a escolha visual.
 * Os endereços são montados pelo servidor com as rotas reais da loja.
 */
export function ButtonTargetField({
  id,
  value,
  onChange,
  error,
  onProduct,
}: {
  id: string;
  value: TargetDraft;
  onChange: (v: TargetDraft) => void;
  error?: string;
  /** Produto escolhido (para copiar preços para o banner). */
  onProduct?: (p: AdminProduct | null) => void;
}) {
  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.get<AdminSettings>('/store/settings'),
    enabled: value.type === 'whatsapp',
  });
  const set = (patch: Partial<TargetDraft>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="target-field" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="label">O que acontece quando alguém clicar?</legend>
      <div className="target-types" role="radiogroup" aria-label="Tipo de destino">
        {TYPES.map((t) => (
          <label key={t.value} className="target-type">
            <input type="radio" name={`${id}-type`} value={t.value} checked={value.type === t.value} onChange={() => set({ type: t.value })} />
            {t.icon}
            <span>{t.label}</span>
          </label>
        ))}
      </div>

      {value.type === 'legacy' && (
        <div className="alert alert-warn target-panel" role="status">
          Este botão usa um endereço digitado à mão: <code>{value.legacyUrl}</code>. Ele continua funcionando, mas escolha um destino acima para que o botão
          acompanhe automaticamente mudanças no produto ou na categoria.
        </div>
      )}
      {value.type === 'none' && <p className="notice target-panel">Escolha uma das opções acima.</p>}
      {value.type === 'product' && <ProductChoice value={value.productId} onChange={(productId) => set({ productId })} onProduct={onProduct} />}
      {value.type === 'category' && <CategoryChoice name={`${id}-category`} value={value.categoryId} onChange={(categoryId) => set({ categoryId })} />}
      {value.type === 'page' && (
        <div className="target-panel page-pick" role="radiogroup" aria-label="Página da loja">
          {PAGES.map((p) => (
            <label key={p.value} className="page-option">
              <input type="radio" name={`${id}-page`} value={p.value} checked={value.page === p.value} onChange={() => set({ page: p.value })} />
              <span>
                <b>{p.label}</b>
                <small>{p.hint}</small>
              </span>
            </label>
          ))}
        </div>
      )}
      {value.type === 'external' && (
        <div className="target-panel field">
          <label htmlFor={`${id}-url`}>Endereço do site</label>
          <input
            id={`${id}-url`}
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://www.instagram.com/sualoja"
            value={value.url}
            aria-invalid={!!error}
            onChange={(e) => set({ url: e.target.value })}
            onBlur={(e) => {
              const v = e.target.value.trim();
              // Facilita: "instagram.com/loja" vira "https://instagram.com/loja".
              if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) set({ url: `https://${v}` });
            }}
          />
          <span className="hint">Abre em uma nova aba. Por segurança, somente endereços https://.</span>
        </div>
      )}
      {value.type === 'whatsapp' && (
        <div className="target-panel field">
          <label htmlFor={`${id}-message`}>Mensagem inicial (opcional)</label>
          <textarea
            id={`${id}-message`}
            className="textarea"
            rows={2}
            maxLength={300}
            placeholder={settings.data?.whatsappGreeting ?? 'Olá! Vim pelo site e quero saber mais sobre a oferta.'}
            value={value.whatsappMessage}
            onChange={(e) => set({ whatsappMessage: e.target.value })}
          />
          <span className="hint">
            Abre uma conversa com {settings.data ? (settings.data.phoneDisplay ?? formatPhone(settings.data.whatsappNumber)) : 'o WhatsApp da loja'} com esta
            mensagem já escrita. Em branco, usa a saudação das configurações.
          </span>
        </div>
      )}
      {error && (
        <span id={`${id}-error`} className="err" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}
