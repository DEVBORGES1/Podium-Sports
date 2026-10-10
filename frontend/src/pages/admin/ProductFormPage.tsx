import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type DragEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { ConfirmDialog, FormField, MoneyInput, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError, request } from '../../lib/api';
import { brl } from '../../lib/format';
import type { AdminCategory, AdminProduct } from '../../types/admin';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(160),
    slug: z
      .string()
      .trim()
      .max(180)
      .refine((v) => v === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), 'Use letras minúsculas, números e hífens.'),
    brand: z.string().trim().max(80),
    description: z.string().trim().max(5000),
    categoryId: z.string().min(1, 'Selecione uma categoria.'),
    priceCents: z.number({ error: 'Informe o preço.' }).int().min(1, 'O preço deve ser maior que zero.'),
    salePriceCents: z.number().int().min(1).nullable(),
    initialStock: z.number().int().min(0),
    minStock: z.number().int().min(0, 'Não pode ser negativo.'),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
  })
  .refine((v) => v.salePriceCents === null || v.salePriceCents < v.priceCents, {
    message: 'O preço promocional deve ser menor que o preço.',
    path: ['salePriceCents'],
  });
type FormValues = z.infer<typeof schema>;

const toNumber = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

export default function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle(isNew ? 'Novo produto' : 'Editar produto');

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items) });
  const product = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => adminApi.get<AdminProduct>(`/products/${id}`), enabled: !isNew });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', brand: '', description: '', categoryId: '', priceCents: 0, salePriceCents: null, initialStock: 0, minStock: 2, sortOrder: 100, isActive: true, isFeatured: false },
  });
  const { register, control, handleSubmit, formState, reset, setError } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (product.data) {
      const p = product.data;
      reset({
        name: p.name,
        slug: p.slug,
        brand: p.brand ?? '',
        description: p.description ?? '',
        categoryId: p.categoryId,
        priceCents: p.priceCents,
        salePriceCents: p.salePriceCents,
        initialStock: 0,
        minStock: p.minStock,
        sortOrder: p.sortOrder,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
      });
    }
  }, [product.data, reset]);

  const save = useAdminMutation(
    (v: FormValues) => {
      const body = {
        name: v.name,
        brand: v.brand || null,
        description: v.description || null,
        categoryId: v.categoryId,
        priceCents: v.priceCents,
        salePriceCents: v.salePriceCents,
        minStock: v.minStock,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        isFeatured: v.isFeatured,
        ...(v.slug ? { slug: v.slug } : {}),
      };
      return isNew
        ? adminApi.post<AdminProduct>('/products', { ...body, initialStock: v.initialStock })
        : adminApi.patch<AdminProduct>(`/products/${id}`, body);
    },
    {
      success: isNew ? 'Produto criado.' : 'Produto salvo.',
      invalidate: [['admin', 'products'], ['admin', 'product', id], ['products']],
      onSuccess: (p) => {
        if (isNew) navigate(`/admin/products/${p.id}`, { replace: true });
      },
    },
  );

  const remove = useAdminMutation(() => adminApi.delete(`/products/${id}`), {
    success: 'Produto excluído.',
    invalidate: [['admin', 'products']],
    onSuccess: () => navigate('/admin/products', { replace: true }),
  });

  const onSubmit = handleSubmit((v) =>
    save.mutate(v, {
      onError: (err) => {
        if (err instanceof ApiError) for (const issue of err.fieldIssues) setError(issue.field as keyof FormValues, { message: issue.message });
      },
    }),
  );

  if (!isNew && product.isPending) return <LoadingState />;
  if (!isNew && product.isError) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;

  return (
    <>
      <PageHeader
        title={isNew ? 'Novo produto' : (p?.name ?? 'Produto')}
        description={
          p ? (
            <>
              Estoque atual: <b>{p.stockQuantity}</b> · Preço na loja: <b>{brl(p.effectivePriceCents)}</b>{' '}
              {p.isActive ? <Tag tone="ok">Publicado</Tag> : <Tag>Inativo</Tag>}
            </>
          ) : undefined
        }
        actions={
          <>
            {p && p.isActive && (
              <a href={`/produto/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                Ver na loja ↗
              </a>
            )}
            <Link to="/admin/products" className="btn btn-outline btn-sm">
              Voltar
            </Link>
          </>
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
                <FormField id="categoryId" label="Categoria" error={errors.categoryId?.message}>
                  <select id="categoryId" className="select" aria-invalid={!!errors.categoryId} {...register('categoryId')}>
                    <option value="">Selecione…</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {!c.isActive ? ' (inativa)' : ''}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="brand" label="Marca" error={errors.brand?.message}>
                  <input id="brand" className="input" {...register('brand')} />
                </FormField>
                <FormField id="description" label="Descrição" error={errors.description?.message} className="full" hint="Tamanhos, sabores, material, indicações…">
                  <textarea id="description" className="textarea" rows={6} {...register('description')} />
                </FormField>
                <FormField id="slug" label="Endereço (slug)" error={errors.slug?.message} className="full" hint={isNew ? 'Deixe em branco para gerar a partir do nome.' : `/produto/${p?.slug ?? ''}`}>
                  <input id="slug" className="input" {...register('slug')} />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>
                Preço <small>O preço cobrado é sempre recalculado pelo servidor.</small>
              </h2>
              <div className="form-cols two">
                <FormField id="priceCents" label="Preço" error={errors.priceCents?.message}>
                  <Controller
                    control={control}
                    name="priceCents"
                    render={({ field }) => <MoneyInput id="priceCents" value={field.value || null} onChange={(c) => field.onChange(c ?? 0)} invalid={!!errors.priceCents} />}
                  />
                </FormField>
                <FormField id="salePriceCents" label="Preço promocional (opcional)" error={errors.salePriceCents?.message} hint="Fica valendo até ser removido. Para ofertas com prazo, use Promoções.">
                  <Controller
                    control={control}
                    name="salePriceCents"
                    render={({ field }) => <MoneyInput id="salePriceCents" value={field.value} onChange={field.onChange} invalid={!!errors.salePriceCents} placeholder="—" />}
                  />
                </FormField>
              </div>
            </section>

            {!isNew && p && <ProductImages product={p} />}
          </div>

          <div>
            <section className="adm-card">
              <h2>Publicação</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <Controller control={control} name="isActive" render={({ field }) => <Switch label="Publicado na loja" checked={field.value} onChange={field.onChange} />} />
                <Controller control={control} name="isFeatured" render={({ field }) => <Switch label="Destaque na página inicial" checked={field.value} onChange={field.onChange} />} />
                <FormField id="sortOrder" label="Ordem de exibição" hint="Menor número aparece primeiro.">
                  <input id="sortOrder" className="input" type="number" min={0} {...register('sortOrder', { setValueAs: toNumber })} />
                </FormField>
              </div>
            </section>
            <section className="adm-card">
              <h2>Estoque</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {isNew ? (
                  <FormField id="initialStock" label="Estoque inicial" hint="Gera uma movimentação de carga inicial.">
                    <input id="initialStock" className="input" type="number" min={0} {...register('initialStock', { setValueAs: toNumber })} />
                  </FormField>
                ) : (
                  <p className="notice">
                    Saldo atual: <b>{p?.stockQuantity}</b>. Entradas, saídas e ajustes são feitos em{' '}
                    <Link to={`/admin/inventory?q=${encodeURIComponent(p?.name ?? '')}`} className="link-btn">
                      Estoque
                    </Link>{' '}
                    para manter o histórico.
                  </p>
                )}
                <FormField id="minStock" label="Estoque mínimo" error={errors.minStock?.message} hint="Abaixo disso o produto aparece como estoque baixo.">
                  <input id="minStock" className="input" type="number" min={0} {...register('minStock', { setValueAs: toNumber })} />
                </FormField>
              </div>
            </section>
            <div className="adm-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-gold" disabled={save.isPending}>
                {save.isPending ? 'Salvando…' : isNew ? 'Criar produto' : 'Salvar alterações'}
              </button>
            </div>
            {!isNew && p && (
              <section className="adm-card danger-zone">
                <h2>Excluir produto</h2>
                {p.canDelete ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(true)}>
                    Excluir definitivamente
                  </button>
                ) : (
                  <p className="notice">Este produto aparece em {p.orderCount} pedido(s) e não pode ser excluído (o histórico é preservado). Desative a publicação para tirá-lo da loja.</p>
                )}
              </section>
            )}
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir produto?"
          message={`"${p?.name}" e suas imagens serão removidos. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

/** Gerenciamento de imagens: envio múltiplo, principal, texto alternativo, ordem e exclusão. */
function ProductImages({ product }: { product: AdminProduct }) {
  const [over, setOver] = useState(false);
  const [alt, setAlt] = useState<Record<string, string>>({});
  const invalidate = [['admin', 'product', product.id], ['admin', 'products'], ['products']];

  const upload = useAdminMutation(
    (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      return request<AdminProduct>(`/admin/products/${product.id}/images`, { method: 'POST', body: fd, auth: true });
    },
    { success: 'Imagens enviadas.', invalidate },
  );
  const update = useAdminMutation((v: { imageId: string; body: object }) => adminApi.patch(`/products/${product.id}/images/${v.imageId}`, v.body), {
    success: 'Imagem atualizada.',
    invalidate,
  });
  const reorder = useAdminMutation((imageIds: string[]) => adminApi.put(`/products/${product.id}/images/order`, { imageIds }), { invalidate });
  const del = useAdminMutation((imageId: string) => adminApi.delete(`/products/${product.id}/images/${imageId}`), { success: 'Imagem removida.', invalidate });

  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const remaining = 10 - images.length;
  const pick = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (files.length) upload.mutate(files.slice(0, Math.min(8, remaining)));
  };
  const move = (index: number, dir: -1 | 1) => {
    const ids = images.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <section className="adm-card">
      <h2>
        Imagens <small>{images.length}/10 · JPG, PNG ou WEBP até 5 MB</small>
      </h2>
      {remaining > 0 && (
        <label
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          aria-busy={upload.isPending}
        >
          {upload.isPending ? 'Enviando…' : 'Arraste imagens aqui ou clique para escolher'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={upload.isPending} />
        </label>
      )}
      {images.length > 0 && (
        <div className="images-grid" style={{ marginTop: 12 }}>
          {images.map((img, i) => (
            <div key={img.id} className={`img-tile ${img.isPrimary ? 'primary' : ''}`}>
              <img src={img.url} alt={img.altText ?? ''} />
              <div className="meta">
                {img.isPrimary && <Tag tone="gold">Principal</Tag>}
                <label className="sr-only" htmlFor={`alt-${img.id}`}>
                  Texto alternativo
                </label>
                <input
                  id={`alt-${img.id}`}
                  className="input"
                  placeholder="Texto alternativo"
                  value={alt[img.id] ?? img.altText ?? ''}
                  onChange={(e) => setAlt((a) => ({ ...a, [img.id]: e.target.value }))}
                  onBlur={() => {
                    const value = alt[img.id];
                    if (value !== undefined && value !== (img.altText ?? '')) update.mutate({ imageId: img.id, body: { altText: value || null } });
                  }}
                />
                <div className="tools">
                  {!img.isPrimary && (
                    <button type="button" onClick={() => update.mutate({ imageId: img.id, body: { isPrimary: true } })}>
                      Tornar principal
                    </button>
                  )}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">
                    ←
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Mover para a direita">
                    →
                  </button>
                  <button type="button" onClick={() => window.confirm('Remover esta imagem?') && del.mutate(img.id)} aria-label="Remover imagem">
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
