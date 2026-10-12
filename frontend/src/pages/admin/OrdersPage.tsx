import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ExternalIcon, SearchIcon, StoreIcon, TruckIcon } from '../../components/admin/AdminIcons';
import { Drawer } from '../../components/admin/Drawer';
import { OrderDetail } from '../../components/admin/orders/OrderDetail';
import { ConfirmDialog, PageHeader, Tag } from '../../components/admin/ui';
import { EmptyState, ErrorState, Pagination } from '../../components/ui/States';
import { useOrderAlerts } from '../../contexts/OrderAlertsContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { useChangeOrderStatus } from '../../hooks/useOrderActions';
import { adminApi } from '../../lib/api';
import { brl, formatDateTime, formatPhone, timeAgo } from '../../lib/format';
import { needsConfirmation, ORDER_ACTION_SHORT, ORDER_STATUS, orderActionLabel, orderStatusLabel, PAYMENT_STATUS, primaryTransition } from '../../lib/labels';
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

export default function OrdersPage() {
  useDocumentTitle('Pedidos');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const { counts, newOrderIds } = useOrderAlerts();

  const viewParam = params.get('view');
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
      />

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
        <button type="button" className="btn btn-outline btn-sm" aria-expanded={showFilters} aria-controls="orders-more" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Menos filtros' : 'Mais filtros'}
        </button>
        {hasFilters && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={clearFilters}>
            Limpar filtros
          </button>
        )}
      </div>
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
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const change = useChangeOrderStatus({ onSaved: () => setConfirming(null) });
  const st = ORDER_STATUS[o.status];
  const pay = PAYMENT_STATUS[o.paymentStatus];
  const next = primaryTransition(o.allowedTransitions);
  const extra = o.itemCount - o.itemsPreview.length;
  const waitingLong = o.status === 'PENDING' && now - new Date(o.createdAt).getTime() > 15 * 60_000;

  const run = (to: OrderStatus) => {
    if (needsConfirmation(to)) return setConfirming(to);
    change.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to });
  };

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
          {o.itemsPreview.map((i) => `${i.quantity}× ${i.productName}`).join(' · ')}
          {extra > 0 && ` · +${extra} item(ns)`}
        </span>
        <span className="order-meta">
          <span className="fulfil">
            {o.fulfillment === 'DELIVERY' ? <TruckIcon /> : <StoreIcon />}
            {o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}
          </span>
          {o.paymentStatus !== 'UNPAID' && <Tag tone={pay.tone}>{pay.label}</Tag>}
          {o.whatsappOpenedAt && <span className="muted">WhatsApp aberto</span>}
        </span>
      </button>
      <div className="order-side">
        <strong className="os-total">{brl(o.totalCents)}</strong>
        {next ? (
          <button
            type="button"
            className={`btn btn-sm ${o.status === 'PENDING' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => run(next)}
            disabled={change.isPending}
            aria-busy={change.isPending}
            aria-label={`${orderActionLabel(next, o.fulfillment)}: ${o.code}`}
          >
            {ORDER_ACTION_SHORT[next] ?? orderActionLabel(next, o.fulfillment)}
          </button>
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onOpen}>
            Detalhes
          </button>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={`${orderActionLabel(confirming, o.fulfillment)}?`}
          message={
            <p>
              O pedido <b>{o.code}</b> de {o.customerName} será marcado como <b>{orderStatusLabel(confirming, o.fulfillment)}</b> e não volta para etapas anteriores.
              {o.paymentStatus === 'UNPAID' && ' O pagamento ainda consta como não pago.'}
            </p>
          }
          confirmLabel={orderActionLabel(confirming, o.fulfillment)}
          busy={change.isPending}
          onConfirm={() => change.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to: confirming }, { onError: () => setConfirming(null) })}
          onCancel={() => !change.isPending && setConfirming(null)}
        />
      )}
    </li>
  );
}
