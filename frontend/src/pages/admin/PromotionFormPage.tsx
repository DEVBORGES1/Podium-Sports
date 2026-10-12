import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { FormField, MoneyInput, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError } from '../../lib/api';
import { brl } from '../../lib/format';
import { CONTENT_STATE } from '../../lib/labels';
import type { AdminProduct, AdminPromotion, DiscountType } from '../../types/admin';
import type { Page } from '../../types/api';

const DISCOUNT_TYPES: { value: DiscountType; label: string; hint: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentual (% de desconto)', hint: 'Número inteiro entre 1% e 90%.' },
  { value: 'FIXED_AMOUNT', label: 'Valor fixo de desconto (R$)', hint: 'Valor abatido do preço de cada produto.' },
  { value: 'FIXED_PRICE', label: 'Preço promocional fixo (R$)', hint: 'Todos os produtos selecionados passam a custar este valor.' },
];

const productSchema = z.object({ id: z.string(), name: z.string(), priceCents: z.number() });
type SelectedProduct = z.infer<typeof productSchema>;

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(120, 'Máximo de 120 caracteres.'),
    description: z.string().trim().max(500, 'Máximo de 500 caracteres.'),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE']),
    value: z.number().int('Use um número inteiro.').nullable(),
    startsAt: z.string().min(1, 'Informe o início.'),
    endsAt: z.string().min(1, 'Informe o fim.'),
    isActive: z.boolean(),
    products: z.array(productSchema).min(1, 'Selecione ao menos um produto.').max(500, 'Máximo de 500 produtos.'),
  })
  .superRefine((v, ctx) => {
    if (v.value === null || v.value < 1) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: v.discountType === 'PERCENTAGE' ? 'Informe o percentual.' : 'Informe um valor maior que zero.' });
    } else if (v.discountType === 'PERCENTAGE' && v.value > 90) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'O percentual deve ficar entre 1% e 90%.' });
    } else if (v.value > 10_000_000) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Valor muito alto.' });
    }
    const start = new Date(v.startsAt);
    const end = new Date(v.endsAt);
    if (v.startsAt && Number.isNaN(start.getTime())) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Data inválida.' });
    if (v.endsAt && Number.isNaN(end.getTime())) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Data inválida.' });
    if (v.startsAt && v.endsAt && end <= start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A data final deve ser posterior à inicial.' });
  });
type FormValues = z.infer<typeof schema>;

/** Mesmo cálculo do servidor (apenas para exibição): null quando o desconto é inválido para o preço. */
function promotionPrice(priceCents: number, type: DiscountType, value: number | null): number | null {
  if (value === null || value < 1) return null;
  let result: number;
  switch (type) {
    case 'PERCENTAGE':
      if (value > 90) return null;
      result = Math.round((priceCents * (100 - value)) / 100);
      break;
    case 'FIXED_AMOUNT':
      result = priceCents - value;
      break;
    case 'FIXED_PRICE':
      result = value;
      break;
  }
  if (!Number.isInteger(result) || result <= 0 || result >= priceCents) return null;
  return result;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function defaultPeriod() {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 0, 0);
  return { startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(end.toISOString()) };
}

interface Incompatible {
  productId: string;
  name: string;
  priceCents: number;
}
function incompatibleDetails(err: unknown): Incompatible[] {
  if (!(err instanceof ApiError) || err.code !== 'PROMOTION_INCOMPATIBLE' || !Array.isArray(err.details)) return [];
  return (err.details as unknown[]).filter(
    (d): d is Incompatible => typeof d === 'object' && d !== null && typeof (d as Incompatible).productId === 'string' && typeof (d as Incompatible).priceCents === 'number',
  );
}

export default function PromotionFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  useDocumentTitle(isNew ? 'Nova promoção' : 'Editar promoção');
  const [incompatible, setIncompatible] = useState<Incompatible[]>([]);

  const promotion = useQuery({ queryKey: ['admin', 'promotion', id], queryFn: () => adminApi.get<AdminPromotion>(`/promotions/${id}`), enabled: !isNew });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', discountType: 'PERCENTAGE', value: null, ...defaultPeriod(), isActive: true, products: [] },
  });
  const { register, control, handleSubmit, formState, reset, setError, setValue } = form;
  const errors = formState.errors;
  const [discountType, value, selected] = useWatch({ control, name: ['discountType', 'value', 'products'] });

  useEffect(() => {
    if (!promotion.data) return;
    const p = promotion.data;
    reset({
      name: p.name,
      description: p.description ?? '',
      discountType: p.discountType,
      value: p.value,
      startsAt: toLocalInput(p.startsAt),
      endsAt: toLocalInput(p.endsAt),
      isActive: p.isActive,
      products: p.products.map((pp) => ({ id: pp.id, name: pp.name, priceCents: pp.priceCents })),
    });
  }, [promotion.data, reset]);

  const save = useAdminMutation(
    (v: FormValues) => {
      const body = {
        name: v.name,
        description: v.description || null,
        discountType: v.discountType,
        value: v.value,
        startsAt: new Date(v.startsAt).toISOString(),
        endsAt: new Date(v.endsAt).toISOString(),
        isActive: v.isActive,
        productIds: v.products.map((p) => p.id),
      };
      return isNew ? adminApi.post<AdminPromotion>('/promotions', body) : adminApi.patch<AdminPromotion>(`/promotions/${id}`, body);
    },
    {
      success: isNew ? 'Promoção criada.' : 'Promoção salva.',
      invalidate: [['admin', 'promotions'], ['admin', 'promotion', id], ['admin', 'products'], ['products'], ['product']],
      onSuccess: () => navigate('/admin/promotions'),
    },
  );

  const fieldNames: (keyof FormValues)[] = ['name', 'description', 'discountType', 'value', 'startsAt', 'endsAt', 'isActive', 'products'];
  const onSubmit = handleSubmit((v) => {
    setIncompatible([]);
    save.mutate(v, {
      onError: (err) => {
        setIncompatible(incompatibleDetails(err));
        if (!(err instanceof ApiError)) return;
        for (const issue of err.fieldIssues) {
          const field = (issue.field.startsWith('productIds') ? 'products' : issue.field) as keyof FormValues;
          if (fieldNames.includes(field)) setError(field, { message: issue.message });
        }
      },
    });
  });

  const setProducts = (next: SelectedProduct[]) => setValue('products', next, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  const toggleProduct = (p: SelectedProduct) => {
    const exists = selected.some((s) => s.id === p.id);
    setProducts(exists ? selected.filter((s) => s.id !== p.id) : [...selected, { id: p.id, name: p.name, priceCents: p.priceCents }]);
  };

  if (!isNew && promotion.isPending) return <LoadingState />;
  if (!isNew && promotion.isError) return <ErrorState error={promotion.error} onRetry={() => promotion.refetch()} />;
  const p = promotion.data;
  const state = p ? CONTENT_STATE[p.state] : undefined;
  const typeInfo = DISCOUNT_TYPES.find((t) => t.value === discountType);
  const serverRejected = new Set(incompatible.map((i) => i.productId));
  const invalidCount = selected.filter((s) => promotionPrice(s.priceCents, discountType, value) === null).length;

  return (
    <>
      <PageHeader
        title={isNew ? 'Nova promoção' : (p?.name ?? 'Promoção')}
        description={state ? <Tag tone={state.tone}>{state.label}</Tag> : 'Desconto com prazo para produtos selecionados.'}
        actions={
          <Link to="/admin/promotions" className="btn btn-outline btn-sm">
            Voltar
          </Link>
        }
      />
      <form onSubmit={onSubmit} noValidate>
        <div className="adm-grid main-side">
          <div>
            <section className="adm-card">
              <h2>Informações</h2>
              <div className="form-cols two">
                <FormField id="name" label="Nome" error={errors.name?.message} className="full">
                  <input id="name" className="input" aria-invalid={!!errors.name} {...register('name')} />
                </FormField>
                <FormField id="description" label="Descrição (opcional)" error={errors.description?.message} className="full" hint="Uso interno e exibição na loja, se aplicável.">
                  <textarea id="description" className="textarea" rows={3} {...register('description')} />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>
                Desconto <small>O preço final é sempre recalculado pelo servidor.</small>
              </h2>
              <div className="form-cols two">
                <FormField id="discountType" label="Tipo de desconto" error={errors.discountType?.message}>
                  <select id="discountType" className="select" {...register('discountType', { onChange: () => setValue('value', null) })}>
                    {DISCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="value" label={discountType === 'PERCENTAGE' ? 'Percentual' : discountType === 'FIXED_PRICE' ? 'Preço promocional' : 'Valor do desconto'} error={errors.value?.message} hint={typeInfo?.hint}>
                  <Controller
                    control={control}
                    name="value"
                    render={({ field }) =>
                      discountType === 'PERCENTAGE' ? (
                        <div style={{ position: 'relative' }}>
                          <input
                            id="value"
                            className="input"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={90}
                            step={1}
                            aria-invalid={!!errors.value}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? null : Math.floor(Number(e.target.value)))}
                            onBlur={field.onBlur}
                            style={{ paddingRight: 32 }}
                          />
                          <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
                            %
                          </span>
                        </div>
                      ) : (
                        <MoneyInput id="value" value={field.value} onChange={field.onChange} invalid={!!errors.value} />
                      )
                    }
                  />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>
                Produtos <small>{selected.length} selecionado(s)</small>
              </h2>
              {errors.products && (
                <p className="err" role="alert" style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  {errors.products.message ?? errors.products.root?.message}
                </p>
              )}
              {incompatible.length > 0 && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: 12 }}>
                  O desconto é incompatível com o preço destes produtos (resultaria em preço zero, negativo ou maior/igual ao preço atual). Remova-os ou ajuste o desconto:
                  <ul style={{ margin: '8px 0 0 18px' }}>
                    {incompatible.map((i) => (
                      <li key={i.productId}>
                        {i.name} — {brl(i.priceCents)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <SelectedList selected={selected} discountType={discountType} value={value} serverRejected={serverRejected} onRemove={(id) => setProducts(selected.filter((s) => s.id !== id))} />
              {invalidCount > 0 && (
                <p className="notice" style={{ color: 'var(--danger)', marginTop: 8 }}>
                  {invalidCount} produto(s) em vermelho não aceitam este desconto e serão recusados pelo servidor.
                </p>
              )}
              <ProductPicker selectedIds={new Set(selected.map((s) => s.id))} discountType={discountType} value={value} onToggle={toggleProduct} />
            </section>
          </div>

          <div>
            <section className="adm-card">
              <h2>Período e publicação</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <FormField id="startsAt" label="Início" error={errors.startsAt?.message}>
                  <input id="startsAt" className="input" type="datetime-local" aria-invalid={!!errors.startsAt} {...register('startsAt')} />
                </FormField>
                <FormField id="endsAt" label="Fim" error={errors.endsAt?.message}>
                  <input id="endsAt" className="input" type="datetime-local" aria-invalid={!!errors.endsAt} {...register('endsAt')} />
                </FormField>
                <Controller control={control} name="isActive" render={({ field }) => <Switch label="Promoção ativa" checked={field.value} onChange={field.onChange} />} />
                <p className="notice">A promoção só vale entre o início e o fim e enquanto estiver ativa. Depois do fim ela deixa de ser aplicada automaticamente.</p>
              </div>
            </section>
          </div>
        </div>
        <div className="form-bar">
          <span className="notice">{formState.isDirty ? 'Há alterações não salvas.' : isNew ? 'Preencha os campos e salve.' : 'Tudo salvo.'}</span>
          <Link to="/admin/promotions" className="btn btn-quiet">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-gold" disabled={save.isPending} aria-busy={save.isPending}>
            {isNew ? 'Criar promoção' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </>
  );
}

function SelectedList({
  selected,
  discountType,
  value,
  serverRejected,
  onRemove,
}: {
  selected: SelectedProduct[];
  discountType: DiscountType;
  value: number | null;
  serverRejected: Set<string>;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Selecionados</h3>
      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Preço normal</th>
              <th className="num">Na promoção</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {selected.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-row">
                  Nenhum produto selecionado. Busque abaixo e marque os produtos.
                </td>
              </tr>
            ) : (
              selected.map((s) => {
                const promo = promotionPrice(s.priceCents, discountType, value);
                const invalid = value !== null && (promo === null || serverRejected.has(s.id));
                return (
                  <tr key={s.id} style={invalid ? { background: 'var(--danger-bg)' } : undefined}>
                    <td style={invalid ? { color: 'var(--danger)' } : undefined}>
                      <b>{s.name}</b>
                      {invalid && <div style={{ fontSize: 12 }}>Desconto inválido para este preço</div>}
                    </td>
                    <td className="num">{brl(s.priceCents)}</td>
                    <td className="num" style={invalid ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                      {value === null ? '—' : promo === null ? 'Inválido' : brl(promo)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => onRemove(s.id)} aria-label={`Remover ${s.name} da promoção`}>
                          Remover
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
    </div>
  );
}

function ProductPicker({
  selectedIds,
  discountType,
  value,
  onToggle,
}: {
  selectedIds: Set<string>;
  discountType: DiscountType;
  value: number | null;
  onToggle: (p: SelectedProduct) => void;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const products = useQuery({
    queryKey: ['admin', 'products', 'picker', q],
    queryFn: () => adminApi.get<Page<AdminProduct>>('/products', { q, pageSize: 20, status: 'active', sort: 'name' }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="product-search">Adicionar produtos</label>
        <input id="product-search" className="input" type="search" placeholder="Buscar por nome, marca ou categoria" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="hint">Mostra até 20 produtos ativos. Refine a busca para encontrar outros.</span>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 320, overflow: 'auto' }} aria-busy={products.isFetching}>
        {products.isPending ? (
          <p className="empty-row" style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>
            Carregando…
          </p>
        ) : products.isError ? (
          <p role="alert" style={{ padding: 16, textAlign: 'center', color: 'var(--danger)' }}>
            Não foi possível carregar os produtos.{' '}
            <button type="button" className="link-btn" onClick={() => products.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : products.data.items.length === 0 ? (
          <p style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>Nenhum produto encontrado.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {products.data.items.map((p) => {
              const checked = selectedIds.has(p.id);
              const promo = promotionPrice(p.priceCents, discountType, value);
              const invalid = value !== null && promo === null;
              return (
                <li key={p.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 12px' }}>
                  <label className="check" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <input type="checkbox" checked={checked} onChange={() => onToggle({ id: p.id, name: p.name, priceCents: p.priceCents })} />
                      <span style={{ minWidth: 0 }}>
                        <b>{p.name}</b>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                          {[p.brand, p.category.name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap', color: invalid ? 'var(--danger)' : undefined }}>
                      {brl(p.priceCents)}
                      {value !== null && <span style={{ display: 'block', fontSize: 12 }}>{promo === null ? 'desconto inválido' : `→ ${brl(promo)}`}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
