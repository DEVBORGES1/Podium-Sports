import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { CONTENT_STATE } from '../../lib/labels';
import type { AdminBanner } from '../../types/admin';
import { BannerSlidePreview } from '../../components/admin/BannerSlidePreview';
import { adminSlideData } from '../../lib/banner';

const INVALIDATE = [['admin', 'banners'], ['banners']];

/** Troca a ordem de dois banners vizinhos; se as ordens forem iguais, renumera a lista. */
function reorderPatches(list: AdminBanner[], index: number, dir: -1 | 1) {
  const target = index + dir;
  const a = list[index];
  const b = list[target];
  if (!a || !b) return [];
  if (a.sortOrder !== b.sortOrder) {
    return [
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ];
  }
  const next = [...list];
  next[index] = b;
  next[target] = a;
  return next.flatMap((item, i) => ((i + 1) * 10 !== item.sortOrder ? [{ id: item.id, sortOrder: (i + 1) * 10 }] : []));
}

/** Botões cujo destino precisa de atenção (produto/categoria removido ou desativado, endereço antigo digitado). */
function buttonWarnings(b: AdminBanner) {
  const out: { tone: 'danger' | 'warn'; text: string }[] = [];
  const check = (name: string, label: string | null, info: AdminBanner['buttonInfo']) => {
    if (!label || !info?.issue) return;
    if (info.issue === 'LEGACY_LINK') out.push({ tone: 'warn', text: `${name}: endereço digitado à mão — escolha o destino no editor.` });
    else out.push({ tone: 'danger', text: `${name}: ${info.description.toLowerCase()} — atualize o destino (o botão está oculto na loja).` });
  };
  check('Botão principal', b.buttonLabel, b.buttonInfo);
  if (b.secondaryButtonEnabled) check('Botão secundário', b.secondaryButtonLabel, b.secondaryButtonInfo);
  return out;
}

function period(b: AdminBanner) {
  if (!b.startsAt && !b.endsAt) return 'Sem período definido';
  if (b.startsAt && b.endsAt) return `${formatDateTime(b.startsAt)} até ${formatDateTime(b.endsAt)}`;
  if (b.startsAt) return `A partir de ${formatDateTime(b.startsAt)}`;
  return `Até ${formatDateTime(b.endsAt as string)}`;
}

export default function BannersPage() {
  useDocumentTitle('Banners');
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const banners = useQuery({ queryKey: ['admin', 'banners'], queryFn: () => adminApi.get<{ items: AdminBanner[] }>('/banners').then((r) => r.items) });

  const reorder = useAdminMutation((patches: { id: string; sortOrder: number }[]) => Promise.all(patches.map((p) => adminApi.patch(`/banners/${p.id}`, { sortOrder: p.sortOrder }))), {
    invalidate: INVALIDATE,
  });
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.patch<AdminBanner>(`/banners/${v.id}`, { isActive: v.isActive }), {
    success: (b) => (b.isActive ? 'Banner ativado.' : 'Banner desativado.'),
    invalidate: INVALIDATE,
  });
  const remove = useAdminMutation((id: string) => adminApi.delete(`/banners/${id}`), {
    success: 'Banner excluído.',
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });

  const list = banners.data ?? [];
  const live = list.filter((b) => b.state === 'LIVE').length;
  const move = (index: number, dir: -1 | 1) => {
    const patches = reorderPatches(list, index, dir);
    if (patches.length) reorder.mutate(patches);
  };

  return (
    <>
      <PageHeader
        title="Banners"
        description={banners.data ? `${list.length} banner(s) · ${live} no ar agora` : 'Slides do topo da página inicial.'}
        actions={
          <Link to="/admin/banners/new" className="btn btn-gold btn-sm">
            + Novo banner
          </Link>
        }
      />
      <p className="notice" style={{ marginBottom: 14 }}>
        Os banners ativos e dentro do período aparecem em sequência no topo da página inicial (menor ordem primeiro). O tempo de troca entre os slides é configurado em{' '}
        <Link to="/admin/settings" className="link-btn">
          Configurações
        </Link>
        .
      </p>

      {banners.isPending ? (
        <LoadingState />
      ) : banners.isError ? (
        <ErrorState error={banners.error} onRetry={() => banners.refetch()} />
      ) : list.length === 0 ? (
        <div className="adm-card">
          <EmptyState title="Nenhum banner cadastrado">
            <p className="notice" style={{ maxWidth: 520, margin: '0 auto 12px' }}>
              Enquanto não houver banners ativos, a página inicial exibe um slide padrão com o nome da loja e o botão “Ver produtos”.
            </p>
            <Link to="/admin/banners/new" className="btn btn-gold btn-sm">
              Criar o primeiro banner
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          {live === 0 && (
            <div className="alert alert-warn" role="status" style={{ marginBottom: 14 }}>
              Nenhum banner está no ar agora — a página inicial exibe o slide padrão da loja.
            </div>
          )}
          <div className="adm-grid cols-2">
            {list.map((b, i) => {
              const state = CONTENT_STATE[b.state] ?? { label: b.state, tone: 'neutral' as const };
              return (
                <article key={b.id} className="adm-card" style={{ marginTop: 0, display: 'grid', gap: 12, alignContent: 'start' }} aria-label={`Banner ${b.title}`}>
                  <BannerSlidePreview data={adminSlideData(b)} />
                  {buttonWarnings(b).map((w) => (
                    <p key={w.text} className={`alert ${w.tone === 'danger' ? 'alert-error' : 'alert-warn'}`} role="status" style={{ margin: 0 }}>
                      {w.text}
                    </p>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <b>
                        {b.title}
                        {b.highlight ? ` ${b.highlight}` : ''}
                      </b>
                      <div className="notice">{period(b)}</div>
                    </div>
                    <Tag tone={state.tone}>{state.label}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Switch label="Ativo" checked={b.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: b.id, isActive: v })} />
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span className="notice">Ordem {b.sortOrder}</span>
                      <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} aria-label={`Mover banner ${b.title} para cima`}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        onClick={() => move(i, 1)}
                        disabled={i === list.length - 1 || reorder.isPending}
                        aria-label={`Mover banner ${b.title} para baixo`}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link to={`/admin/banners/${b.id}`} className="btn btn-outline btn-sm">
                      Editar
                    </Link>
                    <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDeleting(b)}>
                      Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir banner?"
          message={
            <>
              O banner <b>{deleting.title}</b> e sua imagem serão removidos. Esta ação não pode ser desfeita. Para tirá-lo do ar temporariamente, apenas desative-o.
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
