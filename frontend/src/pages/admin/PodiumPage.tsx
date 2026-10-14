import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ProductPickerModal, ProductThumb } from '../../components/admin/ButtonTargetField';
import { ConfirmDialog, FormField, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { brl, lastDaysRange } from '../../lib/format';
import type { AdminProduct, AdminSettings, TopProducts } from '../../types/admin';

/** Mesmo limite do backend (PODIUM_SIZE). */
const SIZE = 5;
const PLACES = ['Ouro', 'Prata', 'Bronze', '4º lugar', '5º lugar'];
const SETTINGS_KEY = ['admin', 'settings'];
const PODIUM_KEY = ['admin', 'products', 'podium'];
/** Destaques mudam a vitrine da loja e a lista de produtos do painel. */
const INVALIDATE = [PODIUM_KEY, ['admin', 'products'], ['products']];

type PodiumItem = AdminProduct & { categoryActive: boolean };

/** Motivos para o produto não aparecer (ou aparecer fora da posição) na loja. */
function warnings(p: PodiumItem) {
  const out: { tone: 'danger' | 'warn'; text: string }[] = [];
  if (!p.isActive) out.push({ tone: 'danger', text: 'Produto inativo: não aparece na loja.' });
  else if (!p.categoryActive) out.push({ tone: 'danger', text: `Categoria “${p.category.name}” inativa: não aparece na loja.` });
  else if (p.availability === 'OUT_OF_STOCK') out.push({ tone: 'warn', text: 'Esgotado: na loja ele desce para depois dos disponíveis.' });
  return out;
}

export default function PodiumPage() {
  useDocumentTitle('Pódio');
  const [picking, setPicking] = useState(false);
  const [replacing, setReplacing] = useState<string[] | null>(null);
  const podium = useQuery({ queryKey: PODIUM_KEY, queryFn: () => adminApi.get<{ items: PodiumItem[] }>('/products/podium').then((r) => r.items) });
  const save = useAdminMutation((productIds: string[]) => adminApi.put<{ items: PodiumItem[] }>('/products/podium', { productIds }), {
    success: 'Pódio atualizado. A loja já exibe a nova ordem.',
    invalidate: INVALIDATE,
    onSuccess: () => setReplacing(null),
  });

  const list = podium.data ?? [];
  const ids = list.map((p) => p.id);
  const full = ids.length >= SIZE;
  const move = (index: number, dir: -1 | 1) => {
    const next = [...ids];
    [next[index], next[index + dir]] = [next[index + dir]!, next[index]!];
    save.mutate(next);
  };
  const add = (id: string) => {
    if (!ids.includes(id) && !full) save.mutate([...ids, id]);
  };

  return (
    <>
      <PageHeader
        title="Pódio"
        description="Até 5 produtos em destaque na página inicial. O 1º lugar fica no centro, o 2º à esquerda e o 3º à direita."
        actions={
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
            Ver na loja ↗
          </a>
        }
      />

      {podium.isPending ? (
        <LoadingState />
      ) : podium.isError ? (
        <ErrorState error={podium.error} onRetry={() => podium.refetch()} />
      ) : (
        <div className="podium-admin">
          <section className="adm-card" aria-labelledby="podium-places">
            <h2 id="podium-places">
              Lugares <small>{list.length === 0 ? 'Vazio: a seção não aparece na loja.' : `${list.length} de ${SIZE} ocupados`}</small>
            </h2>
            <ol className="podium-slots" aria-busy={save.isPending}>
              {Array.from({ length: SIZE }, (_, i) => {
                const p = list[i];
                if (!p) {
                  const next = i === list.length;
                  return (
                    <li key={`empty-${i}`} className="podium-slot empty">
                      <span className="podium-rank" aria-hidden>
                        {i + 1}
                      </span>
                      {next ? (
                        <button type="button" className="pick-empty" onClick={() => setPicking(true)} disabled={save.isPending}>
                          <span>
                            <b>+ Escolher produto</b>
                            <small>{PLACES[i]}</small>
                          </span>
                        </button>
                      ) : (
                        <span className="notice">{PLACES[i]} · vago</span>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={p.id} className={`podium-slot ${i < 3 ? 'medal' : ''}`}>
                    <span className="podium-rank" aria-hidden>
                      {i + 1}
                    </span>
                    <ProductThumb product={p} />
                    <div className="podium-info">
                      <span className="mono-label">{PLACES[i]}</span>
                      <b>{p.name}</b>
                      <span className="pick-price">
                        {p.onSale && <s>{brl(p.priceCents)}</s>} <b>{brl(p.effectivePriceCents)}</b> · {p.stockQuantity} em estoque
                      </span>
                      {warnings(p).map((w) => (
                        <Tag key={w.text} tone={w.tone}>
                          {w.text}
                        </Tag>
                      ))}
                    </div>
                    <div className="podium-actions">
                      <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0 || save.isPending} aria-label={`Subir ${p.name} para o ${i}º lugar`}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        onClick={() => move(i, 1)}
                        disabled={i === list.length - 1 || save.isPending}
                        aria-label={`Descer ${p.name} para o ${i + 2}º lugar`}
                      >
                        ↓
                      </button>
                      <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => save.mutate(ids.filter((id) => id !== p.id))} disabled={save.isPending}>
                        Tirar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="notice" style={{ marginTop: 12 }}>
              A posição usa a “Ordem de exibição” do produto (0 a 4), então os produtos do pódio também aparecem primeiro no catálogo.
            </p>
          </section>

          <TopSellers podiumIds={ids} full={full} busy={save.isPending} onAdd={add} onReplace={setReplacing} />
          <PodiumTexts />
        </div>
      )}

      {picking && (
        <ProductPickerModal
          title="Escolher produto para o pódio"
          actionLabel="Colocar no pódio"
          selectedLabel="Já está no pódio"
          selectedIds={ids}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            add(p.id);
            setPicking(false);
          }}
        />
      )}
      {replacing && (
        <ConfirmDialog
          title="Montar o pódio com os mais pedidos?"
          message="Os produtos atuais saem do pódio e os mais pedidos da semana entram, na ordem de quantidade vendida."
          confirmLabel="Montar pódio"
          busy={save.isPending}
          onConfirm={() => save.mutate(replacing)}
          onCancel={() => setReplacing(null)}
        />
      )}
    </>
  );
}

/** Sugestão a partir das vendas: itens de pedidos aceitos nos últimos 7 dias. */
function TopSellers({ podiumIds, full, busy, onAdd, onReplace }: { podiumIds: string[]; full: boolean; busy: boolean; onAdd: (id: string) => void; onReplace: (ids: string[]) => void }) {
  const [range] = useState(() => lastDaysRange(7));
  const top = useQuery({ queryKey: ['admin', 'dashboard', 'top', range], queryFn: () => adminApi.get<TopProducts>('/dashboard/top-products', range) });
  // Itens de produtos excluídos (sem id) não podem ir para o pódio.
  const items = (top.data?.items ?? []).filter((t): t is typeof t & { productId: string } => !!t.productId).slice(0, SIZE);
  const same = items.length > 0 && items.map((t) => t.productId).join() === podiumIds.join();

  return (
    <section className="adm-card" aria-labelledby="podium-top">
      <h2 id="podium-top">
        Mais pedidos da semana <small>Pedidos aceitos nos últimos 7 dias</small>
      </h2>
      {top.isPending ? (
        <p className="notice" role="status">
          Carregando…
        </p>
      ) : top.isError ? (
        <ErrorState error={top.error} onRetry={() => top.refetch()} />
      ) : items.length === 0 ? (
        <p className="notice">Ainda não há pedidos aceitos nos últimos 7 dias.</p>
      ) : (
        <>
          <ol className="podium-top">
            {items.map((t, i) => {
              const inPodium = podiumIds.includes(t.productId);
              return (
                <li key={t.productId}>
                  <span className="podium-rank small" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="podium-info">
                    <b>{t.name}</b>
                    <small className="mono">
                      {t.quantity} un. · {t.orders} pedido(s)
                    </small>
                  </span>
                  {inPodium ? (
                    <Tag tone="gold">No pódio</Tag>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => onAdd(t.productId)} disabled={full || busy} title={full ? 'O pódio está cheio: tire um produto antes.' : undefined}>
                      Colocar no pódio
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-gold btn-sm" onClick={() => onReplace(items.map((t) => t.productId))} disabled={same || busy}>
              {same ? 'O pódio já segue os mais pedidos' : 'Montar o pódio com estes'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const textsSchema = z.object({
  enabled: z.boolean(),
  eyebrow: z.string().trim().max(40, 'Máximo de 40 caracteres.'),
  title: z.string().trim().min(1, 'Informe o título.').max(60, 'Máximo de 60 caracteres.'),
  text: z.string().trim().max(200, 'Máximo de 200 caracteres.'),
});
type TextsValues = z.infer<typeof textsSchema>;

const toTextsValues = (s: AdminSettings): TextsValues => ({ enabled: s.content.podium.enabled, eyebrow: s.content.home.featuredTitle, title: s.content.podium.title, text: s.content.podium.text });

/** Textos da seção na página inicial (ficam nas configurações da loja). */
function PodiumTexts() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => adminApi.get<AdminSettings>('/store/settings') });
  const { register, control, handleSubmit, formState, reset } = useForm<TextsValues>({ resolver: zodResolver(textsSchema), defaultValues: { enabled: true, eyebrow: '', title: '', text: '' } });
  const errors = formState.errors;
  useEffect(() => {
    if (settings.data) reset(toTextsValues(settings.data), { keepDirtyValues: true });
  }, [settings.data, reset]);
  const save = useAdminMutation(
    (v: TextsValues) => {
      const c = settings.data!.content;
      return adminApi.patch<AdminSettings>('/store/settings', {
        content: { ...c, home: { ...c.home, featuredTitle: v.eyebrow }, podium: { enabled: v.enabled, title: v.title, text: v.text } },
      });
    },
    {
      success: 'Textos do pódio salvos.',
      invalidate: [SETTINGS_KEY, ['settings']],
      onSuccess: (saved) => {
        qc.setQueryData(SETTINGS_KEY, saved);
        reset(toTextsValues(saved));
      },
    },
  );

  if (settings.isPending) return <LoadingState />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  return (
    <form className="adm-card" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate aria-labelledby="podium-texts">
      <h2 id="podium-texts">
        Textos da seção <small>Como o pódio se apresenta na página inicial</small>
      </h2>
      <div style={{ display: 'grid', gap: 14 }}>
        <Controller control={control} name="enabled" render={({ field }) => <Switch label="Exibir o pódio na página inicial" checked={field.value} onChange={field.onChange} />} />
        <div className="form-cols two">
          <FormField id="podium-eyebrow" label="Rótulo (acima do título)" error={errors.eyebrow?.message} hint="Texto pequeno em caixa alta, ex.: Destaques.">
            <input id="podium-eyebrow" className="input" aria-invalid={!!errors.eyebrow} {...register('eyebrow')} />
          </FormField>
          <FormField id="podium-title" label="Título" error={errors.title?.message}>
            <input id="podium-title" className="input" aria-invalid={!!errors.title} {...register('title')} />
          </FormField>
        </div>
        <FormField id="podium-text" label="Texto ao lado do título" error={errors.text?.message} hint="Deixe em branco para não exibir.">
          <textarea id="podium-text" className="textarea" rows={2} aria-invalid={!!errors.text} {...register('text')} />
        </FormField>
      </div>
      <div className="row-actions" style={{ marginTop: 20, alignItems: 'center' }}>
        {formState.isDirty && (
          <span className="notice" role="status" style={{ marginRight: 'auto' }}>
            Há alterações não salvas.
          </span>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => reset()} disabled={!formState.isDirty || save.isPending}>
          Descartar
        </button>
        <button type="submit" className="btn btn-gold btn-sm" disabled={save.isPending} aria-busy={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar textos'}
        </button>
      </div>
    </form>
  );
}
