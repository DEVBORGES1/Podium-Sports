import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type DragEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { CloseIcon, ExternalIcon, ImageIcon } from '../../components/admin/AdminIcons';
import { ProductVariants } from '../../components/admin/ProductVariants';
import { ConfirmDialog, FormField, MoneyInput, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useToast } from '../../contexts/ToastContext';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError, request } from '../../lib/api';
import { categoryOptions } from '../../lib/categories';
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
  useDocumentTitle(isNew ? 'Cadastrar produto' : 'Editar produto');

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
      success: isNew ? 'Produto cadastrado com sucesso. Agora envie as fotos.' : 'Alterações salvas.',
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

  const toast = useToast();
  const onSubmit = handleSubmit(
    (v) =>
      save.mutate(v, {
        onError: (err) => {
          if (err instanceof ApiError) for (const issue of err.fieldIssues) setError(issue.field as keyof FormValues, { message: issue.message });
        },
      }),
    () => toast.show('Não foi possível salvar. Verifique os campos destacados e tente novamente.', { tone: 'error' }),
  );

  if (!isNew && product.isPending) return <LoadingState />;
  if (!isNew && product.isError) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;

  return (
    <>
      <PageHeader
        title={isNew ? 'Cadastrar produto' : (p?.name ?? 'Produto')}
        description={
          p ? (
            <>
              Estoque atual: <b>{p.stockQuantity}</b> · Preço na loja: <b>{brl(p.effectivePriceCents)}</b>{' '}
              {p.isActive ? <Tag tone="ok">Publicado</Tag> : <Tag>Oculto da loja</Tag>}
            </>
          ) : (
            'Preencha as informações principais e o preço. As fotos são enviadas logo depois de salvar.'
          )
        }
        actions={
          <>
            {p && p.isActive && (
              <a href={`/produto/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                <ExternalIcon /> Ver na loja
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
              <h2>1. Informações principais</h2>
              <div className="form-cols two">
                <FormField id="name" label="Nome do produto" error={errors.name?.message} className="full" hint="Como aparece na loja. Ex.: Chuteira Nike Tiempo Futsal">
                  <input id="name" className="input" aria-invalid={!!errors.name} {...register('name')} />
                </FormField>
                <FormField id="categoryId" label="Categoria" error={errors.categoryId?.message}>
                  <select id="categoryId" className="select" aria-invalid={!!errors.categoryId} {...register('categoryId')}>
                    <option value="">Selecione…</option>
                    {/* Categorias principais com as subcategorias logo abaixo. */}
                    {categoryOptions(categories.data ?? []).map(({ category: c, depth }) => (
                      <option key={c.id} value={c.id}>
                        {depth ? '   ↳ ' : ''}
                        {c.name}
                        {!c.isActive ? ' (oculta na loja)' : ''}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="brand" label="Marca (opcional)" error={errors.brand?.message} hint="Ex.: Nike, Adidas, Max Titanium">
                  <input id="brand" className="input" {...register('brand')} />
                </FormField>
                <FormField id="description" label="Descrição (opcional)" error={errors.description?.message} className="full" hint="Tamanhos, sabores, material, indicações…">
                  <textarea id="description" className="textarea" rows={5} {...register('description')} />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>
                2. Preço e promoção <small>O valor cobrado é sempre recalculado pelo servidor.</small>
              </h2>
              <div className="form-cols two">
                <FormField id="priceCents" label="Preço" error={errors.priceCents?.message} hint="Ex.: 399,90">
                  <Controller
                    control={control}
                    name="priceCents"
                    render={({ field }) => <MoneyInput id="priceCents" value={field.value || null} onChange={(c) => field.onChange(c ?? 0)} invalid={!!errors.priceCents} />}
                  />
                </FormField>
                <FormField id="salePriceCents" label="Preço promocional (opcional)" error={errors.salePriceCents?.message} hint="Vale até ser apagado. Para ofertas com data de início e fim, use Promoções.">
                  <Controller
                    control={control}
                    name="salePriceCents"
                    render={({ field }) => <MoneyInput id="salePriceCents" value={field.value} onChange={field.onChange} invalid={!!errors.salePriceCents} placeholder="—" />}
                  />
                </FormField>
              </div>
            </section>

            {!isNew && p ? (
              <ProductImages product={p} />
            ) : (
              <section className="adm-card">
                <h2>3. Imagens</h2>
                <p className="notice">Salve o produto para enviar as fotos — a área de envio aparece aqui logo depois.</p>
              </section>
            )}

            {!isNew && p ? (
              <ProductVariants product={p} />
            ) : (
              <section className="adm-card">
                <h2>Tamanhos, sabores e cores</h2>
                <p className="notice">Salve o produto para cadastrar as opções (ex.: tamanhos 38 a 44), cada uma com seu estoque.</p>
              </section>
            )}
          </div>

          <div className="form-side">
            <section className="adm-card">
              <h2>4. Publicação e destaque</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <Controller control={control} name="isActive" render={({ field }) => <Switch label="Publicado na loja" checked={field.value} onChange={field.onChange} />} />
                <Controller control={control} name="isFeatured" render={({ field }) => <Switch label="Destaque na página inicial" checked={field.value} onChange={field.onChange} />} />
              </div>
            </section>
            <section className="adm-card">
              <h2>5. Estoque</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {isNew ? (
                  <FormField id="initialStock" label="Quantidade em estoque" hint="Quantas unidades a loja tem agora. Fica registrado como carga inicial. Se o produto tiver tamanhos, deixe 0 e lance o estoque de cada tamanho depois de salvar.">
                    <input id="initialStock" className="input" type="number" inputMode="numeric" min={0} {...register('initialStock', { setValueAs: toNumber })} />
                  </FormField>
                ) : p?.variants?.length ? (
                  <p className="notice">
                    Estoque por {(p.variantType ?? 'opção').toLowerCase()}: <b>{p.stockQuantity}</b> no total. Ajuste cada opção na seção <b>{p.variantType ?? 'Opções'}</b> ou em{' '}
                    <Link to={`/admin/inventory?q=${encodeURIComponent(p.name)}`} className="link-btn">
                      Estoque
                    </Link>
                    .
                  </p>
                ) : (
                  <p className="notice">
                    Saldo atual: <b>{p?.stockQuantity}</b>. Para adicionar ou retirar unidades use{' '}
                    <Link to={`/admin/inventory?q=${encodeURIComponent(p?.name ?? '')}`} className="link-btn">
                      Estoque
                    </Link>{' '}
                    — assim cada mudança fica no histórico.
                  </p>
                )}
                <FormField id="minStock" label="Avisar quando chegar a" error={errors.minStock?.message} hint="Abaixo dessa quantidade o produto aparece como estoque baixo.">
                  <input id="minStock" className="input" type="number" inputMode="numeric" min={0} {...register('minStock', { setValueAs: toNumber })} />
                </FormField>
              </div>
            </section>
            <details className="adm-card advanced">
              <summary>Configurações avançadas</summary>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <FormField id="slug" label="Endereço da página" error={errors.slug?.message} hint={isNew ? 'Deixe em branco: é gerado a partir do nome.' : `loja/produto/${p?.slug ?? ''}`}>
                  <input id="slug" className="input" {...register('slug')} />
                </FormField>
                <FormField id="sortOrder" label="Ordem de exibição" hint="Menor número aparece primeiro.">
                  <input id="sortOrder" className="input" type="number" inputMode="numeric" min={0} {...register('sortOrder', { setValueAs: toNumber })} />
                </FormField>
              </div>
            </details>
            {!isNew && p && (
              <section className="adm-card danger-zone">
                <h2>Excluir produto</h2>
                {p.canDelete ? (
                  <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setConfirmDelete(true)}>
                    Excluir definitivamente
                  </button>
                ) : (
                  <p className="notice">Este produto aparece em {p.orderCount} pedido(s) e não pode ser excluído (o histórico é preservado). Desligue “Publicado na loja” para tirá-lo da vitrine.</p>
                )}
              </section>
            )}
          </div>
        </div>
        <div className="form-bar">
          <span className="notice">{formState.isDirty ? 'Há alterações não salvas.' : isNew ? 'Campos obrigatórios: nome, categoria e preço.' : 'Tudo salvo.'}</span>
          <Link to="/admin/products" className="btn btn-quiet">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-gold" disabled={save.isPending} aria-busy={save.isPending}>
            {isNew ? 'Cadastrar produto' : 'Salvar alterações'}
          </button>
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
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [alt, setAlt] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const invalidate = [['admin', 'product', product.id], ['admin', 'products'], ['products']];

  const upload = useAdminMutation(
    (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      return request<AdminProduct>(`/admin/products/${product.id}/images`, { method: 'POST', body: fd, auth: true });
    },
    { success: (r) => `Imagens enviadas. O produto tem ${r.images.length} foto(s).`, invalidate },
  );
  const update = useAdminMutation((v: { imageId: string; body: object }) => adminApi.patch(`/products/${product.id}/images/${v.imageId}`, v.body), {
    success: 'Imagem atualizada.',
    invalidate,
  });
  const reorder = useAdminMutation((imageIds: string[]) => adminApi.put(`/products/${product.id}/images/order`, { imageIds }), { invalidate });
  const del = useAdminMutation((imageId: string) => adminApi.delete(`/products/${product.id}/images/${imageId}`), {
    success: 'Imagem removida.',
    invalidate,
    onSuccess: () => setRemoving(null),
  });

  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const remaining = 10 - images.length;
  const pick = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
    const valid = all.filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    const rejected = all.length - valid.length;
    const accepted = valid.slice(0, Math.min(8, remaining));
    const skipped = valid.length - accepted.length;
    if (rejected || skipped) {
      const parts = [];
      if (rejected) parts.push(`${rejected} arquivo(s) ignorado(s): use JPG, PNG ou WEBP de até 5 MB`);
      if (skipped) parts.push(`${skipped} além do limite (8 por envio, 10 por produto)`);
      toast.show(`${parts.join('; ')}.`, { tone: 'error' });
    }
    if (accepted.length) upload.mutate(accepted);
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
        3. Imagens <small>{images.length}/10 · JPG, PNG ou WEBP até 5 MB · a primeira é a principal</small>
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
          <ImageIcon className="dz-icon" />
          <b>{upload.isPending ? 'Enviando…' : 'Arraste as fotos aqui ou clique para escolher'}</b>
          <span>Até 8 por vez</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={upload.isPending} />
        </label>
      )}
      {images.length > 0 && (
        <div className="images-grid" style={{ marginTop: 12 }}>
          {images.map((img, i) => (
            <div key={img.id} className={`img-tile ${img.isPrimary ? 'primary' : ''}`}>
              <img src={img.thumbUrl ?? img.url} alt={img.altText ?? ''} />
              <div className="meta">
                {img.isPrimary && <Tag tone="gold">Principal</Tag>}
                <label className="sr-only" htmlFor={`alt-${img.id}`}>
                  Descrição da imagem
                </label>
                <input
                  id={`alt-${img.id}`}
                  className="input"
                  placeholder="Descrição (acessibilidade)"
                  value={alt[img.id] ?? img.altText ?? ''}
                  onChange={(e) => setAlt((a) => ({ ...a, [img.id]: e.target.value }))}
                  onBlur={() => {
                    const value = alt[img.id];
                    if (value !== undefined && value !== (img.altText ?? '')) update.mutate({ imageId: img.id, body: { altText: value || null } });
                  }}
                />
                <div className="tools">
                  {!img.isPrimary && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => update.mutate({ imageId: img.id, body: { isPrimary: true } })}>
                      Tornar principal
                    </button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} aria-label="Mover para a esquerda">
                    ←
                  </button>
                  <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, 1)} disabled={i === images.length - 1 || reorder.isPending} aria-label="Mover para a direita">
                    →
                  </button>
                  <button type="button" className="btn btn-danger-outline btn-sm btn-icon" onClick={() => setRemoving(img.id)} aria-label="Remover imagem">
                    <CloseIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title="Remover esta imagem?"
          message="A foto sai do produto e da loja. Esta ação não pode ser desfeita."
          confirmLabel="Remover"
          danger
          busy={del.isPending}
          onConfirm={() => del.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
