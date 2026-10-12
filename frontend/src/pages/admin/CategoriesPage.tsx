import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, FormField, ImageUpload, Modal, PageHeader, Switch, TableState, Tag } from '../../components/admin/ui';
import { CategoryGlyph } from '../../components/ui/Icons';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError, errorMessage } from '../../lib/api';
import type { AdminCategory } from '../../types/admin';
import type { CategoryIcon } from '../../types/api';

const ICONS: { value: CategoryIcon; label: string }[] = [
  { value: 'ball', label: 'Bola' },
  { value: 'run', label: 'Corrida' },
  { value: 'jar', label: 'Pote (suplementos)' },
  { value: 'shirt', label: 'Camisa' },
  { value: 'glove', label: 'Luva' },
  { value: 'dumbbell', label: 'Halter' },
  { value: 'shoe', label: 'Tênis / chuteira' },
];
const ICON_VALUES = ['ball', 'run', 'jar', 'shirt', 'glove', 'dumbbell', 'shoe'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(80, 'Máximo de 80 caracteres.'),
  slug: z
    .string()
    .trim()
    .max(100, 'Máximo de 100 caracteres.')
    .refine((v) => v === '' || SLUG.test(v), 'Use apenas letras minúsculas, números e hífens.'),
  description: z.string().trim().max(500, 'Máximo de 500 caracteres.'),
  icon: z.enum(ICON_VALUES),
  colorFrom: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
  colorTo: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
  imagePath: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number({ error: 'Informe um número.' }).int('Use um número inteiro.').min(0, 'Não pode ser negativo.').max(100_000),
  isActive: z.boolean(),
  showOnHome: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const INVALIDATE = [['admin', 'categories'], ['categories'], ['products']];
const toInt = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

/** Calcula as alterações de ordem ao mover um item: troca as posições; se as ordens forem iguais, renumera a lista. */
function reorderPatches<T extends { id: string; sortOrder: number }>(list: T[], index: number, dir: -1 | 1) {
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
  return next.map((item, i) => ({ id: item.id, sortOrder: (i + 1) * 10, prev: item.sortOrder })).filter((p) => p.sortOrder !== p.prev).map(({ id, sortOrder }) => ({ id, sortOrder }));
}

function CategorySwatch({ icon, colorFrom, colorTo, imageUrl, size = 44 }: { icon: CategoryIcon; colorFrom: string; colorTo: string; imageUrl: string | null; size?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    flex: '0 0 auto',
    color: 'var(--gold)',
    background: `radial-gradient(circle at 30% 20%, ${colorFrom}, ${colorTo})`,
  };
  return (
    <div style={style} aria-hidden>
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <CategoryGlyph icon={icon} style={{ width: '58%', height: '58%' }} strokeWidth={1.3} />
      )}
    </div>
  );
}

export default function CategoriesPage() {
  useDocumentTitle('Categorias');
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items) });
  const list = categories.data ?? [];

  const reorder = useAdminMutation((patches: { id: string; sortOrder: number }[]) => Promise.all(patches.map((p) => adminApi.patch(`/categories/${p.id}`, { sortOrder: p.sortOrder }))), {
    invalidate: INVALIDATE,
  });
  const toggle = useAdminMutation((v: { id: string; body: Partial<Pick<AdminCategory, 'isActive' | 'showOnHome'>> }) => adminApi.patch<AdminCategory>(`/categories/${v.id}`, v.body), {
    success: 'Categoria atualizada.',
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });
  const remove = useAdminMutation((id: string) => adminApi.delete(`/categories/${id}`), {
    success: 'Categoria excluída.',
    invalidate: INVALIDATE,
    silentError: true,
    onSuccess: () => setDeleting(null),
  });

  const move = (index: number, dir: -1 | 1) => {
    const patches = reorderPatches(list, index, dir);
    if (patches.length) reorder.mutate(patches);
  };
  const nextSortOrder = list.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 10;
  const removeError = remove.error;
  const inUse = removeError instanceof ApiError && removeError.code === 'CATEGORY_IN_USE';

  return (
    <>
      <PageHeader
        title="Categorias"
        description={categories.data ? `${categories.data.length} categoria(s)` : undefined}
        actions={
          <button type="button" className="btn btn-gold btn-sm" onClick={() => setEditing('new')}>
            + Nova categoria
          </button>
        }
      />
      <p className="notice" style={{ marginBottom: 12 }}>
        A ordem define a sequência na loja (menor número primeiro). Alterar ou desativar uma categoria não afeta pedidos já realizados — eles guardam o nome e o preço dos itens no momento da
        compra.
      </p>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th className="num">Ordem</th>
              <th>Categoria</th>
              <th className="num">Produtos</th>
              <th>Situação</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.isPending || categories.isError || list.length === 0 ? (
              <TableState colSpan={5} loading={categories.isPending} error={categories.error} empty="Nenhuma categoria cadastrada." onRetry={() => categories.refetch()} />
            ) : (
              list.map((c, i) => (
                <tr key={c.id}>
                  <td className="num">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{c.sortOrder}</span>
                      <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} aria-label={`Mover ${c.name} para cima`}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        onClick={() => move(i, 1)}
                        disabled={i === list.length - 1 || reorder.isPending}
                        aria-label={`Mover ${c.name} para baixo`}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="cell-main">
                      <CategorySwatch icon={c.icon} colorFrom={c.colorFrom} colorTo={c.colorTo} imageUrl={c.imageUrl} />
                      <div>
                        <b>{c.name}</b>
                        <div className="muted">/{c.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{c.productCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.isActive ? <Tag tone="ok">Ativa</Tag> : <Tag>Inativa</Tag>}
                      {c.showOnHome && <Tag tone="gold">Na home</Tag>}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(c)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-sm"
                        onClick={() => {
                          remove.reset();
                          setDeleting(c);
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && <CategoryFormModal key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} defaultSortOrder={nextSortOrder} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Excluir categoria?"
          message={
            deleting.productCount > 0 ? (
              <>
                <b>{deleting.name}</b> possui {deleting.productCount} produto(s) e não pode ser excluída enquanto houver produtos vinculados.
              </>
            ) : (
              <>
                <b>{deleting.name}</b> será removida definitivamente. Esta ação não pode ser desfeita.
              </>
            )
          }
          confirmLabel="Excluir"
          danger
          busy={remove.isPending || toggle.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        >
          {removeError && (
            <div className={`alert ${inUse ? 'alert-warn' : 'alert-error'}`} role="alert" style={{ marginTop: 12 }}>
              {errorMessage(removeError)}
              {inUse && deleting.isActive && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: deleting.id, body: { isActive: false } })}>
                    Desativar categoria
                  </button>
                </div>
              )}
            </div>
          )}
          {!removeError && deleting.productCount > 0 && deleting.isActive && (
            <p className="notice" style={{ marginTop: 12 }}>
              Sugestão: mova os produtos para outra categoria ou{' '}
              <button type="button" className="link-btn" onClick={() => toggle.mutate({ id: deleting.id, body: { isActive: false } })} disabled={toggle.isPending}>
                desative a categoria
              </button>{' '}
              para ocultá-la da loja.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function ColorField({ id, label, name, control, error }: { id: string; label: string; name: 'colorFrom' | 'colorTo'; control: Control<FormValues>; error?: string }) {
  return (
    <FormField id={id} label={label} error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="color-row">
            <input type="color" aria-label={`${label} (seletor)`} value={HEX.test(field.value) ? field.value : '#000000'} onChange={(e) => field.onChange(e.target.value)} />
            <input id={id} className="input" maxLength={7} aria-invalid={!!error} value={field.value} onChange={(e) => field.onChange(e.target.value.trim())} onBlur={field.onBlur} />
          </div>
        )}
      />
    </FormField>
  );
}

function CategoryFormModal({ category, defaultSortOrder, onClose }: { category: AdminCategory | null; defaultSortOrder: number; onClose: () => void }) {
  const isNew = !category;
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: category
      ? {
          name: category.name,
          slug: category.slug,
          description: category.description ?? '',
          icon: category.icon,
          colorFrom: category.colorFrom,
          colorTo: category.colorTo,
          imagePath: category.imagePath,
          imageUrl: category.imageUrl,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          showOnHome: category.showOnHome,
        }
      : {
          name: '',
          slug: '',
          description: '',
          icon: 'dumbbell',
          colorFrom: '#44464d',
          colorTo: '#121214',
          imagePath: null,
          imageUrl: null,
          sortOrder: defaultSortOrder,
          isActive: true,
          showOnHome: false,
        },
  });
  const errors = formState.errors;
  const [icon, colorFrom, colorTo, imageUrl] = useWatch({ control, name: ['icon', 'colorFrom', 'colorTo', 'imageUrl'] });

  const save = useAdminMutation(
    (v: FormValues) => {
      const body = {
        name: v.name,
        description: v.description || null,
        icon: v.icon,
        colorFrom: v.colorFrom,
        colorTo: v.colorTo,
        imagePath: v.imagePath,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        showOnHome: v.showOnHome,
        ...(v.slug ? { slug: v.slug } : {}),
      };
      return isNew ? adminApi.post<AdminCategory>('/categories', body) : adminApi.patch<AdminCategory>(`/categories/${category.id}`, body);
    },
    { success: isNew ? 'Categoria criada.' : 'Categoria salva.', invalidate: INVALIDATE, onSuccess: onClose },
  );

  const fields = Object.keys(schema.shape) as (keyof FormValues)[];
  const onSubmit = handleSubmit((v) =>
    save.mutate(v, {
      onError: (err) => {
        if (!(err instanceof ApiError)) return;
        if (err.code === 'DUPLICATE') setError('slug', { message: 'Já existe uma categoria com este nome ou endereço.' });
        for (const issue of err.fieldIssues) {
          const field = issue.field as keyof FormValues;
          if (fields.includes(field)) setError(field, { message: issue.message });
        }
      },
    }),
  );

  return (
    <Modal
      title={isNew ? 'Nova categoria' : `Editar categoria`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="category-form" className="btn btn-gold btn-sm" disabled={save.isPending} aria-busy={save.isPending}>
            {save.isPending ? 'Salvando…' : isNew ? 'Criar categoria' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} noValidate className="form-cols two">
        <FormField id="cat-name" label="Nome" error={errors.name?.message}>
          <input id="cat-name" className="input" aria-invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField id="cat-slug" label="Endereço (slug)" error={errors.slug?.message} hint={isNew ? 'Deixe em branco para gerar a partir do nome.' : 'Usado no link da categoria na loja.'}>
          <input id="cat-slug" className="input" aria-invalid={!!errors.slug} placeholder={isNew ? 'gerado automaticamente' : undefined} {...register('slug')} />
        </FormField>
        <FormField id="cat-description" label="Descrição" error={errors.description?.message} className="full">
          <textarea id="cat-description" className="textarea" rows={3} {...register('description')} />
        </FormField>
        <FormField id="cat-icon" label="Ícone" error={errors.icon?.message}>
          <select id="cat-icon" className="select" {...register('icon')}>
            {ICONS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="field">
          <span className="label">Prévia</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <CategorySwatch icon={icon} colorFrom={HEX.test(colorFrom) ? colorFrom : '#44464d'} colorTo={HEX.test(colorTo) ? colorTo : '#121214'} imageUrl={imageUrl} size={64} />
            <span className="notice">Sem imagem, a loja usa o gradiente com o ícone.</span>
          </div>
        </div>
        <ColorField id="cat-colorFrom" label="Cor inicial" name="colorFrom" control={control} error={errors.colorFrom?.message} />
        <ColorField id="cat-colorTo" label="Cor final" name="colorTo" control={control} error={errors.colorTo?.message} />
        <div className="field full">
          <span className="label">Imagem (opcional)</span>
          <ImageUpload
            folder="categories"
            label="Imagem da categoria"
            url={imageUrl}
            onUploaded={(path, url) => {
              setValue('imagePath', path, { shouldDirty: true });
              setValue('imageUrl', url, { shouldDirty: true });
            }}
            onRemove={() => {
              setValue('imagePath', null, { shouldDirty: true });
              setValue('imageUrl', null, { shouldDirty: true });
            }}
          />
          {errors.imagePath && (
            <span className="err" role="alert">
              {errors.imagePath.message}
            </span>
          )}
        </div>
        <FormField id="cat-sortOrder" label="Ordem de exibição" error={errors.sortOrder?.message} hint="Menor número aparece primeiro.">
          <input id="cat-sortOrder" className="input" type="number" min={0} {...register('sortOrder', { setValueAs: toInt })} />
        </FormField>
        <div style={{ display: 'grid', gap: 12, alignContent: 'center' }}>
          <Controller control={control} name="isActive" render={({ field }) => <Switch label="Ativa (visível na loja)" checked={field.value} onChange={field.onChange} />} />
          <Controller control={control} name="showOnHome" render={({ field }) => <Switch label="Mostrar nos destaques da página inicial" checked={field.value} onChange={field.onChange} />} />
        </div>
        <p className="notice full">Alterações em categorias não afetam pedidos já realizados.</p>
      </form>
    </Modal>
  );
}
