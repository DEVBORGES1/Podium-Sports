import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog, PageHeader, Switch, TableState, Tag } from '../../components/admin/ui';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { brl, formatDateTime } from '../../lib/format';
import { CONTENT_STATE } from '../../lib/labels';
import type { AdminPromotion } from '../../types/admin';

type Filter = 'all' | AdminPromotion['state'];
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'ACTIVE', label: 'Vigentes' },
  { value: 'SCHEDULED', label: 'Agendadas' },
  { value: 'EXPIRED', label: 'Encerradas' },
  { value: 'INACTIVE', label: 'Inativas' },
];

const INVALIDATE = [['admin', 'promotions'], ['admin', 'promotion'], ['admin', 'products'], ['products'], ['product']];

function discountLabel(p: Pick<AdminPromotion, 'discountType' | 'value'>) {
  switch (p.discountType) {
    case 'PERCENTAGE':
      return `${p.value}% off`;
    case 'FIXED_AMOUNT':
      return `${brl(p.value)} de desconto`;
    case 'FIXED_PRICE':
      return `Preço fixo ${brl(p.value)}`;
  }
}

export default function PromotionsPage() {
  useDocumentTitle('Promoções');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [deleting, setDeleting] = useState<AdminPromotion | null>(null);

  const promotions = useQuery({
    queryKey: ['admin', 'promotions'],
    queryFn: () => adminApi.get<{ items: AdminPromotion[] }>('/promotions').then((r) => r.items),
  });
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.patch<AdminPromotion>(`/promotions/${v.id}`, { isActive: v.isActive }), {
    success: (p) => (p.isActive ? 'Promoção ativada.' : 'Promoção desativada.'),
    invalidate: INVALIDATE,
  });
  const remove = useAdminMutation((id: string) => adminApi.delete(`/promotions/${id}`), {
    success: 'Promoção excluída.',
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });

  const all = promotions.data ?? [];
  const rows = filter === 'all' ? all : all.filter((p) => p.state === filter);
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((p) => p.state === f).length);

  return (
    <>
      <PageHeader
        title="Promoções"
        description="Descontos com prazo aplicados a produtos selecionados."
        actions={
          <Link to="/admin/promotions/new" className="btn btn-gold btn-sm">
            + Nova promoção
          </Link>
        }
      />
      <p className="notice" style={{ marginBottom: 12 }}>
        O servidor confere se a promoção está vigente e recalcula os preços em todo pedido; promoções vencidas deixam de valer automaticamente. Quando um
        produto tem mais de um desconto, vale o menor preço.
      </p>
      <div className="period-bar" role="group" aria-label="Filtrar por situação" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip ${filter === f.value ? 'active' : ''}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {promotions.data ? ` (${count(f.value)})` : ''}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Promoção</th>
              <th>Desconto</th>
              <th>Período</th>
              <th className="num">Produtos</th>
              <th>Situação</th>
              <th>Ativação</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {promotions.isPending || promotions.isError || rows.length === 0 ? (
              <TableState
                colSpan={7}
                loading={promotions.isPending}
                error={promotions.error}
                empty={all.length === 0 ? 'Nenhuma promoção cadastrada.' : 'Nenhuma promoção nesta situação.'}
                onRetry={() => promotions.refetch()}
              />
            ) : (
              rows.map((p) => {
                const state = CONTENT_STATE[p.state] ?? { label: p.state, tone: 'neutral' as const };
                return (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/admin/promotions/${p.id}`)}>
                    <td>
                      <Link to={`/admin/promotions/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        <b>{p.name}</b>
                      </Link>
                      {p.description && <div className="muted">{p.description}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{discountLabel(p)}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(p.startsAt)}
                      <br />
                      até {formatDateTime(p.endsAt)}
                    </td>
                    <td className="num">{p.products.length}</td>
                    <td>
                      <Tag tone={state.tone}>{state.label}</Tag>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Switch label="Ativa" checked={p.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: p.id, isActive: v })} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <Link to={`/admin/promotions/${p.id}`} className="btn btn-outline btn-sm">
                          Editar
                        </Link>
                        <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDeleting(p)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Excluir promoção?"
          message={
            <>
              A promoção <b>{deleting.name}</b> será removida e os produtos voltam ao preço normal. Pedidos já realizados não são alterados. Esta ação não pode
              ser desfeita.
            </>
          }
          confirmLabel="Excluir"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
