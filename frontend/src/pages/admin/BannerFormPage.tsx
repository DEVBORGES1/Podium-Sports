import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { FormField, ImageUpload, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError } from '../../lib/api';
import { CONTENT_STATE } from '../../lib/labels';
import type { AdminBanner } from '../../types/admin';
import { BANNER_ICONS, BannerSlidePreview, type BannerIcon, type SlideData } from '../../components/admin/BannerSlidePreview';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ICON_LABELS: Record<BannerIcon, string> = {
  trophy: 'Troféu',
  ball: 'Bola',
  run: 'Corrida',
  jar: 'Pote (suplementos)',
  shirt: 'Camisa',
  glove: 'Luva',
  dumbbell: 'Halter',
  shoe: 'Tênis / chuteira',
};

/** Mesmo critério do servidor: caminho interno ("/produtos?...") ou URL https. */
const isSafeLink = (v: string) => /^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v);
const LINK_MESSAGE = 'Use um caminho interno começando com "/" ou uma URL https://.';

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const schema = z
  .object({
    kicker: text(80),
    title: z.string().trim().min(1, 'Informe o título.').max(80, 'Máximo de 80 caracteres.'),
    highlight: text(80),
    subtitle: text(300),
    imagePath: z.string().nullable(),
    imageUrl: z.string().nullable(),
    icon: z.enum(['', ...BANNER_ICONS]),
    colorFrom: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
    colorTo: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
    buttonLabel: text(40),
    buttonUrl: text(300).refine((v) => v === '' || isSafeLink(v), LINK_MESSAGE),
    secondaryButtonLabel: text(40),
    secondaryButtonUrl: text(300).refine((v) => v === '' || isSafeLink(v), LINK_MESSAGE),
    badgeTop: text(20),
    badgeMain: text(12),
    badgeBottom: text(20),
    sortOrder: z.number({ error: 'Informe um número.' }).int('Use um número inteiro.').min(0, 'Não pode ser negativo.').max(100_000),
    isActive: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.buttonLabel !== !v.buttonUrl) {
      ctx.addIssue({ code: 'custom', path: [v.buttonLabel ? 'buttonUrl' : 'buttonLabel'], message: 'Informe o texto e o destino do botão juntos.' });
    }
    if (!v.secondaryButtonLabel !== !v.secondaryButtonUrl) {
      ctx.addIssue({
        code: 'custom',
        path: [v.secondaryButtonLabel ? 'secondaryButtonUrl' : 'secondaryButtonLabel'],
        message: 'Informe o texto e o destino do botão juntos.',
      });
    }
    if (v.startsAt && Number.isNaN(new Date(v.startsAt).getTime())) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Data inválida.' });
    if (v.endsAt && Number.isNaN(new Date(v.endsAt).getTime())) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Data inválida.' });
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A data final deve ser posterior à inicial.' });
    }
  });
type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  kicker: '',
  title: '',
  highlight: '',
  subtitle: '',
  imagePath: null,
  imageUrl: null,
  icon: '',
  colorFrom: '#2a2a2e',
  colorTo: '#0b0b0c',
  buttonLabel: '',
  buttonUrl: '',
  secondaryButtonLabel: '',
  secondaryButtonUrl: '',
  badgeTop: '',
  badgeMain: '',
  badgeBottom: '',
  sortOrder: 0,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

const toInt = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

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

function LivePreview({ control }: { control: Control<FormValues> }) {
  const v = useWatch({ control });
  const data: SlideData = {
    kicker: v.kicker?.trim() || null,
    title: v.title?.trim() ?? '',
    highlight: v.highlight?.trim() || null,
    subtitle: v.subtitle?.trim() || null,
    imageUrl: v.imageUrl ?? null,
    icon: v.icon ? v.icon : null,
    colorFrom: v.colorFrom ?? DEFAULTS.colorFrom,
    colorTo: v.colorTo ?? DEFAULTS.colorTo,
    buttonLabel: v.buttonLabel?.trim() || null,
    secondaryButtonLabel: v.secondaryButtonLabel?.trim() || null,
    badgeTop: v.badgeTop?.trim() || null,
    badgeMain: v.badgeMain?.trim() || null,
    badgeBottom: v.badgeBottom?.trim() || null,
  };
  return <BannerSlidePreview banner={data} zoom={0.5} />;
}

export default function BannerFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  useDocumentTitle(isNew ? 'Novo banner' : 'Editar banner');

  const banners = useQuery({ queryKey: ['admin', 'banners'], queryFn: () => adminApi.get<{ items: AdminBanner[] }>('/banners').then((r) => r.items) });
  const banner = id ? banners.data?.find((b) => b.id === id) : undefined;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const { register, control, handleSubmit, formState, reset, setError, setValue, getFieldState } = form;
  const errors = formState.errors;
  const imageUrl = useWatch({ control, name: 'imageUrl' });

  useEffect(() => {
    if (!banner) return;
    reset({
      kicker: banner.kicker ?? '',
      title: banner.title,
      highlight: banner.highlight ?? '',
      subtitle: banner.subtitle ?? '',
      imagePath: banner.imagePath,
      imageUrl: banner.imageUrl,
      icon: banner.icon ?? '',
      colorFrom: banner.colorFrom,
      colorTo: banner.colorTo,
      buttonLabel: banner.buttonLabel ?? '',
      buttonUrl: banner.buttonUrl ?? '',
      secondaryButtonLabel: banner.secondaryButtonLabel ?? '',
      secondaryButtonUrl: banner.secondaryButtonUrl ?? '',
      badgeTop: banner.badgeTop ?? '',
      badgeMain: banner.badgeMain ?? '',
      badgeBottom: banner.badgeBottom ?? '',
      sortOrder: banner.sortOrder,
      isActive: banner.isActive,
      startsAt: toLocalInput(banner.startsAt),
      endsAt: toLocalInput(banner.endsAt),
    });
  }, [banner, reset]);

  // Novo banner entra no fim da fila, a menos que a ordem já tenha sido editada.
  const list = banners.data;
  useEffect(() => {
    if (!isNew || !list) return;
    if (getFieldState('sortOrder').isDirty) return;
    setValue('sortOrder', list.reduce((max, b) => Math.max(max, b.sortOrder), 0) + (list.length ? 10 : 0));
  }, [isNew, list, getFieldState, setValue]);

  const save = useAdminMutation(
    (v: FormValues) => {
      const body = {
        kicker: v.kicker || null,
        title: v.title,
        highlight: v.highlight || null,
        subtitle: v.subtitle || null,
        imagePath: v.imagePath,
        icon: v.icon || null,
        colorFrom: v.colorFrom,
        colorTo: v.colorTo,
        buttonLabel: v.buttonLabel || null,
        buttonUrl: v.buttonUrl || null,
        secondaryButtonLabel: v.secondaryButtonLabel || null,
        secondaryButtonUrl: v.secondaryButtonUrl || null,
        badgeTop: v.badgeTop || null,
        badgeMain: v.badgeMain || null,
        badgeBottom: v.badgeBottom || null,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        startsAt: fromLocalInput(v.startsAt),
        endsAt: fromLocalInput(v.endsAt),
      };
      return isNew ? adminApi.post<AdminBanner>('/banners', body) : adminApi.patch<AdminBanner>(`/banners/${id}`, body);
    },
    {
      success: isNew ? 'Banner criado.' : 'Banner salvo.',
      invalidate: [['admin', 'banners'], ['banners']],
      onSuccess: () => navigate('/admin/banners'),
    },
  );

  const fieldNames = Object.keys(DEFAULTS) as (keyof FormValues)[];
  const onSubmit = handleSubmit((v) =>
    save.mutate(v, {
      onError: (err) => {
        if (!(err instanceof ApiError)) return;
        for (const issue of err.fieldIssues) {
          const field = issue.field as keyof FormValues;
          if (fieldNames.includes(field)) setError(field, { message: issue.message });
        }
      },
    }),
  );

  if (!isNew && banners.isPending) return <LoadingState />;
  if (!isNew && banners.isError) return <ErrorState error={banners.error} onRetry={() => banners.refetch()} />;
  if (!isNew && !banner) {
    return (
      <>
        <ErrorState title="Banner não encontrado" error={new ApiError(404, 'NOT_FOUND', 'O banner pode ter sido excluído.')} />
        <p style={{ textAlign: 'center' }}>
          <Link to="/admin/banners" className="btn btn-outline btn-sm">
            Voltar aos banners
          </Link>
        </p>
      </>
    );
  }
  const state = banner ? CONTENT_STATE[banner.state] : undefined;

  return (
    <>
      <PageHeader
        title={isNew ? 'Novo banner' : 'Editar banner'}
        description={state ? <Tag tone={state.tone}>{state.label}</Tag> : 'Slide exibido no topo da página inicial.'}
        actions={
          <Link to="/admin/banners" className="btn btn-outline btn-sm">
            Voltar
          </Link>
        }
      />
      <form onSubmit={onSubmit} noValidate>
        <div className="adm-grid main-side">
          <div>
            <section className="adm-card">
              <h2>Textos</h2>
              <div className="form-cols two">
                <FormField id="kicker" label="Chamada (acima do título)" error={errors.kicker?.message} className="full">
                  <input id="kicker" className="input" aria-invalid={!!errors.kicker} {...register('kicker')} />
                </FormField>
                <FormField id="title" label="Título" error={errors.title?.message}>
                  <input id="title" className="input" aria-invalid={!!errors.title} {...register('title')} />
                </FormField>
                <FormField id="highlight" label="Destaque (2ª linha em dourado)" error={errors.highlight?.message}>
                  <input id="highlight" className="input" aria-invalid={!!errors.highlight} {...register('highlight')} />
                </FormField>
                <FormField id="subtitle" label="Subtítulo" error={errors.subtitle?.message} className="full">
                  <textarea id="subtitle" className="textarea" rows={3} aria-invalid={!!errors.subtitle} {...register('subtitle')} />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>
                Botões <small>Caminho interno (ex.: /produtos?categoria=chuteiras) ou https://…</small>
              </h2>
              <div className="form-cols two">
                <FormField id="buttonLabel" label="Texto do botão principal" error={errors.buttonLabel?.message}>
                  <input id="buttonLabel" className="input" aria-invalid={!!errors.buttonLabel} {...register('buttonLabel')} />
                </FormField>
                <FormField id="buttonUrl" label="Destino do botão principal" error={errors.buttonUrl?.message}>
                  <input id="buttonUrl" className="input" placeholder="/produtos" aria-invalid={!!errors.buttonUrl} {...register('buttonUrl')} />
                </FormField>
                <FormField id="secondaryButtonLabel" label="Texto do botão secundário" error={errors.secondaryButtonLabel?.message}>
                  <input id="secondaryButtonLabel" className="input" aria-invalid={!!errors.secondaryButtonLabel} {...register('secondaryButtonLabel')} />
                </FormField>
                <FormField id="secondaryButtonUrl" label="Destino do botão secundário" error={errors.secondaryButtonUrl?.message}>
                  <input id="secondaryButtonUrl" className="input" placeholder="/produtos?promocao=1" aria-invalid={!!errors.secondaryButtonUrl} {...register('secondaryButtonUrl')} />
                </FormField>
              </div>
            </section>

            <section className="adm-card">
              <h2>Visual</h2>
              <div className="form-cols two">
                <div className="field full">
                  <span className="label">Foto de fundo (opcional)</span>
                  <ImageUpload
                    folder="banners"
                    label="Foto de fundo do banner"
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
                  <span className="hint">Com foto, a loja aplica um escurecimento à esquerda para manter o texto legível. Sem foto, usa o gradiente abaixo.</span>
                </div>
                <ColorField id="colorFrom" label="Cor do brilho" name="colorFrom" control={control} error={errors.colorFrom?.message} />
                <ColorField id="colorTo" label="Cor do fundo" name="colorTo" control={control} error={errors.colorTo?.message} />
                <FormField id="icon" label="Ícone no anel dourado" error={errors.icon?.message} className="full">
                  <select id="icon" className="select" {...register('icon')}>
                    <option value="">Nenhum</option>
                    {BANNER_ICONS.map((i) => (
                      <option key={i} value={i}>
                        {ICON_LABELS[i]}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="form-cols three" style={{ marginTop: 14 }}>
                <FormField id="badgeTop" label="Selo: linha de cima" error={errors.badgeTop?.message}>
                  <input id="badgeTop" className="input" placeholder="Até" {...register('badgeTop')} />
                </FormField>
                <FormField id="badgeMain" label="Selo: destaque" error={errors.badgeMain?.message}>
                  <input id="badgeMain" className="input" placeholder="40%" {...register('badgeMain')} />
                </FormField>
                <FormField id="badgeBottom" label="Selo: linha de baixo" error={errors.badgeBottom?.message}>
                  <input id="badgeBottom" className="input" placeholder="OFF" {...register('badgeBottom')} />
                </FormField>
              </div>
              <p className="notice" style={{ marginTop: 8 }}>
                O selo aparece sobre o anel quando há um ícone e o destaque está preenchido.
              </p>
            </section>

            <section className="adm-card">
              <h2>Publicação</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <Controller control={control} name="isActive" render={({ field }) => <Switch label="Ativo" checked={field.value} onChange={field.onChange} />} />
                <FormField id="sortOrder" label="Ordem de exibição" error={errors.sortOrder?.message} hint="Menor número aparece primeiro.">
                  <input id="sortOrder" className="input" type="number" min={0} {...register('sortOrder', { setValueAs: toInt })} />
                </FormField>
                <div className="form-cols two">
                  <FormField id="startsAt" label="Início (opcional)" error={errors.startsAt?.message}>
                    <input id="startsAt" className="input" type="datetime-local" aria-invalid={!!errors.startsAt} {...register('startsAt')} />
                  </FormField>
                  <FormField id="endsAt" label="Fim (opcional)" error={errors.endsAt?.message}>
                    <input id="endsAt" className="input" type="datetime-local" aria-invalid={!!errors.endsAt} {...register('endsAt')} />
                  </FormField>
                </div>
                <p className="notice">Sem datas, o banner fica no ar enquanto estiver ativo. Fora do período ele sai da página inicial automaticamente.</p>
              </div>
            </section>
            <div className="adm-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-gold" disabled={save.isPending} aria-busy={save.isPending}>
                {save.isPending ? 'Salvando…' : isNew ? 'Criar banner' : 'Salvar alterações'}
              </button>
              <Link to="/admin/banners" className="btn btn-outline">
                Cancelar
              </Link>
            </div>
          </div>

          <div style={{ position: 'sticky', top: 74 }}>
            <section className="adm-card">
              <h2>
                Prévia <small>Atualiza enquanto você digita</small>
              </h2>
              <LivePreview control={control} />
              <p className="notice" style={{ marginTop: 10 }}>
                Visualização em escala reduzida. Na loja o slide ocupa toda a largura da tela e os botões levam aos destinos informados.
              </p>
            </section>
          </div>
        </div>
      </form>
    </>
  );
}
