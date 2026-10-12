import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { PageHeader, TableState, Tag } from '../../components/admin/ui';
import { Pagination } from '../../components/ui/States';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { Tone } from '../../lib/labels';
import type { AuditEntry } from '../../types/admin';
import type { Page } from '../../types/api';

const ENTITY_TYPES: Record<string, string> = {
  product: 'Produto',
  category: 'Categoria',
  order: 'Pedido',
  banner: 'Banner',
  promotion: 'Promoção',
  store_settings: 'Configurações da loja',
  profile: 'Usuário',
  media: 'Mídia',
};

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  'product.create': { label: 'Produto criado', tone: 'ok' },
  'product.update': { label: 'Produto editado', tone: 'info' },
  'product.price_change': { label: 'Preço alterado', tone: 'gold' },
  'product.delete': { label: 'Produto excluído', tone: 'danger' },
  'product.images_add': { label: 'Imagens adicionadas', tone: 'info' },
  'product.image_update': { label: 'Imagem editada', tone: 'info' },
  'product.images_reorder': { label: 'Imagens reordenadas', tone: 'neutral' },
  'product.image_delete': { label: 'Imagem removida', tone: 'warn' },
  'inventory.in': { label: 'Entrada de estoque', tone: 'ok' },
  'inventory.out': { label: 'Saída de estoque', tone: 'warn' },
  'inventory.adjustment': { label: 'Ajuste de estoque', tone: 'warn' },
  'inventory.min_stock': { label: 'Estoque mínimo alterado', tone: 'neutral' },
  'order.status_change': { label: 'Status do pedido alterado', tone: 'info' },
  'order.payment_change': { label: 'Pagamento do pedido alterado', tone: 'gold' },
  'order.message_opened': { label: 'WhatsApp aberto com aviso ao cliente', tone: 'neutral' },
  'order.message_confirmed': { label: 'Envio de aviso ao cliente informado', tone: 'ok' },
  'settings.update': { label: 'Configurações alteradas', tone: 'info' },
  'user.invite': { label: 'Administrador convidado', tone: 'ok' },
  'user.update': { label: 'Usuário alterado', tone: 'warn' },
  'banner.create': { label: 'Banner criado', tone: 'ok' },
  'banner.update': { label: 'Banner editado', tone: 'info' },
  'banner.delete': { label: 'Banner excluído', tone: 'danger' },
  'promotion.create': { label: 'Promoção criada', tone: 'ok' },
  'promotion.update': { label: 'Promoção editada', tone: 'info' },
  'promotion.delete': { label: 'Promoção excluída', tone: 'danger' },
  'category.create': { label: 'Categoria criada', tone: 'ok' },
  'category.update': { label: 'Categoria editada', tone: 'info' },
  'category.delete': { label: 'Categoria excluída', tone: 'danger' },
  'media.upload': { label: 'Imagem enviada', tone: 'neutral' },
};

const ACTION_PREFIXES = ['product.', 'inventory.', 'order.', 'settings.', 'user.', 'banner.', 'promotion.', 'category.', 'media.'];

/** Página do painel para a entidade, quando existe. */
function entityLink(type: string, id: string | null) {
  if (!id) return null;
  if (type === 'product') return `/admin/products/${id}`;
  if (type === 'order') return `/admin/orders/${id}`;
  if (type === 'banner') return `/admin/banners/${id}`;
  if (type === 'promotion') return `/admin/promotions/${id}`;
  return null;
}

const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

/** Código do pedido gravado nos metadados (ex.: PS-ABC123), se houver. */
function metaCode(metadata: unknown) {
  if (metadata && typeof metadata === 'object' && 'code' in metadata) {
    const code = (metadata as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

const hasMetadata = (m: unknown) => m !== null && m !== undefined && !(typeof m === 'object' && Object.keys(m).length === 0);

export default function AuditPage() {
  useDocumentTitle('Histórico de alterações');
  const [params, setParams] = useSearchParams();
  const actionInput = params.get('action') ?? '';
  const entityIdInput = params.get('entityId') ?? '';
  const action = useDebouncedValue(actionInput.trim(), 300);
  const entityId = useDebouncedValue(entityIdInput.trim(), 300);
  const filters = {
    entityType: params.get('entityType') ?? '',
    action,
    entityId,
    page: Number(params.get('page')) || 1,
    pageSize: 30,
  };
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const hasFilters = !!(filters.entityType || actionInput || entityIdInput);

  const logs = useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () => adminApi.get<Page<AuditEntry>>('/audit-logs', filters),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Histórico de alterações" description={logs.data ? `${logs.data.total} registro(s) · mais recentes primeiro` : 'Histórico das ações feitas no painel.'} />
      <p className="notice" style={{ marginBottom: 12 }}>
        Registro somente leitura das alterações feitas no painel: não pode ser editado nem apagado por aqui. Os registros nunca contêm senhas, tokens de acesso ou dados de contato de clientes.
      </p>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="audit-entity-type">Tipo de registro</label>
          <select id="audit-entity-type" className="select" value={filters.entityType} onChange={(e) => set({ entityType: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(ENTITY_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="audit-action">Ação (começa com)</label>
          <input id="audit-action" className="input" list="audit-action-prefixes" placeholder="Ex.: product. ou order.status_change" maxLength={60} value={actionInput} onChange={(e) => set({ action: e.target.value })} />
          <datalist id="audit-action-prefixes">
            {ACTION_PREFIXES.map((p) => (
              <option key={p} value={p} />
            ))}
            {Object.keys(ACTIONS).map((a) => (
              <option key={a} value={a}>
                {ACTIONS[a]!.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="field grow">
          <label htmlFor="audit-entity-id">ID do registro</label>
          <input id="audit-entity-id" className="input" placeholder="Identificador exato" maxLength={80} value={entityIdInput} onChange={(e) => set({ entityId: e.target.value })} />
        </div>
        {hasFilters && (
          <div className="field">
            <span className="label" aria-hidden>
              &nbsp;
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Registro</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.isPending || logs.isError || logs.data.items.length === 0 ? (
              <TableState colSpan={5} loading={logs.isPending} error={logs.error} empty={hasFilters ? 'Nenhum registro para estes filtros.' : 'Nenhuma ação registrada ainda.'} onRetry={() => logs.refetch()} />
            ) : (
              logs.data.items.map((log) => {
                const known = ACTIONS[log.action];
                const link = entityLink(log.entityType, log.entityId);
                const code = log.entityType === 'order' ? metaCode(log.metadata) : null;
                const idText = code ?? (log.entityId ? shortId(log.entityId) : null);
                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.createdAt)}</td>
                    <td>
                      {log.user ? (
                        <>
                          <b>{log.user.name}</b>
                          <div className="muted">{log.user.email}</div>
                        </>
                      ) : (
                        <span className="muted">Sistema</span>
                      )}
                    </td>
                    <td>
                      {known ? <Tag tone={known.tone}>{known.label}</Tag> : <Tag>{log.action}</Tag>}
                      {known && (
                        <div className="muted">
                          <code style={{ fontSize: 11 }}>{log.action}</code>
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{ENTITY_TYPES[log.entityType] ?? log.entityType}</div>
                      {log.entityId && (
                        <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                          {link ? (
                            <Link to={link} title={log.entityId}>
                              {idText}
                            </Link>
                          ) : (
                            <span title={log.entityId}>{idText}</span>
                          )}
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => set({ entityType: log.entityType, entityId: log.entityId ?? '' })}
                            aria-label={`Ver todo o histórico deste registro (${ENTITY_TYPES[log.entityType] ?? log.entityType} ${log.entityId})`}
                          >
                            histórico
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {hasMetadata(log.metadata) ? (
                        <details>
                          <summary style={{ cursor: 'pointer' }}>Ver dados</summary>
                          <pre className="json">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {logs.data && <Pagination page={logs.data.page} totalPages={logs.data.totalPages} onChange={(p) => set({ page: String(p) })} />}
    </>
  );
}
