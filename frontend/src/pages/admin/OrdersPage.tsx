import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ExternalIcon, SearchIcon, StoreIcon, TruckIcon } from '../../components/admin/AdminIcons';
import { Drawer } from '../../components/admin/Drawer';
import { OrderAdvanceButton } from '../../components/admin/orders/OrderAdvanceButton';
import { OrderDetail } from '../../components/admin/orders/OrderDetail';
import { PageHeader, Tag } from '../../components/admin/ui';
import { EmptyState, ErrorState, Pagination } from '../../components/ui/States';
import { useOrderAlerts } from '../../contexts/OrderAlertsContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { adminApi } from '../../lib/api';
import { brl, formatDateTime, formatPhone, timeAgo } from '../../lib/format';
import { ORDER_STAGES, ORDER_STATUS, orderStatusLabel, PAYMENT_STATUS, startOfTodayIso } from '../../lib/labels';
import type { AdminOrderRow } from '../../types/admin';
import type { OrderStatus, Page, PaymentStatus } from '../../types/api';

/** Abas organizadas pelo que a loja precisa fazer agora. */
const VIEWS = [
  { id: 'open', label: 'Em aberto', statuses: ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY'] },
  { id: 'new', label: 'Novos', statuses: ['PENDING'] },
  { id: 'progress', label: 'Em separação', statuses: ['ACCEPTED', 'PROCESSING'] },
  { id: 'ready', label: 'Prontos', statuses: ['READY'] },
  { id: 'delivery', label: 'Saiu para entrega', statuses: ['OUT_FOR_DELIVERY'] },
  { id: 'done', label: 'Concluídos', statuses: ['COMPLETED'] },
  { id: 'cancelled', label: 'Cancelados', statuses: ['CANCELLED', 'EXPIRED'] },
  { id: 'all', label: 'Todos', statuses: [] },
] as const satisfies readonly { id: string; label: string; statuses: readonly OrderStatus[] }[];

const PAYMENT_ORDER: PaymentStatus[] = ['UNPAID', 'PAID', 'REFUNDED'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte "AAAA-MM-DD" (data local) no instante ISO do início ou do fim daquele dia. */
function dayBoundary(value: string, end: boolean) {
  if (!DATE_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const isPayment = (v: string | null): v is PaymentStatus => !!v && (PAYMENT_ORDER as string[]).includes(v);
/** Abas que o quadro já mostra como colunas; as demais (concluídos, cancelados, todos) abrem a lista. */
const BOARD_VIEWS = ['open', 'new', 'progress', 'ready', 'delivery'];
const OPEN_STATUSES = ORDER_STAGES.slice(0, 4).flatMap((s) => s.statuses);

export default function OrdersPage() {
  useDocumentTitle('Pedidos');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const { counts, newOrderIds } = useOrderAlerts();

  const viewParam = params.get('view');
  const mode: 'board' | 'list' = params.get('modo') === 'lista' || (viewParam && !BOARD_VIEWS.includes(viewParam)) ? 'list' : 'board';
  const view = VIEWS.find((v) => v.id === viewParam) ?? VIEWS[0];
  const paymentStatus = isPayment(params.get('paymentStatus')) ? (params.get('paymentStatus') as PaymentStatus) : '';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const page = Number(params.get('page')) || 1;
  const selectedId = params.get('pedido');
  const [showFilters, setShowFilters] = useState(!!(paymentStatus || fromDate || toDate));

  const filters = {
    status: view.statuses.join(','),
    paymentStatus,
    q,
    from: dayBoundary(fromDate, false),
    to: dayBoundary(toDate, true),
    page,
    pageSize: 20,
  };

  const set = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };
  const openOrder = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('pedido', id);
    else next.delete('pedido');
    setParams(next);
  };

  const hasFilters = !!(paymentStatus || search.trim() || fromDate || toDate);
  const clearFilters = () => {
    setSearch('');
    set({ q: '', paymentStatus: '', from: '', to: '' });
  };

  const orders = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', filters),
    placeholderData: keepPreviousData,
    enabled: mode === 'list',
  });

  const countFor = (statuses: readonly OrderStatus[]) => (counts && statuses.length ? statuses.reduce((s, st) => s + (counts[st] ?? 0), 0) : null);
  const invalidRange = fromDate && toDate && fromDate > toDate;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = VIEWS[(index + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length]!;
    set({ view: next.id === 'open' ? '' : next.id });
    document.getElementById(`view-${next.id}`)?.focus();
  };

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={
          counts ? (
            counts.PENDING > 0 ? (
              <>
                <b className="pending-hint">
                  {counts.PENDING} pedido{counts.PENDING > 1 ? 's' : ''} novo{counts.PENDING > 1 ? 's' : ''} aguardando aceite
                </b>{' '}
                · a lista atualiza sozinha.
              </>
            ) : (
              'Nenhum pedido novo aguardando. A lista atualiza sozinha.'
            )
          ) : (
            'Pedidos registrados pelo site.'
          )
        }
        actions={
          <div className="orders-toolbar">
            <div className="search-field">
              <SearchIcon aria-hidden />
              <label htmlFor="orders-q" className="sr-only">
                Buscar pedido
              </label>
              <input
                id="orders-q"
                className="input"
                type="search"
                placeholder="Código, nome ou telefone"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  set({ q: e.target.value.trim() });
                }}
              />
            </div>
            <button
              type="button"
              className={`btn btn-outline ${showFilters ? 'on' : ''}`}
              aria-expanded={showFilters}
              aria-controls="orders-more"
              onClick={() => setShowFilters((v) => !v)}
            >
              Pagamento · período
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-quiet" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
            <div className="seg" role="group" aria-label="Forma de exibição">
              <button type="button" className={mode === 'board' ? 'on' : ''} aria-pressed={mode === 'board'} onClick={() => set({ modo: '', view: '' })}>
                Quadro
              </button>
              <button type="button" className={mode === 'list' ? 'on' : ''} aria-pressed={mode === 'list'} onClick={() => set({ modo: 'lista' })}>
                Lista
              </button>
            </div>
          </div>
        }
      />

      {mode === 'list' && (
        <div className="view-tabs" role="tablist" aria-label="Situação dos pedidos">
          {VIEWS.map((v, i) => {
            const n = countFor(v.statuses);
            const selected = v.id === view.id;
            return (
              <button
                key={v.id}
                id={`view-${v.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`view-tab ${v.id === 'new' && n ? 'has-new' : ''}`}
                onClick={() => set({ view: v.id === 'open' ? '' : v.id })}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {v.label}
                {n !== null && v.id !== 'done' && v.id !== 'cancelled' && <span className="count">{n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {showFilters && (
        <div className="filters-bar" id="orders-more">
          <div className="field">
            <label htmlFor="orders-payment">Pagamento</label>
            <select id="orders-payment" className="select" value={paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })}>
              <option value="">Todos</option>
              {PAYMENT_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_STATUS[p].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="orders-from">De</label>
            <input id="orders-from" className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="orders-to">Até</label>
            <input id="orders-to" className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </div>
      )}
      {invalidRange && (
        <p className="alert alert-warn" role="status">
          A data inicial é posterior à data final — nenhum pedido será encontrado.
        </p>
      )}

      {mode === 'board' ? (
        <OrderBoard filters={filters} newOrderIds={newOrderIds} selectedId={selectedId} onOpen={openOrder} />
      ) : (
        <>
          <div role="tabpanel" aria-labelledby={`view-${view.id}`} aria-busy={orders.isFetching}>
            {orders.isPending ? (
              <div className="order-list" aria-label="Carregando pedidos">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="order-row skeleton" style={{ height: 96 }} />
                ))}
              </div>
            ) : orders.isError && !orders.data ? (
              <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
            ) : orders.data.items.length === 0 ? (
              <div className="adm-card">
                <EmptyState title={hasFilters ? 'Nenhum pedido encontrado' : view.id === 'new' ? 'Nenhum pedido novo' : 'Nada por aqui'}>
                  <p>
                    {hasFilters
                      ? 'Tente outro termo de busca ou limpe os filtros.'
                      : view.id === 'new' || view.id === 'open'
                        ? 'Quando chegar um pedido, ele aparece aqui automaticamente.'
                        : 'Nenhum pedido nesta situação.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                {orders.isError && (
                  <p className="alert alert-error" role="alert">
                    Não foi possível atualizar a lista agora. Mostrando os dados anteriores.
                  </p>
                )}
                <ul className="order-list">
                  {orders.data.items.map((o) => (
                    <OrderRow key={o.id} order={o} isNew={newOrderIds.has(o.id)} onOpen={() => openOrder(o.id)} />
                  ))}
                </ul>
                <p className="notice list-foot">
                  {orders.data.total} pedido(s) · “WhatsApp aberto” indica apenas que o cliente abriu o aplicativo pelo site — não confirma o envio.
                </p>
              </>
            )}
          </div>
          {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={(p) => set({ page: String(p) }, true)} />}
        </>
      )}

      {selectedId && (
        <Drawer
          title="Detalhes do pedido"
          onClose={() => openOrder(null)}
          actions={
            <Link to={`/admin/orders/${selectedId}`} className="btn btn-quiet btn-sm" aria-label="Abrir em página inteira">
              <ExternalIcon /> <span className="hide-sm">Página inteira</span>
            </Link>
          }
        >
          <OrderDetail id={selectedId} onNavigateAway={() => openOrder(null)} />
        </Drawer>
      )}
    </>
  );
}

function OrderRow({ order: o, isNew, onOpen }: { order: AdminOrderRow; isNew: boolean; onOpen: () => void }) {
  const now = useNow(30_000);
  const st = ORDER_STATUS[o.status];
  const extra = o.itemCount - o.itemsPreview.length;
  const waitingLong = o.status === 'PENDING' && now - new Date(o.createdAt).getTime() > 15 * 60_000;

  return (
    <li className={`order-row ${isNew ? 'is-new' : ''} st-${o.status.toLowerCase()}`}>
      <button type="button" className="order-main" onClick={onOpen} aria-label={`Abrir pedido ${o.code} de ${o.customerName}`}>
        <span className="order-top">
          <b className="oc-code">{o.code}</b>
          {isNew && <span className="new-flag">Novo</span>}
          <Tag tone={st.tone}>{orderStatusLabel(o.status, o.fulfillment)}</Tag>
          <span className={`ago ${waitingLong ? 'late' : ''}`} title={formatDateTime(o.createdAt)}>
            {timeAgo(o.createdAt, now)}
          </span>
        </span>
        <span className="order-customer">
          <span className="oc-name">{o.customerName}</span>
          <span className="oc-phone">{formatPhone(o.customerPhone)}</span>
        </span>
        <span className="order-items">
          {o.itemsPreview.map((i) => `${i.quantity}× ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join(' · ')}
          {extra > 0 && ` · +${extra} item(ns)`}
        </span>
        <OrderMeta order={o} />
      </button>
      <div className="order-side">
        <strong className="os-total">{brl(o.totalCents)}</strong>
        {o.allowedTransitions.some((t) => t !== 'CANCELLED') ? (
          <OrderAdvanceButton order={o} />
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onOpen}>
            Detalhes
          </button>
        )}
      </div>
    </li>
  );
}

function OrderMeta({ order: o, children }: { order: AdminOrderRow; children?: ReactNode }) {
  const pay = PAYMENT_STATUS[o.paymentStatus];
  return (
    <span className="order-meta">
      <span className="fulfil">
        {o.fulfillment === 'DELIVERY' ? <TruckIcon /> : <StoreIcon />}
        {o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}
      </span>
      {o.paymentStatus !== 'UNPAID' && <Tag tone={pay.tone}>{pay.label}</Tag>}
      {o.whatsappOpenedAt && <span className="muted">WhatsApp aberto</span>}
      {children}
    </span>
  );
}

type BoardFilters = { q: string; paymentStatus: string; from?: string; to?: string };

/**
 * Quadro por etapa (Novos → Em separação → Prontos → Saiu para entrega) e a coluna de concluídos hoje.
 * O botão de cada cartão avança o pedido; os dados vêm do servidor e atualizam com o monitor de pedidos.
 */
function OrderBoard({
  filters,
  newOrderIds,
  selectedId,
  onOpen,
}: {
  filters: BoardFilters;
  newOrderIds: ReadonlySet<string>;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const now = useNow(30_000);
  const today = startOfTodayIso(now);
  const base = { q: filters.q, paymentStatus: filters.paymentStatus, to: filters.to };
  const open = useQuery({
    queryKey: ['admin', 'orders', 'board', { ...base, from: filters.from }],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', { ...base, from: filters.from, status: OPEN_STATUSES.join(','), pageSize: 100 }),
    placeholderData: keepPreviousData,
  });
  const doneFrom = filters.from && filters.from > today ? filters.from : today;
  const done = useQuery({
    queryKey: ['admin', 'orders', 'board-done', { ...base, from: doneFrom }],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', { ...base, from: doneFrom, status: 'COMPLETED', pageSize: 30 }),
    placeholderData: keepPreviousData,
  });

  if (open.isPending) {
    return (
      <div className="board" aria-label="Carregando pedidos">
        {ORDER_STAGES.map((st) => (
          <div key={st.id} className="board-col">
            <div className="skeleton" style={{ height: 180 }} />
          </div>
        ))}
      </div>
    );
  }
  if (open.isError && !open.data) return <ErrorState error={open.error} onRetry={() => open.refetch()} />;

  const items = open.data.items;
  return (
    <>
      {open.isError && (
        <p className="alert alert-error" role="alert">
          Não foi possível atualizar o quadro agora. Mostrando os dados anteriores.
        </p>
      )}
      {open.data.total > items.length && (
        <p className="alert alert-warn" role="status">
          Mostrando os {items.length} pedidos em aberto mais recentes de {open.data.total}. Use a busca ou a lista para encontrar os demais.
        </p>
      )}
      <div className="board" aria-busy={open.isFetching}>
        {ORDER_STAGES.slice(0, 4).map((st) => {
          const cards = items.filter((o) => (st.statuses as readonly OrderStatus[]).includes(o.status));
          return (
            <section key={st.id} className={`board-col tone-${st.tone}`} aria-labelledby={`col-${st.id}`}>
              <h2 className="board-col-head" id={`col-${st.id}`}>
                <span>{st.label}</span>
                <span className="count">{cards.length}</span>
              </h2>
              {cards.map((o) => (
                <OrderCard key={o.id} order={o} now={now} isNew={newOrderIds.has(o.id)} selected={o.id === selectedId} onOpen={() => onOpen(o.id)} />
              ))}
              {cards.length === 0 && <p className="board-empty">Nada nesta etapa.</p>}
            </section>
          );
        })}
        <section className="board-col board-done tone-ok" aria-labelledby="col-done">
          <h2 className="board-col-head" id="col-done">
            <span>Concluídos hoje</span>
            <span className="count">{done.data?.total ?? '–'}</span>
          </h2>
          {done.data?.items.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`done-row ${o.id === selectedId ? 'selected' : ''}`}
              onClick={() => onOpen(o.id)}
              aria-label={`Abrir pedido ${o.code} de ${o.customerName}`}
            >
              <b>{o.code}</b>
              <span>
                {o.customerName.split(' ')[0]}
                <span className="mono">{brl(o.totalCents)}</span>
              </span>
            </button>
          ))}
          {done.data && done.data.items.length === 0 && <p className="board-empty">Nenhum pedido concluído hoje.</p>}
          {done.data && done.data.total > done.data.items.length && (
            <Link to="/admin/orders?modo=lista&view=done" className="more-link">
              Ver todos os concluídos →
            </Link>
          )}
        </section>
      </div>
      <p className="notice list-foot">“WhatsApp aberto” indica apenas que o cliente abriu o aplicativo pelo site — não confirma o envio.</p>
    </>
  );
}

function OrderCard({ order: o, now, isNew, selected, onOpen }: { order: AdminOrderRow; now: number; isNew: boolean; selected: boolean; onOpen: () => void }) {
  const late = o.status === 'PENDING' && now - new Date(o.createdAt).getTime() > 15 * 60_000;
  const extra = o.itemCount - o.itemsPreview.length;
  return (
    <article className={`order-card st-${o.status.toLowerCase()} ${isNew ? 'is-new' : ''} ${selected ? 'selected' : ''}`}>
      <button type="button" className="oc-main" onClick={onOpen} aria-label={`Abrir pedido ${o.code} de ${o.customerName}`}>
        <span className="oc-top">
          <b className="oc-code">{o.code}</b>
          {isNew && <span className="new-flag">Novo</span>}
          <span className={`ago ${late ? 'late' : ''}`} title={formatDateTime(o.createdAt)}>
            {timeAgo(o.createdAt, now)}
          </span>
        </span>
        <span className="oc-who">
          <b>{o.customerName}</b>
          <small>{formatPhone(o.customerPhone)}</small>
        </span>
        <span className="oc-items">
          {o.itemsPreview.map((i) => `${i.quantity}× ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join(' · ')}
          {extra > 0 && ` · +${extra} item(ns)`}
        </span>
        {o.status === 'ACCEPTED' && <span className="oc-sub">Aceito · aguardando separação</span>}
        <span className="oc-foot">
          <OrderMeta order={o} />
          <b className="oc-total">{brl(o.totalCents)}</b>
        </span>
      </button>
      <OrderAdvanceButton order={o} className="btn-block" arrow />
    </article>
  );
}
