import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { useNavigate } from 'react-router';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDialog } from '../../hooks/useDialog';
import { adminApi } from '../../lib/api';
import { brl, normalize } from '../../lib/format';
import { orderStatusLabel } from '../../lib/labels';
import type { AdminOrderRow, AdminProduct } from '../../types/admin';
import type { Page } from '../../types/api';
import { OrdersIcon, ProductIcon, SearchIcon } from './AdminIcons';

export interface QuickPage {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

type Result = { key: string; group: string; title: string; detail?: string; to: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Botão "Buscar pedido ou produto" do menu lateral. */
export function QuickSearchButton({ onOpen }: { onOpen: () => void }) {
  const mac = isMac();
  return (
    <button type="button" className="adm-search" onClick={onOpen} aria-haspopup="dialog" aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}>
      <SearchIcon aria-hidden />
      <span>Buscar pedido ou produto</span>
      <kbd aria-hidden>{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

/** Busca rápida: páginas do painel, pedidos (código, cliente ou telefone) e produtos. */
export function QuickSearchDialog({ pages, onClose }: { pages: QuickPage[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  useDialog(true, onClose, ref);

  const q = useDebouncedValue(text.trim(), 250);
  const enabled = q.length >= 2;
  const orders = useQuery({
    queryKey: ['admin', 'orders', 'quick', q],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', { q, pageSize: 5 }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const products = useQuery({
    queryKey: ['admin', 'products', 'quick', q],
    queryFn: () => adminApi.get<Page<AdminProduct>>('/products', { q, pageSize: 5 }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const term = normalize(text.trim());
  const results: Result[] = [
    ...(term ? pages.filter((p) => normalize(p.label).includes(term)) : pages).map((p) => ({ key: `p:${p.to}`, group: 'Ir para', title: p.label, to: p.to, icon: p.icon })),
    ...(enabled
      ? (orders.data?.items ?? []).map((o) => ({
          key: `o:${o.id}`,
          group: 'Pedidos',
          title: `${o.code} · ${o.customerName}`,
          detail: `${orderStatusLabel(o.status, o.fulfillment)} · ${brl(o.totalCents)}`,
          to: `/admin/orders?pedido=${o.id}`,
          icon: OrdersIcon,
        }))
      : []),
    ...(enabled
      ? (products.data?.items ?? []).map((p) => ({
          key: `r:${p.id}`,
          group: 'Produtos',
          title: p.name,
          detail: `${p.stockQuantity} em estoque · ${brl(p.effectivePriceCents)}`,
          to: `/admin/products/${p.id}`,
          icon: ProductIcon,
        }))
      : []),
    ...(text.trim()
      ? [
          {
            key: 'all-orders',
            group: 'Buscar em tudo',
            title: `Pedidos com “${text.trim()}”`,
            to: `/admin/orders?modo=lista&view=all&q=${encodeURIComponent(text.trim())}`,
            icon: OrdersIcon,
          },
          { key: 'all-products', group: 'Buscar em tudo', title: `Produtos com “${text.trim()}”`, to: `/admin/products?q=${encodeURIComponent(text.trim())}`, icon: ProductIcon },
        ]
      : []),
  ];
  const current = Math.min(active, Math.max(0, results.length - 1));
  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    navigate(r.to);
  };
  const loading = enabled && (orders.isFetching || products.isFetching);

  return (
    <div className="modal-backdrop quick-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="quick" role="dialog" aria-modal="true" aria-label="Buscar no painel">
        <div className="quick-input">
          <SearchIcon aria-hidden />
          <input
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results[current] ? `${listId}-${current}` : undefined}
            aria-label="Buscar pedido, produto ou página"
            placeholder="Código do pedido, cliente, telefone ou produto"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = results.length;
                if (n) setActive((current + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[current]);
              }
            }}
          />
          {loading && <span className="spinner sm" aria-hidden />}
        </div>
        <ul className="quick-list" id={listId} role="listbox" aria-label="Resultados">
          {results.map((r, i) => (
            <li key={r.key} role="presentation">
              {(i === 0 || results[i - 1]!.group !== r.group) && <span className="quick-group">{r.group}</span>}
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === current}
                className="quick-item"
                onMouseMove={() => setActive(i)}
                onClick={() => go(r)}
              >
                <r.icon aria-hidden />
                <span className="quick-title">{r.title}</span>
                {r.detail && <small>{r.detail}</small>}
              </button>
            </li>
          ))}
          {enabled && !loading && orders.data?.items.length === 0 && products.data?.items.length === 0 && <li className="quick-empty">Nenhum pedido ou produto encontrado.</li>}
        </ul>
        <p className="quick-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </p>
      </div>
    </div>
  );
}
