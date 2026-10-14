import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { PlusIcon, StockIcon } from '../../components/admin/AdminIcons';
import { OrderAdvanceButton } from '../../components/admin/orders/OrderAdvanceButton';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../contexts/AuthContext';
import { useOrderAlerts } from '../../contexts/OrderAlertsContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { adminApi } from '../../lib/api';
import { brl, formatTime, lastDaysRange, timeAgo } from '../../lib/format';
import { ORDER_STAGES, startOfTodayIso, type OrderStageId } from '../../lib/labels';
import type { AdminOrderRow, DashboardSummary, SalesSeries, TopProducts } from '../../types/admin';
import type { Page } from '../../types/api';

const PRESETS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const presetRange = lastDaysRange;
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
/** "terça, 13 de outubro · 11:52" */
const dateLine = (now: number) => `${weekday.format(now).replace('-feira', '')}, ${dayMonth.format(now)} · ${formatTime(new Date(now))}`;
const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default function DashboardPage() {
  useDocumentTitle('Visão geral');
  const { me } = useAuth();
  const { counts } = useOrderAlerts();
  const now = useNow(30_000);
  const [stage, setStage] = useState<OrderStageId>('new');

  const today = useQuery({ queryKey: ['admin', 'dashboard', 'summary', 'today'], queryFn: () => adminApi.get<DashboardSummary>('/dashboard/summary', presetRange(1)) });
  const t = today.data;

  // Pedidos em aberto vêm do monitor ao vivo (atualiza a cada 15 s); concluídos hoje, do resumo do dia.
  const stageCount = (id: OrderStageId): number | null => {
    if (id === 'done') return t?.orders.completedInPeriod ?? null;
    const st = ORDER_STAGES.find((s) => s.id === id)!;
    if (counts) return st.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);
    if (!t) return null;
    return { new: t.orders.pending, progress: t.orders.inProgress, ready: t.orders.ready, delivery: t.orders.outForDelivery }[id];
  };
  const pending = stageCount('new') ?? 0;
  const firstName = me?.name.split(' ')[0];

  return (
    <>
      <div className="dash-head">
        <div className="dash-hello">
          <span className="mono-label">{dateLine(now)}</span>
          <h1 className="display">
            {greeting(now)}
            {firstName ? `, ${firstName}.` : '.'}
          </h1>
          <p>
            <b>{pending ? `${pending} pedido${pending > 1 ? 's' : ''} novo${pending > 1 ? 's' : ''} aguardando aceite` : 'Nenhum pedido novo aguardando'}</b> · o painel confere
            novos pedidos a cada 15 s.
          </p>
        </div>
        <div className="actions">
          <Link to="/admin/inventory" className="btn btn-outline">
            <StockIcon /> Registrar entrada
          </Link>
          <Link to="/admin/products/new" className="btn btn-gold">
            <PlusIcon /> Novo produto
          </Link>
        </div>
      </div>

      <section className="dash-flow" aria-labelledby="flow-title">
        <div className="section-bar">
          <h2 className="mono-label" id="flow-title">
            Fluxo de hoje
          </h2>
          <span className="hint">Toque numa etapa para ver a fila</span>
        </div>
        <div className="stage-strip" role="group" aria-label="Etapas dos pedidos">
          {ORDER_STAGES.map((s) => {
            const n = stageCount(s.id);
            const on = s.id === stage;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                aria-controls="stage-queue"
                className={`stage tone-${s.tone} ${on ? 'on' : ''} ${s.id === 'new' && n ? 'alert' : ''}`}
                onClick={() => setStage(s.id)}
              >
                <span className="stage-label">{s.label}</span>
                <b className="stage-num">{n === null ? '–' : pad2(n)}</b>
                <span className="stage-hint">{s.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {today.isError && <ErrorState error={today.error} onRetry={() => today.refetch()} />}

      <div className="dash-grid">
        <StageQueue stage={stage} now={now} />
        <section className="adm-panel" aria-labelledby="stock-title">
          <div className="panel-head">
            <h2 id="stock-title">Estoque em alerta {t && <span className="count danger">{t.products.lowStock + t.products.outOfStock}</span>}</h2>
            <Link to="/admin/inventory?stock=low" className="more-link">
              Estoque →
            </Link>
          </div>
          {today.isPending && <LoadingState />}
          {t && t.lowStockProducts.length === 0 && <p className="panel-empty">Nenhum produto ativo abaixo do estoque mínimo.</p>}
          {t && t.lowStockProducts.length > 0 && (
            <ul className="stock-alerts">
              {t.lowStockProducts.map((p) => {
                const out = p.stockQuantity === 0;
                const pct = Math.min(100, (p.stockQuantity / Math.max(1, p.minStock * 3)) * 100);
                return (
                  <li key={p.id}>
                    <Link to={`/admin/inventory?q=${encodeURIComponent(p.name)}`}>
                      <span className="sa-name">{p.name}</span>
                      <span className="meter" aria-hidden>
                        <span style={{ width: `${pct}%` }} className={out ? 'out' : 'low'} />
                      </span>
                      <span className={`sa-qty ${out ? 'out' : 'low'}`}>{out ? 'esgotado' : `${p.stockQuantity} / mín ${p.minStock}`}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <SalesSection />
    </>
  );
}

/** Fila da etapa escolhida: os pedidos mais recentes, com o botão que avança cada um. */
function StageQueue({ stage, now }: { stage: OrderStageId; now: number }) {
  const def = ORDER_STAGES.find((s) => s.id === stage)!;
  const filters = { status: def.statuses.join(','), from: stage === 'done' ? startOfTodayIso(now) : undefined, pageSize: 6 };
  const queue = useQuery({
    queryKey: ['admin', 'orders', 'queue', stage, filters.from],
    queryFn: () => adminApi.get<Page<AdminOrderRow>>('/orders', filters),
    placeholderData: keepPreviousData,
  });
  const items = queue.data?.items ?? [];
  const more = (queue.data?.total ?? 0) - items.length;

  return (
    <section className="adm-panel" id="stage-queue" aria-labelledby="queue-title" aria-busy={queue.isFetching}>
      <div className="panel-head">
        <h2 id="queue-title">Fila · {def.label.toLowerCase()}</h2>
        <Link to="/admin/orders" className="more-link">
          Abrir quadro de pedidos →
        </Link>
      </div>
      {queue.isPending && <LoadingState />}
      {queue.isError && !queue.data && <ErrorState error={queue.error} onRetry={() => queue.refetch()} />}
      {queue.data && items.length === 0 && <p className="panel-empty">Nenhum pedido nesta etapa agora.</p>}
      {items.length > 0 && (
        <ul className="queue">
          {items.map((o) => {
            const late = o.status === 'PENDING' && now - new Date(o.createdAt).getTime() > 15 * 60_000;
            return (
              <li key={o.id}>
                <Link to={`/admin/orders?pedido=${o.id}`} className="queue-main" aria-label={`Abrir pedido ${o.code} de ${o.customerName}`}>
                  <span className="q-code">
                    <b>{o.code}</b>
                    <small className={late ? 'late' : ''}>{timeAgo(o.createdAt, now)}</small>
                  </span>
                  <span className="q-who">
                    <b>
                      {o.customerName} <span>· {o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span>
                    </b>
                    <small>{o.itemsPreview.map((i) => `${i.quantity}× ${i.productName}`).join(' · ')}</small>
                  </span>
                  <b className="q-total">{brl(o.totalCents)}</b>
                </Link>
                <span className="q-action">
                  <OrderAdvanceButton order={o} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && (
        <p className="panel-foot">
          <Link to={`/admin/orders?modo=lista&view=${stage === 'done' ? 'done' : stage}`} className="more-link">
            Mais {more} pedido(s) nesta etapa →
          </Link>
        </p>
      )}
    </section>
  );
}

function SalesSection() {
  const [preset, setPreset] = useState<number | null>(30);
  const [range, setRange] = useState(presetRange(30));
  const [showTable, setShowTable] = useState(false);

  const summary = useQuery({ queryKey: ['admin', 'dashboard', 'summary', range], queryFn: () => adminApi.get<DashboardSummary>('/dashboard/summary', range) });
  const sales = useQuery({ queryKey: ['admin', 'dashboard', 'sales', range], queryFn: () => adminApi.get<SalesSeries>('/dashboard/sales', range) });
  const top = useQuery({ queryKey: ['admin', 'dashboard', 'top', range], queryFn: () => adminApi.get<TopProducts>('/dashboard/top-products', range) });
  const s = summary.data;
  const hasSales = !!sales.data?.items.some((d) => d.orders > 0 || d.paidCents > 0);

  return (
    <section className="adm-panel sales" aria-labelledby="sales-title">
      <div className="panel-head">
        <h2 id="sales-title">Vendas</h2>
        <div className="period-bar" role="group" aria-label="Período das vendas">
          <div className="seg">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={preset === p.days ? 'on' : ''}
                aria-pressed={preset === p.days}
                onClick={() => {
                  setPreset(p.days);
                  setRange(presetRange(p.days));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="from">
            De
          </label>
          <input
            id="from"
            type="date"
            className="input period-date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, from: e.target.value })))}
          />
          <label className="sr-only" htmlFor="to">
            Até
          </label>
          <input
            id="to"
            type="date"
            className="input period-date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, to: e.target.value })))}
          />
        </div>
      </div>

      {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
      <div className="kpis">
        <div className="kpi">
          <span>Pedidos recebidos</span>
          <strong>{s ? s.orders.total : '–'}</strong>
          <small>{s ? `${s.orders.cancelled} cancelado(s) · ${s.orders.expired} expirado(s)` : ' '}</small>
        </div>
        <div className="kpi">
          <span>Concluídos</span>
          <strong>{s ? s.orders.completedInPeriod : '–'}</strong>
          <small>Finalizados no período</small>
        </div>
        <div className="kpi accent">
          <span>Recebido (pago)</span>
          <strong>{s ? brl(s.revenue.confirmedCents) : '–'}</strong>
          <small>{s ? `${s.revenue.paidOrders} pedido(s) marcados como pagos` : ' '}</small>
        </div>
        <div className="kpi">
          <span>Ticket médio</span>
          <strong>{s?.revenue.paidOrders ? brl(s.revenue.averageTicketCents) : '–'}</strong>
          <small>Sobre pedidos pagos</small>
        </div>
      </div>

      <div className="sales-body">
        <div className="sales-chart">
          {sales.isPending && <LoadingState />}
          {sales.isError && <ErrorState error={sales.error} onRetry={() => sales.refetch()} />}
          {sales.data && !hasSales && <p className="panel-empty">Ainda não há pedidos no período selecionado.</p>}
          {sales.data && hasSales && (showTable ? <SalesTable items={sales.data.items} /> : <SalesBars items={sales.data.items} />)}
          {sales.data && hasSales && (
            <button type="button" className="link-btn chart-toggle" onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Ver gráfico' : 'Ver como tabela'}
            </button>
          )}
        </div>
        <div className="top-list">
          <h3 className="mono-label">Mais vendidos · {top.data?.criteria ?? 'unidades em pedidos aceitos'}</h3>
          {top.isPending && <LoadingState />}
          {top.isError && <ErrorState error={top.error} onRetry={() => top.refetch()} />}
          {top.data && top.data.items.length === 0 && <p className="panel-empty">Sem vendas aceitas no período.</p>}
          {top.data && top.data.items.length > 0 && (
            <ol>
              {top.data.items.map((p, i) => (
                <li key={`${p.productId}-${i}`} className={i < 3 ? 'podium' : ''}>
                  <span className="rank" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="tl-name">
                    {p.productId ? <Link to={`/admin/products/${p.productId}`}>{p.name}</Link> : p.name}
                    <small>{p.quantity} un.</small>
                  </span>
                  <b className="tl-value">{brl(p.valueCents)}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

/** Barras por dia: valor dos pedidos (tinta) e recebido (dourado). Passe o mouse ou use ← → para ver o dia. */
function SalesBars({ items }: { items: SalesSeries['items'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const hi = hover !== null && hover < items.length ? hover : items.length - 1;
  const max = Math.max(1, ...items.map((d) => Math.max(d.registeredCents, d.paidCents))) * 1.08;
  const every = Math.max(1, Math.ceil(items.length / 7));
  const d = items[hi]!;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover(Math.min(items.length - 1, Math.max(0, hi + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  return (
    <>
      <div className="chart-top">
        <div className="legend" aria-hidden>
          <span>
            <i className="ink" />
            Valor dos pedidos
          </span>
          <span>
            <i className="gold" />
            Recebido (pagos)
          </span>
        </div>
        <p className="chart-tip" aria-live="polite">
          <b>{shortDate(d.date)}</b> · {d.orders} pedido(s)
          <br />
          {brl(d.registeredCents)} · recebido {brl(d.paidCents)}
        </p>
      </div>
      <div
        className="bars"
        tabIndex={0}
        role="img"
        aria-label={`Gráfico de barras com o valor dos pedidos e o valor recebido por dia, de ${shortDate(items[0]!.date)} a ${shortDate(d.date)}. Use as setas para percorrer os dias ou "Ver como tabela".`}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
      >
        {items.map((it, i) => (
          <div key={it.date} className={`bar-col ${i === hi ? 'on' : ''}`} onMouseEnter={() => setHover(i)}>
            <span className="b-reg" style={{ height: `${(it.registeredCents / max) * 100}%` }} />
            <span className="b-paid" style={{ height: `${(it.paidCents / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="bar-ticks" aria-hidden>
        {items.map((it, i) => (
          <span key={it.date}>{i % every === 0 ? shortDate(it.date) : ''}</span>
        ))}
      </div>
    </>
  );
}

function SalesTable({ items }: { items: SalesSeries['items'] }) {
  return (
    <div className="table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Dia</th>
            <th className="num">Pedidos</th>
            <th className="num">Valor dos pedidos</th>
            <th className="num">Recebido</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.date}>
              <td>{shortDate(d.date)}</td>
              <td className="num">{d.orders}</td>
              <td className="num">{brl(d.registeredCents)}</td>
              <td className="num">{brl(d.paidCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
