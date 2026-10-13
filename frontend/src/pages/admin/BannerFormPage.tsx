import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Control, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { BannerSlidePreview, type PreviewDevice } from '../../components/admin/BannerSlidePreview';
import { ButtonTargetField } from '../../components/admin/ButtonTargetField';
import { ConfirmDialog, FormField, ImageUpload, MoneyInput, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError } from '../../lib/api';
import { draftFromTarget, EMPTY_TARGET, targetError, targetFromDraft, type TargetDraft } from '../../lib/banner-targets';
import {
  BANNER_ICONS,
  CENTER_FRAME,
  clampFrame,
  defaultFrame,
  defaultOverlay,
  discountPercent,
  MAX_ZOOM,
  MIN_ZOOM,
  mobileImageSize,
  sampleEdgeColor,
  type BannerIcon,
  type SlideData,
} from '../../lib/banner';
import { brl } from '../../lib/format';
import { CONTENT_STATE } from '../../lib/labels';
import type { AdminBanner, AdminProduct } from '../../types/admin';
import type { BannerFrame, BannerLayout } from '../../types/api';

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
const CTA_SUGGESTIONS = ['Quero a minha', 'Comprar agora', 'Ver oferta', 'Aproveitar desconto', 'Ver todas as chuteiras', 'Ver todos os produtos', 'Falar no WhatsApp'];

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const cents = z.number().int().positive('O preço deve ser maior que zero.').nullable();
const targetDraft = z.object({
  type: z.enum(['none', 'legacy', 'product', 'category', 'page', 'external', 'whatsapp']),
  productId: z.string(),
  categoryId: z.string(),
  page: z.enum(['home', 'catalog', 'offers', 'new']),
  url: z.string(),
  whatsappMessage: z.string(),
  legacyUrl: z.string(),
});
const frame = z.object({ mode: z.enum(['fill', 'fit']), x: z.number(), y: z.number(), zoom: z.number() });

const schema = z
  .object({
    kicker: text(80),
    showKicker: z.boolean(),
    title: z.string().trim().min(1, 'Informe o título.').max(80, 'Máximo de 80 caracteres.'),
    highlight: text(80),
    subtitle: text(300),
    footnote: text(160),
    priceOriginalCents: cents,
    priceSaleCents: cents,
    showPrices: z.boolean(),
    buttonLabel: text(40),
    buttonTarget: targetDraft,
    secondaryButtonEnabled: z.boolean(),
    secondaryButtonLabel: text(40),
    secondaryButtonTarget: targetDraft,
    imagePath: z.string().nullable(),
    imageUrl: z.string().nullable(),
    frameDesktop: frame,
    frameMobile: frame.nullable(),
    imageBg: z.string().refine((v) => v === '' || HEX.test(v), 'Use uma cor no formato #RRGGBB.'),
    mobileImagePath: z.string().nullable(),
    mobileImageUrl: z.string().nullable(),
    mobileImageBg: z.string().refine((v) => v === '' || HEX.test(v), 'Use uma cor no formato #RRGGBB.'),
    layout: z.enum(['split', 'full']),
    contentAlign: z.enum(['left', 'right']),
    overlay: z.number().int().min(0).max(90),
    icon: z.enum(['', ...BANNER_ICONS]),
    colorFrom: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
    colorTo: z.string().regex(HEX, 'Use uma cor no formato #RRGGBB.'),
    badgeTop: text(20),
    badgeMain: text(12),
    badgeBottom: text(20),
    sortOrder: z.number({ error: 'Informe um número.' }).int('Use um número inteiro.').min(0, 'Não pode ser negativo.').max(100_000),
    isActive: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((v, ctx) => {
    const button = (label: string, target: TargetDraft, prefix: 'button' | 'secondaryButton') => {
      if (label) {
        const err = targetError(target);
        if (err) ctx.addIssue({ code: 'custom', path: [`${prefix}Target`], message: err });
      } else if (target.type !== 'none') {
        ctx.addIssue({ code: 'custom', path: [`${prefix}Label`], message: 'Escreva o texto do botão.' });
      }
    };
    button(v.buttonLabel, v.buttonTarget, 'button');
    if (v.secondaryButtonEnabled) button(v.secondaryButtonLabel, v.secondaryButtonTarget, 'secondaryButton');
    if (v.priceOriginalCents && v.priceSaleCents && v.priceOriginalCents <= v.priceSaleCents) {
      ctx.addIssue({ code: 'custom', path: ['priceOriginalCents'], message: 'O preço original deve ser maior que o promocional.' });
    }
    if (v.startsAt && Number.isNaN(new Date(v.startsAt).getTime())) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Data inválida.' });
    if (v.endsAt && Number.isNaN(new Date(v.endsAt).getTime())) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Data inválida.' });
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A data final deve ser posterior à inicial.' });
    }
  });
type FormValues = z.infer<typeof schema>;
type Form = UseFormReturn<FormValues>;

const DEFAULTS: FormValues = {
  kicker: '',
  showKicker: true,
  title: '',
  highlight: '',
  subtitle: '',
  footnote: '',
  priceOriginalCents: null,
  priceSaleCents: null,
  showPrices: true,
  buttonLabel: '',
  buttonTarget: EMPTY_TARGET,
  secondaryButtonEnabled: true,
  secondaryButtonLabel: '',
  secondaryButtonTarget: EMPTY_TARGET,
  imagePath: null,
  imageUrl: null,
  frameDesktop: defaultFrame('split'),
  frameMobile: null,
  imageBg: '',
  mobileImagePath: null,
  mobileImageUrl: null,
  mobileImageBg: '',
  layout: 'split',
  contentAlign: 'left',
  overlay: defaultOverlay('split'),
  icon: '',
  colorFrom: '#2a2a2e',
  colorTo: '#0b0b0c',
  badgeTop: '',
  badgeMain: '',
  badgeBottom: '',
  sortOrder: 0,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

function fromBanner(b: AdminBanner): FormValues {
  return {
    kicker: b.kicker ?? '',
    showKicker: b.showKicker,
    title: b.title,
    highlight: b.highlight ?? '',
    subtitle: b.subtitle ?? '',
    footnote: b.footnote ?? '',
    priceOriginalCents: b.priceOriginalCents,
    priceSaleCents: b.priceSaleCents,
    showPrices: b.showPrices,
    buttonLabel: b.buttonLabel ?? '',
    buttonTarget: draftFromTarget(b.buttonTarget, b.buttonUrl),
    secondaryButtonEnabled: b.secondaryButtonEnabled,
    secondaryButtonLabel: b.secondaryButtonLabel ?? '',
    secondaryButtonTarget: draftFromTarget(b.secondaryButtonTarget, b.secondaryButtonUrl),
    imagePath: b.imagePath,
    imageUrl: b.imageUrl,
    // Banners antigos (sem ajuste salvo) continuam com a foto centralizada, como eram exibidos.
    frameDesktop: b.imageFrame?.desktop ?? CENTER_FRAME,
    frameMobile: b.imageFrame?.mobile ?? null,
    imageBg: b.imageBg ?? '',
    mobileImagePath: b.mobileImagePath,
    mobileImageUrl: b.mobileImageUrl,
    mobileImageBg: b.mobileImageBg ?? '',
    layout: b.layout,
    contentAlign: b.contentAlign,
    overlay: b.overlay,
    icon: b.icon ?? '',
    colorFrom: b.colorFrom,
    colorTo: b.colorTo,
    badgeTop: b.badgeTop ?? '',
    badgeMain: b.badgeMain ?? '',
    badgeBottom: b.badgeBottom ?? '',
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startsAt: toLocalInput(b.startsAt),
    endsAt: toLocalInput(b.endsAt),
  };
}

function toBody(v: FormValues) {
  const primary = targetFromDraft(v.buttonTarget);
  const secondary = targetFromDraft(v.secondaryButtonTarget);
  return {
    kicker: v.kicker || null,
    showKicker: v.showKicker,
    title: v.title,
    highlight: v.highlight || null,
    subtitle: v.subtitle || null,
    footnote: v.footnote || null,
    priceOriginalCents: v.priceOriginalCents,
    priceSaleCents: v.priceSaleCents,
    showPrices: v.showPrices,
    buttonLabel: v.buttonLabel || null,
    buttonTarget: primary.target,
    ...(primary.target ? {} : { buttonUrl: primary.url }),
    secondaryButtonEnabled: v.secondaryButtonEnabled,
    secondaryButtonLabel: v.secondaryButtonLabel || null,
    secondaryButtonTarget: secondary.target,
    ...(secondary.target ? {} : { secondaryButtonUrl: secondary.url }),
    imagePath: v.imagePath,
    imageFrame: { desktop: clampFrame(v.frameDesktop), mobile: v.frameMobile ? clampFrame(v.frameMobile) : null },
    imageBg: v.imageBg || null,
    // Sem foto principal não existe foto de celular (o servidor exige as duas juntas).
    mobileImagePath: v.imagePath ? v.mobileImagePath : null,
    mobileImageBg: v.imagePath && v.mobileImagePath ? v.mobileImageBg || null : null,
    layout: v.layout,
    contentAlign: v.contentAlign,
    overlay: v.overlay,
    icon: v.icon || null,
    colorFrom: v.colorFrom,
    colorTo: v.colorTo,
    badgeTop: v.badgeTop || null,
    badgeMain: v.badgeMain || null,
    badgeBottom: v.badgeBottom || null,
    sortOrder: v.sortOrder,
    isActive: v.isActive,
    startsAt: fromLocalInput(v.startsAt),
    endsAt: fromLocalInput(v.endsAt),
  };
}

/** O que a prévia mostra: mesmas regras da loja (selo/preços ocultos e botão secundário desligado ficam de fora). */
function toSlide(v: FormValues): SlideData {
  const label = (enabled: boolean, l: string) => (enabled && l.trim() ? l.trim() : null);
  return {
    kicker: v.showKicker ? v.kicker.trim() || null : null,
    title: v.title.trim(),
    highlight: v.highlight.trim() || null,
    subtitle: v.subtitle.trim() || null,
    footnote: v.footnote.trim() || null,
    priceOriginalCents: v.showPrices ? v.priceOriginalCents : null,
    priceSaleCents: v.showPrices ? v.priceSaleCents : null,
    imageUrl: v.imageUrl,
    imageFrame: { desktop: v.frameDesktop, mobile: v.frameMobile },
    imageBg: v.imageBg || null,
    mobileImageUrl: v.imageUrl ? v.mobileImageUrl : null,
    mobileImageBg: v.mobileImageBg || null,
    layout: v.layout,
    contentAlign: v.contentAlign,
    overlay: v.overlay,
    icon: v.icon || null,
    colorFrom: v.colorFrom,
    colorTo: v.colorTo,
    buttonLabel: label(true, v.buttonLabel),
    buttonUrl: null,
    secondaryButtonLabel: label(v.secondaryButtonEnabled, v.secondaryButtonLabel),
    secondaryButtonUrl: null,
    badgeTop: v.badgeTop.trim() || null,
    badgeMain: v.badgeMain.trim() || null,
    badgeBottom: v.badgeBottom.trim() || null,
  };
}

const toInt = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Contraste do texto branco sobre a cor (WCAG). */
function contrastWithWhite(hex: string) {
  if (!HEX.test(hex)) return 21;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

/* ------------------------------------------------------------------ */

type TabId = 'content' | 'buttons' | 'image' | 'look' | 'publish';
const TABS: { id: TabId; label: string; fields: (keyof FormValues)[] }[] = [
  { id: 'content', label: 'Conteúdo', fields: ['kicker', 'title', 'highlight', 'subtitle', 'footnote', 'priceOriginalCents', 'priceSaleCents'] },
  { id: 'buttons', label: 'Botões', fields: ['buttonLabel', 'buttonTarget', 'secondaryButtonLabel', 'secondaryButtonTarget'] },
  { id: 'image', label: 'Imagem', fields: ['imagePath', 'mobileImagePath', 'frameDesktop', 'frameMobile'] },
  { id: 'look', label: 'Aparência', fields: ['colorFrom', 'colorTo', 'overlay', 'imageBg', 'mobileImageBg', 'icon', 'badgeTop', 'badgeMain', 'badgeBottom', 'contentAlign'] },
  { id: 'publish', label: 'Publicação', fields: ['isActive', 'sortOrder', 'startsAt', 'endsAt'] },
];
const tabWithError = (errors: FieldErrors<FormValues>) => TABS.find((t) => t.fields.some((f) => errors[f]))?.id;

function Segmented<T extends string>({ label, value, options, onChange, name }: { label: string; name: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value} className="segment">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              <b>{o.label}</b>
              {o.hint && <small>{o.hint}</small>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ColorField({ id, label, name, control, error, hint }: { id: string; label: string; name: 'colorFrom' | 'colorTo' | 'imageBg' | 'mobileImageBg'; control: Control<FormValues>; error?: string; hint?: string }) {
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="color-row">
            <input type="color" aria-label={`${label} (seletor)`} value={HEX.test(field.value) ? field.value : '#000000'} onChange={(e) => field.onChange(e.target.value)} />
            <input id={id} className="input" maxLength={7} placeholder={name === 'imageBg' || name === 'mobileImageBg' ? 'Sem cor' : undefined} aria-invalid={!!error} value={field.value} onChange={(e) => field.onChange(e.target.value.trim())} onBlur={field.onBlur} />
          </div>
        )}
      />
    </FormField>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="editor-block">
      <h3>{title}</h3>
      {hint && <p className="notice">{hint}</p>}
      {children}
    </section>
  );
}

/* ---------------------------- A · Conteúdo ---------------------------- */

function ContentTab({ form, product }: { form: Form; product: AdminProduct | null }) {
  const { register, control, setValue, formState } = form;
  const errors = formState.errors;
  const [original, sale, showKicker] = useWatch({ control, name: ['priceOriginalCents', 'priceSaleCents', 'showKicker'] });
  const off = discountPercent(original, sale);
  const dirty = { shouldDirty: true, shouldValidate: formState.isSubmitted };
  return (
    <>
      <Section title="Selo promocional" hint="Pequena etiqueta acima do título, como “Oferta especial” ou “Lançamento”.">
        <div className="form-cols two">
          <FormField id="kicker" label="Texto do selo" error={errors.kicker?.message}>
            <input id="kicker" className="input" placeholder="Oferta especial" aria-invalid={!!errors.kicker} {...register('kicker')} />
          </FormField>
          <div className="field switch-cell">
            <Controller control={control} name="showKicker" render={({ field }) => <Switch label="Mostrar o selo" checked={field.value} onChange={field.onChange} />} />
            {!showKicker && <span className="hint">Oculto na loja. O texto fica guardado.</span>}
          </div>
        </div>
      </Section>
      <Section title="Título e texto">
        <div className="form-cols two">
          <FormField id="title" label="Título" error={errors.title?.message} hint="Frase curta e direta. Até 80 caracteres.">
            <input id="title" className="input" placeholder="O próximo nível do seu jogo" aria-invalid={!!errors.title} {...register('title')} />
          </FormField>
          <FormField id="highlight" label="Destaque (2ª linha em dourado)" error={errors.highlight?.message} hint="Opcional. Completa o título com destaque.">
            <input id="highlight" className="input" placeholder="começa aqui" aria-invalid={!!errors.highlight} {...register('highlight')} />
          </FormField>
          <FormField id="subtitle" label="Subtítulo" error={errors.subtitle?.message} className="full" hint="Explique o benefício em uma ou duas frases.">
            <textarea
              id="subtitle"
              className="textarea"
              rows={2}
              placeholder="Encontre sua próxima chuteira e escolha o modelo ideal para entrar em campo."
              aria-invalid={!!errors.subtitle}
              {...register('subtitle')}
            />
          </FormField>
        </div>
      </Section>
      <Section title="Preços" hint="Opcional. Informe os dois valores para mostrar “De … por …” e o desconto calculado automaticamente.">
        <div className="form-cols two">
          <FormField id="priceOriginalCents" label="Preço original (De)" error={errors.priceOriginalCents?.message}>
            <Controller
              control={control}
              name="priceOriginalCents"
              render={({ field }) => <MoneyInput id="priceOriginalCents" value={field.value} onChange={field.onChange} invalid={!!errors.priceOriginalCents} />}
            />
          </FormField>
          <FormField id="priceSaleCents" label="Preço promocional (Por)" error={errors.priceSaleCents?.message}>
            <Controller control={control} name="priceSaleCents" render={({ field }) => <MoneyInput id="priceSaleCents" value={field.value} onChange={field.onChange} invalid={!!errors.priceSaleCents} />} />
          </FormField>
        </div>
        <div className="row-actions start" style={{ marginTop: 10, alignItems: 'center' }}>
          <Controller control={control} name="showPrices" render={({ field }) => <Switch label="Mostrar preços no banner" checked={field.value} onChange={field.onChange} />} />
          {product && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setValue('priceOriginalCents', product.onSale ? product.priceCents : null, dirty);
                setValue('priceSaleCents', product.effectivePriceCents, dirty);
              }}
            >
              Usar preços de “{product.name.length > 28 ? `${product.name.slice(0, 28)}…` : product.name}”
            </button>
          )}
        </div>
        <p className="notice" role="status" style={{ marginTop: 8 }}>
          {off
            ? `Desconto exibido: -${off}% (de ${brl(original!)} por ${brl(sale!)}).`
            : original && sale
              ? 'Sem desconto exibido: o preço original precisa ser maior que o promocional.'
              : 'O desconto só aparece quando os dois preços estão preenchidos.'}
        </p>
      </Section>
      <Section title="Texto complementar" hint="Opcional. Aparece em letras menores abaixo dos botões.">
        <FormField id="footnote" label="Texto complementar" error={errors.footnote?.message}>
          <input id="footnote" className="input" placeholder="Confirme o tamanho pelo WhatsApp antes de finalizar." aria-invalid={!!errors.footnote} {...register('footnote')} />
        </FormField>
      </Section>
    </>
  );
}

/* ---------------------------- B · Botões ---------------------------- */

function ButtonsTab({ form, onProduct }: { form: Form; onProduct: (p: AdminProduct | null) => void }) {
  const { register, control, formState } = form;
  const errors = formState.errors;
  const secondaryOn = useWatch({ control, name: 'secondaryButtonEnabled' });
  return (
    <>
      <datalist id="cta-suggestions">
        {CTA_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Section title="Botão principal" hint="O botão em destaque. Deixe o texto em branco para não exibir botão.">
        <FormField id="buttonLabel" label="Texto do botão" error={errors.buttonLabel?.message} hint="Comece digitando para ver sugestões.">
          <input id="buttonLabel" className="input" list="cta-suggestions" placeholder="Quero a minha" aria-invalid={!!errors.buttonLabel} {...register('buttonLabel')} />
        </FormField>
        <Controller
          control={control}
          name="buttonTarget"
          render={({ field }) => <ButtonTargetField id="buttonTarget" value={field.value} onChange={field.onChange} error={errors.buttonTarget?.message} onProduct={onProduct} />}
        />
      </Section>
      <Section title="Botão secundário">
        <Controller control={control} name="secondaryButtonEnabled" render={({ field }) => <Switch label="Mostrar botão secundário" checked={field.value} onChange={field.onChange} />} />
        {secondaryOn ? (
          <div style={{ marginTop: 12 }}>
            <FormField id="secondaryButtonLabel" label="Texto do botão secundário" error={errors.secondaryButtonLabel?.message}>
              <input id="secondaryButtonLabel" className="input" list="cta-suggestions" placeholder="Ver todas as chuteiras" aria-invalid={!!errors.secondaryButtonLabel} {...register('secondaryButtonLabel')} />
            </FormField>
            <Controller
              control={control}
              name="secondaryButtonTarget"
              render={({ field }) => <ButtonTargetField id="secondaryButtonTarget" value={field.value} onChange={field.onChange} error={errors.secondaryButtonTarget?.message} />}
            />
          </div>
        ) : (
          <p className="notice" style={{ marginTop: 8 }}>
            Desligado: o botão não aparece na loja. O texto e o destino ficam guardados para quando você religar.
          </p>
        )}
      </Section>
    </>
  );
}

/* ---------------------------- C · Imagem ---------------------------- */

function ImageTab({ form, device, setDevice }: { form: Form; device: PreviewDevice; setDevice: (d: PreviewDevice) => void }) {
  const { control, setValue, getValues, getFieldState, formState } = form;
  const [imageUrl, layout, frameDesktop, frameMobile, mobileImageUrl] = useWatch({ control, name: ['imageUrl', 'layout', 'frameDesktop', 'frameMobile', 'mobileImageUrl'] });
  const [detecting, setDetecting] = useState(false);
  const dirty = { shouldDirty: true };
  // Com foto exclusiva do celular, o celular sempre tem enquadramento próprio (a foto é outra).
  const ownMobilePhoto = !!mobileImageUrl;
  const current = device === 'mobile' ? (frameMobile ?? (ownMobilePhoto ? defaultFrame(layout) : frameDesktop)) : frameDesktop;
  const mobileSize = mobileImageSize(layout);
  const setFrame = (f: BannerFrame) => {
    const next = clampFrame(f);
    if (device === 'mobile') setValue('frameMobile', next, dirty);
    else setValue('frameDesktop', next, dirty);
  };
  const changeLayout = (next: BannerLayout) => {
    const prev = getValues('layout');
    if (prev === next) return;
    setValue('layout', next, dirty);
    // Ajustes ainda no padrão acompanham o novo formato; ajustes feitos à mão são mantidos.
    const isDefault = (f: BannerFrame | null) => !f || JSON.stringify(f) === JSON.stringify(defaultFrame(prev)) || JSON.stringify(f) === JSON.stringify(CENTER_FRAME);
    if (isDefault(getValues('frameDesktop'))) setValue('frameDesktop', defaultFrame(next), dirty);
    if (getValues('frameMobile') && isDefault(getValues('frameMobile'))) setValue('frameMobile', getValues('mobileImageUrl') ? defaultFrame(next) : null, dirty);
    // Escurecimento ainda não ajustado nesta edição acompanha o formato (foto de produto ao lado do texto não escurece).
    if (!getFieldState('overlay').isDirty || getValues('overlay') === defaultOverlay(prev)) setValue('overlay', defaultOverlay(next), dirty);
  };
  const detect = async (url: string, target: 'imageBg' | 'mobileImageBg' = 'imageBg') => {
    setDetecting(true);
    const color = await sampleEdgeColor(url);
    setDetecting(false);
    if (color) setValue(target, color, dirty);
  };

  return (
    <>
      <Section
        title={mobileImageUrl ? 'Foto para computador' : 'Foto'}
        hint="De preferência uma foto do produto com fundo limpo. JPG, PNG ou WEBP até 5 MB. A foto original não é alterada: os ajustes ficam salvos à parte."
      >
        <ImageUpload
          folder="banners"
          label="Foto do banner"
          url={imageUrl}
          showPreview={false}
          onUploaded={(path, url) => {
            setValue('imagePath', path, dirty);
            setValue('imageUrl', url, dirty);
            setValue('frameDesktop', defaultFrame(getValues('layout')), dirty);
            // O ajuste do celular só é descartado quando ele vinha desta mesma foto.
            if (!getValues('mobileImageUrl')) setValue('frameMobile', null, dirty);
            void detect(url);
          }}
          onRemove={() => {
            setValue('imagePath', null, dirty);
            setValue('imageUrl', null, dirty);
            // A foto do celular é uma alternativa à principal: sai junto.
            setValue('mobileImagePath', null, dirty);
            setValue('mobileImageUrl', null, dirty);
            setValue('frameMobile', null, dirty);
          }}
        />
        {formState.errors.imagePath && (
          <span className="err" role="alert">
            {formState.errors.imagePath.message}
          </span>
        )}
      </Section>

      {imageUrl && (
        <Section
          title="Foto para celular (opcional)"
          hint={`Use quando a foto do computador fica ruim no celular (ex.: foto larga com o produto pequeno). No celular a imagem aparece acima do texto, no formato ${mobileSize.ratio} — recomendado ${mobileSize.size}. Sem foto aqui, o celular usa a foto do computador.`}
        >
          <div className="mobile-photo">
            {mobileImageUrl && <img className="mobile-photo-thumb" src={mobileImageUrl} alt="Foto atual do celular" />}
            <div className="mobile-photo-actions">
              <ImageUpload
                folder="banners"
                label="Foto do banner no celular"
                url={mobileImageUrl}
                showPreview={false}
                onUploaded={(path, url) => {
                  setValue('mobileImagePath', path, dirty);
                  setValue('mobileImageUrl', url, dirty);
                  setValue('frameMobile', defaultFrame(getValues('layout')), dirty);
                  setDevice('mobile');
                  void detect(url, 'mobileImageBg');
                }}
                onRemove={() => {
                  setValue('mobileImagePath', null, dirty);
                  setValue('mobileImageUrl', null, dirty);
                  setValue('mobileImageBg', '', dirty);
                  setValue('frameMobile', null, dirty);
                }}
              />
              <span className="hint">{mobileImageUrl ? 'O celular mostra esta foto; o computador continua com a foto acima.' : 'Nenhuma foto exclusiva: o celular usa a foto do computador.'}</span>
            </div>
          </div>
          {formState.errors.mobileImagePath && (
            <span className="err" role="alert">
              {formState.errors.mobileImagePath.message}
            </span>
          )}
        </Section>
      )}

      <Section title="Formato do banner">
        <Segmented
          label="Como a foto aparece"
          name="layout"
          value={layout}
          onChange={changeLayout}
          options={[
            { value: 'split', label: 'Produto ao lado do texto', hint: 'Ideal para fotos de produto. O texto nunca fica sobre a imagem.' },
            { value: 'full', label: 'Foto de fundo', hint: 'A foto ocupa todo o banner, com escurecimento atrás do texto.' },
          ]}
        />
      </Section>

      {imageUrl ? (
        <Section
          title="Enquadramento"
          hint={
            layout === 'full'
              ? 'Arraste a imagem na prévia para posicionar. Na foto de fundo, deixe o produto do lado oposto ao texto (a área do texto aparece tracejada ao passar o mouse).'
              : 'Arraste a imagem na prévia para posicionar. Os ajustes valem para o dispositivo escolhido.'
          }
        >
          <Segmented
            label="Ajustando para"
            name="frame-device"
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: 'Computador' },
              { value: 'mobile', label: 'Celular' },
            ]}
          />
          {device === 'mobile' && ownMobilePhoto && (
            <p className="notice" style={{ margin: '10px 0' }}>
              Ajustando a <b>foto do celular</b>. O enquadramento do computador não é afetado.
            </p>
          )}
          {device === 'mobile' && !ownMobilePhoto && (
            <div style={{ margin: '10px 0' }}>
              <Switch
                label="Ajuste próprio para o celular"
                checked={!!frameMobile}
                onChange={(on) => setValue('frameMobile', on ? { ...frameDesktop } : null, dirty)}
              />
              <span className="hint" style={{ display: 'block', marginTop: 4 }}>
                {frameMobile ? 'O celular usa um enquadramento separado.' : 'Usando o mesmo ajuste do computador. Arrastar a imagem aqui cria um ajuste só para o celular.'}
              </span>
            </div>
          )}
          <Segmented
            label="Exibição da imagem"
            name="frame-mode"
            value={current.mode}
            onChange={(mode) => setFrame({ ...current, mode })}
            options={[
              { value: 'fit', label: 'Mostrar a imagem inteira', hint: 'Nada é cortado.' },
              { value: 'fill', label: 'Preencher o espaço', hint: 'Sem bordas; pode cortar as laterais.' },
            ]}
          />
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="frame-zoom">Zoom: {Math.round(current.zoom * 100)}%</label>
            <div className="range-row">
              <button type="button" className="btn btn-outline btn-sm btn-icon" aria-label="Diminuir zoom" onClick={() => setFrame({ ...current, zoom: current.zoom - 0.1 })} disabled={current.zoom <= MIN_ZOOM}>
                −
              </button>
              <input
                id="frame-zoom"
                type="range"
                min={MIN_ZOOM * 100}
                max={MAX_ZOOM * 100}
                step={1}
                value={Math.round(current.zoom * 100)}
                onChange={(e) => setFrame({ ...current, zoom: Number(e.target.value) / 100 })}
              />
              <button type="button" className="btn btn-outline btn-sm btn-icon" aria-label="Aumentar zoom" onClick={() => setFrame({ ...current, zoom: current.zoom + 0.1 })} disabled={current.zoom >= MAX_ZOOM}>
                +
              </button>
            </div>
          </div>
          <details className="advanced">
            <summary>Ajuste fino da posição</summary>
            <div className="form-cols two" style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="frame-x">Horizontal: {Math.round(current.x)}%</label>
                <input id="frame-x" type="range" min={0} max={100} value={current.x} onChange={(e) => setFrame({ ...current, x: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="frame-y">Vertical: {Math.round(current.y)}%</label>
                <input id="frame-y" type="range" min={0} max={100} value={current.y} onChange={(e) => setFrame({ ...current, y: Number(e.target.value) })} />
              </div>
            </div>
          </details>
          <div className="row-actions start" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFrame({ ...current, x: 50, y: 50 })}>
              Centralizar
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFrame(defaultFrame(layout))}>
              Restaurar enquadramento
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => (device === 'mobile' && mobileImageUrl ? detect(mobileImageUrl, 'mobileImageBg') : imageUrl && detect(imageUrl))}
              disabled={detecting}
              aria-busy={detecting}
            >
              Detectar cor de fundo da foto
            </button>
          </div>
        </Section>
      ) : (
        <p className="notice editor-block">Sem foto, o banner usa o fundo em degradê e o ícone escolhidos em Aparência.</p>
      )}
    </>
  );
}

/* ---------------------------- D · Aparência ---------------------------- */

function LookTab({ form }: { form: Form }) {
  const { register, control, formState } = form;
  const errors = formState.errors;
  const [imageUrl, layout, colorTo, overlay, contentAlign, mobileImageUrl] = useWatch({ control, name: ['imageUrl', 'layout', 'colorTo', 'overlay', 'contentAlign', 'mobileImageUrl'] });
  const lowContrast = contrastWithWhite(colorTo) < 4.5;
  return (
    <>
      <Section title="Cores">
        <div className="form-cols two">
          <ColorField id="colorFrom" label="Cor de destaque" name="colorFrom" control={control} error={errors.colorFrom?.message} hint="Brilho do degradê de fundo." />
          <ColorField id="colorTo" label="Cor de fundo" name="colorTo" control={control} error={errors.colorTo?.message} hint="Base do banner, atrás do texto." />
          {imageUrl && (
            <ColorField id="imageBg" label={mobileImageUrl ? 'Cor atrás da foto (computador)' : 'Cor atrás da foto'} name="imageBg" control={control} error={errors.imageBg?.message} hint="Preenche as sobras quando a imagem aparece inteira." />
          )}
          {imageUrl && mobileImageUrl && (
            <ColorField id="mobileImageBg" label="Cor atrás da foto (celular)" name="mobileImageBg" control={control} error={errors.mobileImageBg?.message} hint="Detectada automaticamente ao enviar a foto do celular." />
          )}
        </div>
        {lowContrast && (
          <p className="alert alert-warn" role="status" style={{ marginTop: 10 }}>
            A cor de fundo está clara demais para o texto branco. Escolha um tom mais escuro para manter a leitura fácil.
          </p>
        )}
      </Section>
      <Section title="Posição do conteúdo">
        <Controller
          control={control}
          name="contentAlign"
          render={({ field }) => (
            <Segmented
              label="Texto no computador"
              name="contentAlign"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'left', label: 'Texto à esquerda', hint: layout === 'split' ? 'Imagem à direita' : undefined },
                { value: 'right', label: 'Texto à direita', hint: layout === 'split' ? 'Imagem à esquerda' : undefined },
              ]}
            />
          )}
        />
        <p className="notice" style={{ marginTop: 6 }}>
          No celular a imagem fica sempre acima do texto, para o produto não ficar encoberto.
        </p>
      </Section>
      {imageUrl && (
        <Section title="Escurecimento da foto" hint={layout === 'full' ? 'Escurece a foto atrás do texto para manter a leitura.' : 'Normalmente desnecessário com o produto ao lado do texto.'}>
          <div className="field">
            <label htmlFor="overlay">Intensidade: {overlay}%</label>
            <Controller
              control={control}
              name="overlay"
              render={({ field }) => <input id="overlay" type="range" min={0} max={90} step={5} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />}
            />
          </div>
          {layout === 'full' && overlay < 40 && (
            <p className="alert alert-warn" role="status" style={{ marginTop: 8 }}>
              Pouco escurecimento: confira na prévia se o texto {contentAlign === 'left' ? 'à esquerda' : 'à direita'} continua legível sobre a foto.
            </p>
          )}
        </Section>
      )}
      <details className="advanced editor-block">
        <summary>Opções avançadas: ícone e selo redondo (banners sem foto)</summary>
        <div className="form-cols two" style={{ marginTop: 12 }}>
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
        <div className="form-cols three" style={{ marginTop: 12 }}>
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
          O ícone aparece quando o banner não tem foto. O selo redondo aparece sobre o ícone quando o destaque está preenchido.
        </p>
      </details>
    </>
  );
}

/* ---------------------------- F · Publicação ---------------------------- */

function PublishTab({ form }: { form: Form }) {
  const { register, control, formState } = form;
  const errors = formState.errors;
  return (
    <Section title="Publicação" hint="Sem datas, o banner fica no ar enquanto estiver ativo. Fora do período ele sai da página inicial automaticamente.">
      <div style={{ display: 'grid', gap: 12 }}>
        <Controller control={control} name="isActive" render={({ field }) => <Switch label="Ativo (publicado na loja)" checked={field.value} onChange={field.onChange} />} />
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
      </div>
    </Section>
  );
}

/* ---------------------------- E · Prévia ---------------------------- */

function LivePreview({ form, device, setDevice }: { form: Form; device: PreviewDevice; setDevice: (d: PreviewDevice) => void }) {
  const v = useWatch({ control: form.control }) as FormValues;
  const onFrameChange = (f: BannerFrame) => form.setValue(device === 'mobile' ? 'frameMobile' : 'frameDesktop', f, { shouldDirty: true });
  return (
    <section className="adm-card banner-editor-preview" aria-labelledby="preview-title">
      <div className="preview-head">
        <h2 id="preview-title">Pré-visualização</h2>
        <div className="device-toggle" role="group" aria-label="Dispositivo da prévia">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button key={d} type="button" className={device === d ? 'on' : ''} aria-pressed={device === d} onClick={() => setDevice(d)}>
              {d === 'desktop' ? 'Computador' : 'Celular'}
            </button>
          ))}
        </div>
      </div>
      <BannerSlidePreview data={toSlide(v)} device={device} onFrameChange={onFrameChange} />
      <p className="notice" style={{ marginTop: 10 }}>
        É assim que o banner aparece na loja{device === 'desktop' ? ' em uma tela de notebook; telas maiores mostram um pouco mais das laterais da foto de fundo' : ' em um celular'}.
        {v.imageUrl ? ' Arraste a imagem para ajustar o enquadramento.' : ''}
      </p>
    </section>
  );
}

/* ---------------------------- Página ---------------------------- */

export default function BannerFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  useDocumentTitle(isNew ? 'Novo banner' : 'Editar banner');
  const [tab, setTab] = useState<TabId>('content');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const leaving = useRef(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const banners = useQuery({ queryKey: ['admin', 'banners'], queryFn: () => adminApi.get<{ items: AdminBanner[] }>('/banners').then((r) => r.items) });
  const banner = id ? banners.data?.find((b) => b.id === id) : undefined;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const { handleSubmit, formState, reset, setError, setValue, getFieldState } = form;
  const errors = formState.errors;

  // Carrega o banner uma vez: atualizações da lista em segundo plano não apagam o que está sendo editado.
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!banner || loadedId.current === banner.id) return;
    loadedId.current = banner.id;
    reset(fromBanner(banner));
  }, [banner, reset]);

  // Novo banner entra no fim da fila, a menos que a ordem já tenha sido editada.
  const list = banners.data;
  useEffect(() => {
    if (!isNew || !list) return;
    if (getFieldState('sortOrder').isDirty) return;
    setValue('sortOrder', list.reduce((max, b) => Math.max(max, b.sortOrder), 0) + (list.length ? 10 : 0));
  }, [isNew, list, getFieldState, setValue]);

  // Aviso de alterações não salvas: navegação interna (diálogo) e fechar/recarregar a aba (navegador).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => formState.isDirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!formState.isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [formState.isDirty]);

  const save = useAdminMutation((v: FormValues) => (isNew ? adminApi.post<AdminBanner>('/banners', toBody(v)) : adminApi.patch<AdminBanner>(`/banners/${id}`, toBody(v))), {
    success: (b: AdminBanner) =>
      b.state === 'LIVE' ? 'Banner publicado: já aparece na página inicial.' : b.state === 'SCHEDULED' ? 'Banner salvo e agendado.' : 'Banner salvo (fora do ar).',
    invalidate: [['admin', 'banners'], ['banners']],
    onSuccess: () => {
      leaving.current = true;
      navigate('/admin/banners');
    },
  });

  const goToErrors = (errs: FieldErrors<FormValues>) => {
    const t = tabWithError(errs);
    if (t) setTab(t);
  };
  const onSubmit = handleSubmit(
    (v) =>
      save.mutate(v, {
        onError: (err) => {
          if (!(err instanceof ApiError)) return;
          const names = Object.keys(DEFAULTS) as (keyof FormValues)[];
          const failed: (keyof FormValues)[] = [];
          for (const issue of err.fieldIssues) {
            const field = (issue.field.startsWith('imageFrame') ? 'frameDesktop' : issue.field.split('.')[0]) as keyof FormValues;
            if (!names.includes(field)) continue;
            setError(field, { message: issue.message });
            failed.push(field);
          }
          const t = TABS.find((x) => x.fields.some((f) => failed.includes(f)));
          if (t) setTab(t.id);
        },
      }),
    goToErrors,
  );

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length]!;
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

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
  const panels: Record<TabId, ReactNode> = {
    content: <ContentTab form={form} product={product} />,
    buttons: <ButtonsTab form={form} onProduct={setProduct} />,
    image: <ImageTab form={form} device={device} setDevice={setDevice} />,
    look: <LookTab form={form} />,
    publish: <PublishTab form={form} />,
  };

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
        <div className="banner-editor">
          <div className="adm-card banner-editor-form">
            <div className="tabs editor-tabs" role="tablist" aria-label="Seções do banner">
              {TABS.map((t, i) => {
                const hasError = t.fields.some((f) => errors[f]);
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[t.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls={`panel-${t.id}`}
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    onKeyDown={(e) => onTabKey(e, i)}
                  >
                    {t.label}
                    {hasError && (
                      <span className="tab-error" aria-label="(contém erro)">
                        !
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Sem desmontar: os campos das abas ocultas mantêm valores e erros. */}
            {TABS.map((t) => (
              <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={tab !== t.id}>
                {panels[t.id]}
              </div>
            ))}
          </div>
          <LivePreview form={form} device={device} setDevice={setDevice} />
        </div>
        <div className="form-bar">
          <span className={`notice ${formState.isDirty ? 'pending-hint' : ''}`} role="status">
            {formState.isDirty ? 'Há alterações não salvas.' : isNew ? 'Preencha os campos e salve.' : 'Tudo salvo.'}
          </span>
          {formState.isDirty && !isNew && (
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmDiscard(true)}>
              Descartar alterações
            </button>
          )}
          <Link to="/admin/banners" className="btn btn-quiet">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-gold" disabled={save.isPending} aria-busy={save.isPending}>
            {isNew ? 'Criar banner' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      {confirmDiscard && banner && (
        <ConfirmDialog
          title="Descartar alterações?"
          message="O banner volta a ficar como está salvo. As mudanças feitas agora serão perdidas."
          confirmLabel="Descartar"
          danger
          onConfirm={() => {
            reset(fromBanner(banner));
            setConfirmDiscard(false);
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Sair sem salvar?"
          message="As alterações deste banner ainda não foram salvas e serão perdidas."
          confirmLabel="Sair sem salvar"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </>
  );
}
