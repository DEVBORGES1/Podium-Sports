import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader, TableState, Tag } from '../../components/admin/ui';
import { Pagination } from '../../components/ui/States';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { brl, formatDateTime, formatPhone } from '../../lib/format';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../lib/labels';
import type { AdminOrderRow } from '../../types/admin';
import type { OrderStatus, Page, PaymentStatus } from '../../types/api';

const STATUS_ORDER: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED'];
const PAYMENT_ORDER: PaymentStatus[] = ['UNPAID', 'PAID', 'REFUNDED'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte "AAAA-MM-DD" (data local) no instante ISO do início ou do fim daquele dia. */
function dayBoundary(value: string, end: boolean) {
  if (!DATE_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const isStatus = (v: string | null): v is OrderStatus => !!v && (STATUS_ORDER as string[]).includes(v);
const isPayment = (v: string | null): v is PaymentStatus => !!v && (PAYMENT_ORDER as string[]).includes(v);

export default function OrdersPage() {
  useDocumentTitle('Pedidos');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);

  const status = isStatus(params.get('status')) ? (params.get('status') as OrderStatus) : '';
  const paymentStatus = isPayment(params.get('paymentStatus')) ? (params.get('paymentStatus') as PaymentStatus) : '';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const page = Number(params.get('page')) || 1;

  const filters = {
    status,
    paymentStatus,
    q,
    from: dayBoundary(fromDate, false),
    to: dayBoundary(toDate, true),
    page,
    pageSize: 25,
  };

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const hasFilters = !!(status || paymentStatus || search.trim() || fromDate || toDate);
  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const orders = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', filters),
    placeholderData: keepPreviousData,
  });

  const invalidRange = fromDate && toDate && fromDate > toDate;

  return (
    <>
      <PageHeader title="Pedidos" description={orders.data ? `${orders.data.total} pedido(s) encontrado(s)` : 'Pedidos registrados pelo site.'} />

      <div className="period-bar" role="group" aria-label="Filtrar por status" style={{ marginBottom: 12 }}>
        <button type="button" className={`chip ${status === '' ? 'active' : ''}`} aria-pressed={status === ''} onClick={() => set('status', '')}>
          Todos
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" className={`chip ${status === s ? 'active' : ''}`} aria-pressed={status === s} onClick={() => set('status', s)}>
            {ORDER_STATUS[s].label}
          </button>
        ))}
      </div>

      <div className="filters-bar">
        <div className="field grow">
          <label htmlFor="orders-q">Buscar</label>
          <input
            id="orders-q"
            className="input"
            type="search"
            placeholder="Código (PS-…), nome ou telefone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              set('q', e.target.value.trim());
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="orders-payment">Pagamento</label>
          <select id="orders-payment" className="select" value={paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}>
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
          <input id="orders-from" className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="orders-to">Até</label>
          <input id="orders-to" className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => set('to', e.target.value)} />
        </div>
        {hasFilters && (
          <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
            Limpar filtros
          </button>
        )}
      </div>
      {invalidRange && (
        <p className="alert alert-warn" role="status" style={{ marginBottom: 12 }}>
          A data inicial é posterior à data final — nenhum pedido será encontrado.
        </p>
      )}

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Recebimento</th>
              <th className="num">Itens</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {orders.isPending || orders.isError || orders.data.items.length === 0 ? (
              <TableState
                colSpan={8}
                loading={orders.isPending}
                error={orders.error}
                empty={hasFilters ? 'Nenhum pedido encontrado com esses filtros.' : 'Nenhum pedido registrado ainda.'}
                onRetry={() => orders.refetch()}
              />
            ) : (
              orders.data.items.map((o) => {
                const st = ORDER_STATUS[o.status];
                const pay = PAYMENT_STATUS[o.paymentStatus];
                return (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>
                        <b>{o.code}</b>
                      </Link>
                      {o.whatsappOpenedAt && (
                        <div className="muted" title={`Cliente abriu o WhatsApp em ${formatDateTime(o.whatsappOpenedAt)} (não confirma o envio da mensagem)`}>
                          WhatsApp aberto
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.createdAt)}</td>
                    <td>
                      <div>{o.customerName}</div>
                      <div className="muted">{formatPhone(o.customerPhone)}</div>
                    </td>
                    <td>{o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}</td>
                    <td className="num">{o.itemCount}</td>
                    <td className="num">
                      <b>{brl(o.totalCents)}</b>
                    </td>
                    <td>
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                    <td>
                      <Tag tone={pay.tone}>{pay.label}</Tag>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={(p) => set('page', String(p))} />}
      <p className="notice" style={{ marginTop: 12 }}>
        "WhatsApp aberto" indica apenas que o cliente abriu o aplicativo a partir do site — não confirma que a mensagem foi enviada. O pagamento é marcado como pago manualmente pela loja.
      </p>
    </>
  );
}
