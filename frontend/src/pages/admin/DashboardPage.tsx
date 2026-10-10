import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { brl, formatDateTime } from '../../lib/format';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../lib/labels';
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

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const [preset, setPreset] = useState<number | null>(30);
  const [range, setRange] = useState(presetRange(30));
  const [showTable, setShowTable] = useState(false);

  const summary = useQuery({ queryKey: ['admin', 'dashboard', 'summary', range], queryFn: () => adminApi.get<DashboardSummary>('/dashboard/summary', range) });
  const sales = useQuery({ queryKey: ['admin', 'dashboard', 'sales', range], queryFn: () => adminApi.get<SalesSeries>('/dashboard/sales', range) });
  const top = useQuery({ queryKey: ['admin', 'dashboard', 'top', range], queryFn: () => adminApi.get<TopProducts>('/dashboard/top-products', range) });

  const s = summary.data;
  const hasSales = !!sales.data?.items.some((d) => d.orders > 0 || d.paidCents > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Indicadores calculados a partir dos pedidos registrados. Receita confirmada considera somente pedidos marcados como pagos."
        actions={
          <div className="period-bar" role="group" aria-label="Período">
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
            <input id="from" type="date" className="input" style={{ width: 150, padding: 7 }} value={range.from} max={range.to} onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, from: e.target.value })))} />
            <label className="sr-only" htmlFor="to">
              Até
            </label>
            <input id="to" type="date" className="input" style={{ width: 150, padding: 7 }} value={range.to} min={range.from} onChange={(e) => e.target.value && (setPreset(null), setRange((r) => ({ ...r, to: e.target.value })))} />
          </div>
        }
      />

      {summary.isPending && <LoadingState />}
      {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
      {s && (
        <>
          <div className="kpis">
            <Kpi label="Aguardando atendimento" value={s.orders.pending} hint="Agora" accent={s.orders.pending > 0} />
            <Kpi label="Em andamento" value={s.orders.inProgress} hint="Aceitos, em separação ou prontos" />
            <Kpi label="Pedidos hoje" value={s.orders.today} />
            <Kpi label="Pedidos no período" value={s.orders.total} hint={`${s.orders.cancelled} cancelado(s) · ${s.orders.expired} expirado(s)`} />
            <Kpi label="Receita confirmada" value={brl(s.revenue.confirmedCents)} hint={`${s.revenue.paidOrders} pedido(s) pagos no período`} accent />
            <Kpi label="Ticket médio" value={s.revenue.paidOrders ? brl(s.revenue.averageTicketCents) : '—'} hint="Sobre pedidos pagos" />
            <Kpi label="Valor em pedidos registrados" value={brl(s.revenue.registeredValueCents)} hint="Não é receita: inclui pedidos não pagos" />
            <Kpi label="WhatsApp aberto" value={s.orders.total ? `${Math.round((s.orders.whatsappOpened / s.orders.total) * 100)}%` : '—'} hint="Clientes que abriram o WhatsApp após registrar" />
          </div>
          <div className="kpis">
            <Kpi label="Produtos cadastrados" value={s.products.total} />
            <Kpi label="Produtos ativos" value={s.products.active} />
            <Kpi label="Estoque baixo" value={s.products.lowStock} accent={s.products.lowStock > 0} />
            <Kpi label="Sem estoque" value={s.products.outOfStock} accent={s.products.outOfStock > 0} />
          </div>
        </>
      )}

      <section className="adm-card">
        <h2>
          Vendas por dia
          <button type="button" className="link-btn" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        </h2>
        {sales.isPending && <LoadingState />}
        {sales.isError && <ErrorState error={sales.error} onRetry={() => sales.refetch()} />}
        {sales.data && !hasSales && <p className="notice">Ainda não há pedidos no período selecionado.</p>}
        {sales.data && hasSales && !showTable && (
          <>
            <div className="legend" aria-hidden>
              <span>
                <i style={{ background: 'var(--series-1)' }} />
                Valor registrado (pedidos não cancelados)
              </span>
              <span>
                <i style={{ background: 'var(--series-2)' }} />
                Receita confirmada (pagos)
              </span>
            </div>
            <div className="chart-box" role="img" aria-label="Gráfico de barras com valor registrado e receita confirmada por dia. Use 'Ver tabela' para os números.">
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
                          <div>Registrado: {brl(Number(payload[0]?.payload.registeredCents))}</div>
                          <div>Confirmado: {brl(Number(payload[0]?.payload.paidCents))}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="registeredCents" name="Valor registrado" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="paidCents" name="Receita confirmada" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
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
                  <th className="num">Valor registrado</th>
                  <th className="num">Receita confirmada</th>
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
      </section>

      <div className="adm-grid cols-2" style={{ marginTop: 16 }}>
        <section className="adm-card">
          <h2>
            Mais vendidos <small>{top.data?.criteria}</small>
          </h2>
          {top.isPending && <LoadingState />}
          {top.isError && <ErrorState error={top.error} onRetry={() => top.refetch()} />}
          {top.data && top.data.items.length === 0 && <p className="notice">Sem vendas aceitas no período.</p>}
          {top.data && top.data.items.length > 0 && (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {top.data.items.map((t, i) => (
                  <tr key={`${t.productId}-${i}`}>
                    <td>{t.productId ? <Link to={`/admin/products/${t.productId}`}>{t.name}</Link> : t.name}</td>
                    <td className="num">{t.quantity}</td>
                    <td className="num">{brl(t.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="adm-card">
          <h2>
            Estoque baixo ou esgotado
            <Link to="/admin/inventory?stock=low" className="link-btn">
              Ver estoque
            </Link>
          </h2>
          {s && s.lowStockProducts.length === 0 && <p className="notice">Nenhum produto ativo abaixo do mínimo.</p>}
          {s && s.lowStockProducts.length > 0 && (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Saldo</th>
                  <th className="num">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {s.lowStockProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/products/${p.id}`}>{p.name}</Link>
                    </td>
                    <td className="num">{p.stockQuantity === 0 ? <Tag tone="danger">0</Tag> : p.stockQuantity}</td>
                    <td className="num">{p.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="adm-card" style={{ marginTop: 16 }}>
        <h2>
          Últimos pedidos
          <Link to="/admin/orders" className="link-btn">
            Ver todos
          </Link>
        </h2>
        {s && s.recentOrders.length === 0 && <p className="notice">Nenhum pedido registrado ainda.</p>}
        {s && s.recentOrders.length > 0 && (
          <div className="table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`}>
                        <b>{o.code}</b>
                      </Link>
                    </td>
                    <td>{o.customerName}</td>
                    <td>{formatDateTime(o.createdAt)}</td>
                    <td>
                      <Tag tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Tag>
                    </td>
                    <td>
                      <Tag tone={PAYMENT_STATUS[o.paymentStatus].tone}>{PAYMENT_STATUS[o.paymentStatus].label}</Tag>
                    </td>
                    <td className="num">{brl(o.totalCents)}</td>
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
