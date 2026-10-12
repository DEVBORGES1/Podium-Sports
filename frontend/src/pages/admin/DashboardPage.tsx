import { useQuery } from '@tanstack/react-query';
import { useState, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ImageIcon, OrdersIcon, PercentIcon, PlusIcon, StockIcon } from '../../components/admin/AdminIcons';
import { PageHeader, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { adminApi } from '../../lib/api';
import { brl, timeAgo } from '../../lib/format';
import { ORDER_STATUS, orderStatusLabel } from '../../lib/labels';
import type { DashboardSummary, SalesSeries, TopProducts } from '../../types/admin';

const PRESETS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
function presetRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: iso(from), to: iso(to) };
}
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Card de tarefa: número grande e link direto para a lista correspondente. */
function TaskCard({ to, label, value, hint, tone }: { to: string; label: string; value: number; hint: string; tone?: 'alert' | 'gold' | 'info' }) {
  return (
    <Link to={to} className={`task-card ${value > 0 && tone ? `tone-${tone}` : ''}`}>
      <span className="task-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Link>
  );
}

const SHORTCUTS: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/admin/orders?view=new', label: 'Ver pedidos novos', icon: OrdersIcon },
  { to: '/admin/products/new', label: 'Cadastrar produto', icon: PlusIcon },
  { to: '/admin/inventory', label: 'Atualizar estoque', icon: StockIcon },
  { to: '/admin/banners', label: 'Trocar banners', icon: ImageIcon },
  { to: '/admin/promotions/new', label: 'Criar promoção', icon: PercentIcon },
];

export default function DashboardPage() {
  useDocumentTitle('Visão geral');
  const { me } = useAuth();
  const now = useNow(60_000);
  const [preset, setPreset] = useState<number | null>(30);
  const [range, setRange] = useState(presetRange(30));
  const [showTable, setShowTable] = useState(false);

  const today = useQuery({ queryKey: ['admin', 'dashboard', 'summary', 'today'], queryFn: () => adminApi.get<DashboardSummary>('/dashboard/summary', presetRange(1)) });
  const summary = useQuery({ queryKey: ['admin', 'dashboard', 'summary', range], queryFn: () => adminApi.get<DashboardSummary>('/dashboard/summary', range) });
  const sales = useQuery({ queryKey: ['admin', 'dashboard', 'sales', range], queryFn: () => adminApi.get<SalesSeries>('/dashboard/sales', range) });
  const top = useQuery({ queryKey: ['admin', 'dashboard', 'top', range], queryFn: () => adminApi.get<TopProducts>('/dashboard/top-products', range) });

  const t = today.data;
  const s = summary.data;
  const hasSales = !!sales.data?.items.some((d) => d.orders > 0 || d.paidCents > 0);
  const firstName = me?.name.split(' ')[0];

  return (
    <>
      <PageHeader title="Visão geral" description={firstName ? `Olá, ${firstName}! Aqui está o que precisa de atenção agora.` : 'O que precisa de atenção agora.'} />

      {today.isPending && <LoadingState />}
      {today.isError && <ErrorState error={today.error} onRetry={() => today.refetch()} />}
      {t && (
        <div className="task-grid">
          <TaskCard to="/admin/orders?view=new" label="Pedidos novos" value={t.orders.pending} hint="Aguardando aceite" tone="alert" />
          <TaskCard to="/admin/orders?view=progress" label="Em separação" value={t.orders.inProgress} hint="Aceitos ou sendo separados" tone="info" />
          <TaskCard to="/admin/orders?view=ready" label="Prontos" value={t.orders.ready} hint="Para retirada ou envio" tone="gold" />
          <TaskCard to="/admin/orders?view=delivery" label="Saíram para entrega" value={t.orders.outForDelivery} hint="A caminho do cliente" tone="gold" />
          <TaskCard to="/admin/orders?view=done" label="Concluídos hoje" value={t.orders.completedInPeriod} hint={`${t.orders.today} pedido(s) recebido(s) hoje`} />
          <TaskCard
            to="/admin/inventory?stock=low"
            label="Estoque baixo"
            value={t.products.lowStock + t.products.outOfStock}
            hint={t.products.outOfStock > 0 ? `${t.products.outOfStock} esgotado(s)` : 'Abaixo do mínimo'}
            tone="alert"
          />
        </div>
      )}

      <nav className="shortcuts" aria-label="Atalhos">
        {SHORTCUTS.map((sc) => (
          <Link key={sc.to} to={sc.to} className="btn btn-outline btn-sm">
            <sc.icon /> {sc.label}
          </Link>
        ))}
      </nav>

      <div className="adm-grid cols-2">
        <section className="adm-card">
          <h2>
            Pedidos recentes
            <Link to="/admin/orders" className="link-btn">
              Ver todos
            </Link>
          </h2>
          {t && t.recentOrders.length === 0 && <p className="notice">Nenhum pedido registrado ainda. Quando chegar um, ele aparece aqui e o painel avisa.</p>}
          {t && t.recentOrders.length > 0 && (
            <ul className="mini-list">
              {t.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/orders?pedido=${o.id}`} className="mini-row">
                    <span>
                      <span>
                        <b>{o.code}</b> · {o.customerName}
                      </span>
                      <small>{timeAgo(o.createdAt, now)}</small>
                    </span>
                    <span className="mini-end">
                      <Tag tone={ORDER_STATUS[o.status].tone}>{orderStatusLabel(o.status, o.fulfillment)}</Tag>
                      <b>{brl(o.totalCents)}</b>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="adm-card">
          <h2>
            Estoque baixo ou esgotado
            <Link to="/admin/inventory?stock=low" className="link-btn">
              Ver estoque
            </Link>
          </h2>
          {t && t.lowStockProducts.length === 0 && <p className="notice">Nenhum produto ativo abaixo do estoque mínimo.</p>}
          {t && t.lowStockProducts.length > 0 && (
            <ul className="mini-list">
              {t.lowStockProducts.map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/inventory?q=${encodeURIComponent(p.name)}`} className="mini-row">
                    <span>
                      {p.name}
                      <small>Mínimo: {p.minStock}</small>
                    </span>
                    <span className="mini-end">{p.stockQuantity === 0 ? <Tag tone="danger">Esgotado</Tag> : <Tag tone="warn">{p.stockQuantity} un.</Tag>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="adm-card sales-card">
        <div className="sales-head">
          <h2>Vendas</h2>
          <div className="period-bar" role="group" aria-label="Período das vendas">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={`chip ${preset === p.days ? 'active' : ''}`}
                aria-pressed={preset === p.days}
                onClick={() => {
                  setPreset(p.days);
                  setRange(presetRange(p.days));
                }}
              >
                {p.label}
              </button>
            ))}
            <label className="sr-only" htmlFor="from">
              De
            </label>
            <input id="from" type="date" className="input period-date" value={range.from} max={range.to} onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, from: e.target.value })))} />
            <label className="sr-only" htmlFor="to">
              Até
            </label>
            <input id="to" type="date" className="input period-date" value={range.to} min={range.from} onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, to: e.target.value })))} />
          </div>
        </div>
        {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
        {s && (
          <div className="kpis">
            <div className="kpi">
              <span>Pedidos recebidos</span>
              <strong>{s.orders.total}</strong>
              <small>
                {s.orders.cancelled} cancelado(s) · {s.orders.expired} expirado(s)
              </small>
            </div>
            <div className="kpi">
              <span>Concluídos</span>
              <strong>{s.orders.completedInPeriod}</strong>
              <small>Finalizados no período</small>
            </div>
            <div className="kpi accent">
              <span>Recebido (pago)</span>
              <strong>{brl(s.revenue.confirmedCents)}</strong>
              <small>{s.revenue.paidOrders} pedido(s) marcados como pagos</small>
            </div>
            <div className="kpi">
              <span>Ticket médio</span>
              <strong>{s.revenue.paidOrders ? brl(s.revenue.averageTicketCents) : '—'}</strong>
              <small>Sobre pedidos pagos</small>
            </div>
          </div>
        )}
        <h3 className="sub-title">
          Por dia
          <button type="button" className="link-btn" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        </h3>
        {sales.isPending && <LoadingState />}
        {sales.isError && <ErrorState error={sales.error} onRetry={() => sales.refetch()} />}
        {sales.data && !hasSales && <p className="notice">Ainda não há pedidos no período selecionado.</p>}
        {sales.data && hasSales && !showTable && (
          <>
            <div className="legend" aria-hidden>
              <span>
                <i style={{ background: 'var(--series-1)' }} />
                Valor dos pedidos (não cancelados)
              </span>
              <span>
                <i style={{ background: 'var(--series-2)' }} />
                Recebido (pagos)
              </span>
            </div>
            <div className="chart-box" role="img" aria-label="Gráfico de barras com o valor dos pedidos e o valor recebido por dia. Use 'Ver tabela' para os números.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales.data.items} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tickFormatter={(v: number) => `R$${Math.round(v / 100)}`} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip
                    cursor={{ fill: 'var(--soft)' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="chart-tip">
                          <b>{shortDate(String(label))}</b>
                          <div>Pedidos: {payload[0]?.payload.orders}</div>
                          <div>Valor dos pedidos: {brl(Number(payload[0]?.payload.registeredCents))}</div>
                          <div>Recebido: {brl(Number(payload[0]?.payload.paidCents))}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="registeredCents" name="Valor dos pedidos" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="paidCents" name="Recebido" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        {sales.data && hasSales && showTable && (
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
                {sales.data.items.map((d) => (
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
        )}

        <h3 className="sub-title">
          Mais vendidos <small>{top.data?.criteria}</small>
        </h3>
        {top.isPending && <LoadingState />}
        {top.isError && <ErrorState error={top.error} onRetry={() => top.refetch()} />}
        {top.data && top.data.items.length === 0 && <p className="notice">Sem vendas aceitas no período.</p>}
        {top.data && top.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {top.data.items.map((p, i) => (
                  <tr key={`${p.productId}-${i}`}>
                    <td>{p.productId ? <Link to={`/admin/products/${p.productId}`}>{p.name}</Link> : p.name}</td>
                    <td className="num">{p.quantity}</td>
                    <td className="num">{brl(p.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
