import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEventHandler, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type FieldValues, type Path, type UseFormRegister, type UseFormSetError } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormField, ImageUpload, PageHeader, Switch, Tag } from '../../components/admin/ui';
import { InfoGlyph } from '../../components/ui/Icons';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { buildOrderMessage, whatsappLink } from '../../lib/whatsapp';
import type { AdminSettings, SettingsInput } from '../../types/admin';
import type { CustomerMessages, InfoIcon, InfoItem, PublicOrder, StoreContent } from '../../types/api';

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

const SETTINGS_KEY = ['admin', 'settings'] as const;

const maxMsg = (n: number) => `Use no máximo ${n} caracteres.`;
/** Texto livre (pode ficar vazio). */
const text = (max: number) => z.string().trim().max(max, maxMsg(max));
/** Texto obrigatório. */
const required = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max, maxMsg(max));
const HTTPS_RE = /^https:\/\/[^\s]+$/;
const INTERNAL_RE = /^\/(?!\/)[^\s]*$/;
const httpsOptional = z
  .string()
  .trim()
  .max(300, maxMsg(300))
  .refine((v) => v === '' || HTTPS_RE.test(v), 'Use uma URL completa começando com https://.');

const digits = (v: string) => v.replace(/\D/g, '');
const orNull = (v: string) => v.trim() || null;
const splitLines = (v: string) =>
  v
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const splitComma = (v: string) =>
  v
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);

/** Lista digitada em texto (uma por linha ou separada por vírgulas) com limites de quantidade e tamanho. */
const listText = (split: (v: string) => string[], maxItems: number, maxLen: number, unit: string) =>
  z.string().superRefine((value, ctx) => {
    const items = split(value);
    if (items.length > maxItems) ctx.addIssue({ code: 'custom', message: `Use no máximo ${maxItems} ${unit}.` });
    const long = items.findIndex((i) => i.length > maxLen);
    if (long >= 0) ctx.addIssue({ code: 'custom', message: `O item ${long + 1} ("${items[long]!.slice(0, 20)}…") passa de ${maxLen} caracteres.` });
  });

/** Aplica os erros de campo devolvidos pela API (ex.: "content.brandBanner.buttonUrl") ao formulário. */
function applyServerIssues<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, map: (field: string) => string = (f) => f) {
  if (!(err instanceof ApiError)) return;
  for (const issue of err.fieldIssues) {
    setError(map(issue.field) as Path<T>, { type: 'server', message: issue.message });
  }
}

function useSaveSettings() {
  const qc = useQueryClient();
  return useAdminMutation((body: SettingsInput) => adminApi.patch<AdminSettings>('/store/settings', body), {
    success: 'Configurações salvas. A loja já exibe as alterações.',
    invalidate: [[...SETTINGS_KEY], ['settings']],
    onSuccess: (saved) => qc.setQueryData([...SETTINGS_KEY], saved),
  });
}

/* ------------------------------------------------------------------ */
/* Estrutura visual                                                    */
/* ------------------------------------------------------------------ */

function SectionForm({ id, title, description, onSubmit, children, dirty, pending, onDiscard }: { id: string; title: string; description?: ReactNode; onSubmit: FormEventHandler<HTMLFormElement>; children: ReactNode; dirty: boolean; pending: boolean; onDiscard: () => void }) {
  return (
    <form className="adm-card" onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {title} {description && <small>{description}</small>}
      </h2>
      <div style={{ display: 'grid', gap: 18 }}>{children}</div>
      <div className="row-actions" style={{ marginTop: 20, alignItems: 'center' }}>
        {dirty && (
          <span className="notice" role="status" style={{ marginRight: 'auto' }}>
            Há alterações não salvas nesta seção.
          </span>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={onDiscard} disabled={!dirty || pending}>
          Descartar
        </button>
        <button type="submit" className="btn btn-gold btn-sm" disabled={pending} aria-busy={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function Group({ legend, hint, children }: { legend: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '12px 14px 14px', margin: 0, minWidth: 0 }}>
      <legend style={{ fontWeight: 700, fontSize: 14, padding: '0 6px' }}>{legend}</legend>
      {hint && (
        <p className="notice" style={{ margin: '0 0 10px' }}>
          {hint}
        </p>
      )}
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </fieldset>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="err" role="alert" style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
      {message}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'loja', label: 'Loja' },
  { id: 'recebimento', label: 'Recebimento' },
  { id: 'redes', label: 'Redes sociais' },
  { id: 'mensagens', label: 'Mensagens do WhatsApp' },
  { id: 'inicio', label: 'Página inicial' },
  { id: 'pedidos', label: 'Pedidos e vitrine' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  useDocumentTitle('Configurações');
  const [params, setParams] = useSearchParams();
  const requested = params.get('secao');
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'loja';
  const settings = useQuery({ queryKey: [...SETTINGS_KEY], queryFn: () => adminApi.get<AdminSettings>('/store/settings') });

  const select = (id: TabId) => {
    const next = new URLSearchParams(params);
    if (id === 'loja') next.delete('secao');
    else next.set('secao', id);
    setParams(next, { replace: true });
  };

  if (settings.isPending) return <LoadingState />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const s = settings.data;

  const panel = (id: TabId, content: ReactNode) => (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}>
      {content}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Configurações"
        description={
          <>
            Dados da loja, WhatsApp e conteúdo da página inicial. Cada seção é salva separadamente. Última alteração: <b>{formatDateTime(s.updatedAt)}</b>
          </>
        }
        actions={
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
            Ver loja ↗
          </a>
        }
      />
      <div className="tabs" role="tablist" aria-label="Seções das configurações" style={{ overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === tab);
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
                select(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }
            }}
            style={{ whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Todas as seções ficam montadas para não perder edições ao trocar de aba. */}
      {panel('loja', <StoreSection settings={s} />)}
      {panel('recebimento', <FulfillmentSection settings={s} />)}
      {panel('redes', <SocialSection settings={s} />)}
      {panel(
        'mensagens',
        <div style={{ display: 'grid', gap: 16 }}>
          <MessagesSection settings={s} />
          <CustomerMessagesSection settings={s} />
        </div>,
      )}
      {panel('inicio', <HomeContentSection settings={s} />)}
      {panel('pedidos', <OperationSection settings={s} />)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Loja                                                                */
/* ------------------------------------------------------------------ */

const storeSchema = z.object({
  storeName: required(2, 80, 'Informe o nome da loja (mínimo 2 caracteres).'),
  logoPath: z.string().nullable(),
  logoUrl: z.string().nullable(),
  whatsappNumber: z.string().refine((v) => /^[0-9]{12,13}$/.test(digits(v)), 'Informe o número com DDI e DDD, somente números. Ex.: 5549998090818.'),
  phoneDisplay: text(30),
  email: z
    .string()
    .trim()
    .max(254, maxMsg(254))
    .refine((v) => v === '' || z.email().safeParse(v).success, 'E-mail inválido.'),
  address: text(200),
  city: text(100),
  openingHours: text(300),
});
type StoreValues = z.infer<typeof storeSchema>;

const toStoreValues = (s: AdminSettings): StoreValues => ({
  storeName: s.storeName,
  logoPath: s.logoPath,
  logoUrl: s.logoUrl,
  whatsappNumber: s.whatsappNumber,
  phoneDisplay: s.phoneDisplay ?? '',
  email: s.email ?? '',
  address: s.address ?? '',
  city: s.city ?? '',
  openingHours: s.openingHours ?? '',
});

function StoreSection({ settings }: { settings: AdminSettings }) {
  const { register, control, handleSubmit, formState, reset, setError, setValue } = useForm<StoreValues>({ resolver: zodResolver(storeSchema), defaultValues: toStoreValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toStoreValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();
  const logoUrl = useWatch({ control, name: 'logoUrl' });
  const whatsapp = digits(useWatch({ control, name: 'whatsappNumber' }) ?? '');

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      {
        storeName: v.storeName,
        logoPath: v.logoPath,
        whatsappNumber: digits(v.whatsappNumber),
        phoneDisplay: orNull(v.phoneDisplay),
        email: orNull(v.email),
        address: orNull(v.address),
        city: orNull(v.city),
        openingHours: orNull(v.openingHours),
      },
      { onSuccess: (s) => reset(toStoreValues(s)), onError: (err) => applyServerIssues(err, setError) },
    ),
  );

  return (
    <SectionForm id="sec-loja" title="Loja" description="Nome, logotipo e contatos exibidos no site." onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      <div className="form-cols two">
        <FormField id="storeName" label="Nome da loja" error={errors.storeName?.message} className="full">
          <input id="storeName" className="input" aria-invalid={!!errors.storeName} {...register('storeName')} />
        </FormField>
        <div className="field full">
          <span className="label">Logotipo</span>
          <ImageUpload
            folder="store"
            variant="logo"
            label="Logotipo"
            url={logoUrl}
            onUploaded={(path, url) => {
              setValue('logoPath', path, { shouldDirty: true });
              setValue('logoUrl', url, { shouldDirty: true });
            }}
            onRemove={() => {
              setValue('logoPath', null, { shouldDirty: true });
              setValue('logoUrl', null, { shouldDirty: true });
            }}
          />
          <span className="hint">Sem imagem enviada, o site usa o logotipo padrão do Podium Sports. A troca só vale depois de salvar.</span>
          <FieldError message={errors.logoPath?.message} />
        </div>
        <div className="field">
          <label htmlFor="whatsappNumber">Número do WhatsApp</label>
          <input id="whatsappNumber" className="input" inputMode="numeric" autoComplete="off" placeholder="5549998090818" aria-invalid={!!errors.whatsappNumber} aria-describedby="whatsappNumber-hint" {...register('whatsappNumber')} />
          <span className="hint" id="whatsappNumber-hint">
            Somente números, com DDI (55) e DDD. Ex.: 5549998090818. Recebe os pedidos e as mensagens do site.{' '}
            {/^[0-9]{12,13}$/.test(whatsapp) && (
              <a href={whatsappLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="link-btn">
                Testar link ↗
              </a>
            )}
          </span>
          <FieldError message={errors.whatsappNumber?.message} />
        </div>
        <FormField id="phoneDisplay" label="Telefone exibido (opcional)" error={errors.phoneDisplay?.message} hint="Como aparece no rodapé, ex.: (49) 99809-0818.">
          <input id="phoneDisplay" className="input" aria-invalid={!!errors.phoneDisplay} {...register('phoneDisplay')} />
        </FormField>
        <FormField id="email" label="E-mail (opcional)" error={errors.email?.message}>
          <input id="email" type="email" className="input" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField id="city" label="Cidade (opcional)" error={errors.city?.message} hint="Ex.: Videira, SC.">
          <input id="city" className="input" aria-invalid={!!errors.city} {...register('city')} />
        </FormField>
        <FormField id="address" label="Endereço (opcional)" error={errors.address?.message} className="full">
          <input id="address" className="input" aria-invalid={!!errors.address} {...register('address')} />
        </FormField>
        <FormField id="openingHours" label="Horário de atendimento (opcional)" error={errors.openingHours?.message} className="full" hint="Exibido no rodapé, ex.: Seg a sex, 9h às 19h · Sáb, 9h às 13h.">
          <textarea id="openingHours" className="textarea" rows={2} aria-invalid={!!errors.openingHours} {...register('openingHours')} />
        </FormField>
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Recebimento                                                         */
/* ------------------------------------------------------------------ */

const fulfillmentSchema = z
  .object({
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    pickupInfo: text(300),
    deliveryInfo: text(300),
  })
  .refine((v) => v.pickupEnabled || v.deliveryEnabled, {
    message: 'Mantenha ao menos uma forma de recebimento (retirada ou entrega).',
    path: ['pickupEnabled'],
  });
type FulfillmentValues = z.infer<typeof fulfillmentSchema>;

const toFulfillmentValues = (s: AdminSettings): FulfillmentValues => ({
  pickupEnabled: s.pickupEnabled,
  deliveryEnabled: s.deliveryEnabled,
  pickupInfo: s.pickupInfo ?? '',
  deliveryInfo: s.deliveryInfo ?? '',
});

function FulfillmentSection({ settings }: { settings: AdminSettings }) {
  const { register, control, handleSubmit, formState, reset, setError } = useForm<FulfillmentValues>({ resolver: zodResolver(fulfillmentSchema), defaultValues: toFulfillmentValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toFulfillmentValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      { pickupEnabled: v.pickupEnabled, deliveryEnabled: v.deliveryEnabled, pickupInfo: orNull(v.pickupInfo), deliveryInfo: orNull(v.deliveryInfo) },
      { onSuccess: (s) => reset(toFulfillmentValues(s)), onError: (err) => applyServerIssues(err, setError) },
    ),
  );

  return (
    <SectionForm id="sec-recebimento" title="Recebimento" description="Opções oferecidas ao cliente no checkout." onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      <Group legend="Formas de recebimento" hint="Ao menos uma precisa ficar ativa. A taxa de entrega é combinada pelo WhatsApp.">
        <Controller control={control} name="pickupEnabled" render={({ field }) => <Switch label="Retirada na loja" checked={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="deliveryEnabled" render={({ field }) => <Switch label="Entrega" checked={field.value} onChange={field.onChange} />} />
        <FieldError message={errors.pickupEnabled?.message} />
      </Group>
      <div className="form-cols two">
        <FormField id="pickupInfo" label="Informações da retirada (opcional)" error={errors.pickupInfo?.message} hint="Mostrado no checkout quando o cliente escolhe retirar.">
          <textarea id="pickupInfo" className="textarea" rows={3} aria-invalid={!!errors.pickupInfo} {...register('pickupInfo')} />
        </FormField>
        <FormField id="deliveryInfo" label="Informações da entrega (opcional)" error={errors.deliveryInfo?.message} hint="Área atendida, prazos, taxa…">
          <textarea id="deliveryInfo" className="textarea" rows={3} aria-invalid={!!errors.deliveryInfo} {...register('deliveryInfo')} />
        </FormField>
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Redes sociais                                                       */
/* ------------------------------------------------------------------ */

const socialSchema = z.object({ instagramUrl: httpsOptional, facebookUrl: httpsOptional, tiktokUrl: httpsOptional });
type SocialValues = z.infer<typeof socialSchema>;
const toSocialValues = (s: AdminSettings): SocialValues => ({ instagramUrl: s.instagramUrl ?? '', facebookUrl: s.facebookUrl ?? '', tiktokUrl: s.tiktokUrl ?? '' });

function SocialSection({ settings }: { settings: AdminSettings }) {
  const { register, handleSubmit, formState, reset, setError } = useForm<SocialValues>({ resolver: zodResolver(socialSchema), defaultValues: toSocialValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toSocialValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      { instagramUrl: orNull(v.instagramUrl), facebookUrl: orNull(v.facebookUrl), tiktokUrl: orNull(v.tiktokUrl) },
      { onSuccess: (s) => reset(toSocialValues(s)), onError: (err) => applyServerIssues(err, setError) },
    ),
  );

  const fields = [
    { name: 'instagramUrl', label: 'Instagram', placeholder: 'https://instagram.com/podiumsports' },
    { name: 'facebookUrl', label: 'Facebook', placeholder: 'https://facebook.com/podiumsports' },
    { name: 'tiktokUrl', label: 'TikTok', placeholder: 'https://tiktok.com/@podiumsports' },
  ] as const;

  return (
    <SectionForm id="sec-redes" title="Redes sociais" description="Links exibidos no rodapé. Deixe em branco para ocultar." onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      <div className="form-cols three">
        {fields.map((f) => (
          <FormField key={f.name} id={f.name} label={`${f.label} (opcional)`} error={errors[f.name]?.message} hint="Somente endereços https://.">
            <input id={f.name} type="url" inputMode="url" className="input" placeholder={f.placeholder} aria-invalid={!!errors[f.name]} {...register(f.name)} />
          </FormField>
        ))}
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Mensagens do WhatsApp                                               */
/* ------------------------------------------------------------------ */

const messagesSchema = z.object({
  whatsappGreeting: required(2, 300, 'Escreva a saudação (mínimo 2 caracteres).'),
  orderMessageIntro: required(2, 300, 'Escreva a abertura da mensagem (mínimo 2 caracteres).'),
  orderMessageFooter: text(300),
});
type MessagesValues = z.infer<typeof messagesSchema>;
const toMessagesValues = (s: AdminSettings): MessagesValues => ({
  whatsappGreeting: s.whatsappGreeting,
  orderMessageIntro: s.orderMessageIntro,
  orderMessageFooter: s.orderMessageFooter ?? '',
});

/** Pedido fictício usado somente para pré-visualizar a mensagem. */
const SAMPLE_ORDER: PublicOrder = {
  code: 'PS-EXEMPLO',
  status: 'PENDING',
  statusLabel: 'Aguardando confirmação da loja',
  paymentStatus: 'UNPAID',
  createdAt: '2026-01-01T12:00:00.000Z',
  customerName: 'Cliente Exemplo',
  fulfillment: 'PICKUP',
  address: null,
  notes: 'Tamanho 41, por favor.',
  items: [
    { productName: 'Chuteira Futsal (exemplo)', quantity: 1, unitPriceCents: 29990, originalUnitPriceCents: 29990, subtotalCents: 29990 },
    { productName: 'Whey Protein 900 g (exemplo)', quantity: 2, unitPriceCents: 12990, originalUnitPriceCents: 12990, subtotalCents: 25980 },
  ],
  subtotalCents: 55970,
  discountCents: 0,
  totalCents: 55970,
  whatsappOpenedAt: null,
};

function MessagesSection({ settings }: { settings: AdminSettings }) {
  const { register, control, handleSubmit, formState, reset, setError } = useForm<MessagesValues>({ resolver: zodResolver(messagesSchema), defaultValues: toMessagesValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toMessagesValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();
  const greeting = useWatch({ control, name: 'whatsappGreeting' }) ?? '';
  const intro = useWatch({ control, name: 'orderMessageIntro' }) ?? '';
  const footer = useWatch({ control, name: 'orderMessageFooter' }) ?? '';
  const preview = buildOrderMessage(SAMPLE_ORDER, { orderMessageIntro: intro.trim() || '(abertura da mensagem)', orderMessageFooter: footer.trim() || null }, '5549999990000');

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      { whatsappGreeting: v.whatsappGreeting, orderMessageIntro: v.orderMessageIntro, orderMessageFooter: orNull(v.orderMessageFooter) },
      { onSuccess: (s) => reset(toMessagesValues(s)), onError: (err) => applyServerIssues(err, setError) },
    ),
  );

  return (
    <SectionForm id="sec-mensagens" title="Mensagens do WhatsApp" description="Textos pré-preenchidos quando o cliente abre a conversa." onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      <div className="adm-grid cols-2">
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="field">
            <label htmlFor="whatsappGreeting">Saudação</label>
            <textarea id="whatsappGreeting" className="textarea" rows={2} aria-invalid={!!errors.whatsappGreeting} aria-describedby="whatsappGreeting-hint" {...register('whatsappGreeting')} />
            <span className="hint" id="whatsappGreeting-hint">
              Usada no botão flutuante do WhatsApp e na chamada "Falar no WhatsApp".{' '}
              {greeting.trim().length >= 2 && (
                <a href={whatsappLink(settings.whatsappNumber, greeting.trim())} target="_blank" rel="noopener noreferrer" className="link-btn">
                  Testar ↗
                </a>
              )}
            </span>
            <FieldError message={errors.whatsappGreeting?.message} />
          </div>
          <FormField id="orderMessageIntro" label="Abertura da mensagem do pedido" error={errors.orderMessageIntro?.message} hint="Primeira linha da mensagem enviada com o pedido.">
            <textarea id="orderMessageIntro" className="textarea" rows={2} aria-invalid={!!errors.orderMessageIntro} {...register('orderMessageIntro')} />
          </FormField>
          <FormField id="orderMessageFooter" label="Encerramento (opcional)" error={errors.orderMessageFooter?.message} hint="Última linha da mensagem, ex.: um agradecimento ou aviso de prazo.">
            <textarea id="orderMessageFooter" className="textarea" rows={2} aria-invalid={!!errors.orderMessageFooter} {...register('orderMessageFooter')} />
          </FormField>
        </div>
        <div>
          <p className="label" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
            Prévia da mensagem do pedido <Tag tone="gold">Exemplo</Tag>
          </p>
          <pre className="json" style={{ maxHeight: 380 }} aria-label="Prévia da mensagem do pedido (exemplo fictício)">
            {preview}
          </pre>
          <p className="notice">Pedido fictício, apenas para visualizar. Os itens e valores reais vêm sempre do pedido registrado no servidor. No WhatsApp, *asteriscos* viram negrito.</p>
        </div>
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Mensagens de atualização ao cliente                                 */
/* ------------------------------------------------------------------ */

const CUSTOMER_MESSAGE_FIELDS: { key: keyof CustomerMessages; label: string; hint: string }[] = [
  { key: 'accepted', label: 'Pedido aceito', hint: 'Sugerida ao aceitar o pedido.' },
  { key: 'processing', label: 'Em separação', hint: 'Sugerida ao iniciar a separação.' },
  { key: 'readyPickup', label: 'Pronto para retirada', hint: 'Somente pedidos de retirada na loja.' },
  { key: 'readyDelivery', label: 'Pronto para envio', hint: 'Somente pedidos com entrega.' },
  { key: 'outForDelivery', label: 'Saiu para entrega', hint: 'Somente pedidos com entrega.' },
  { key: 'completed', label: 'Pedido concluído', hint: 'Sugerida ao concluir.' },
  { key: 'cancelled', label: 'Pedido cancelado', hint: 'Não prometa reembolso ou prazo que ainda não foi combinado.' },
];
const customerMessageText = required(5, 500, 'Escreva a mensagem (5 a 500 caracteres).');
const customerMessagesSchema = z.object(Object.fromEntries(CUSTOMER_MESSAGE_FIELDS.map((f) => [f.key, customerMessageText])) as Record<keyof CustomerMessages, typeof customerMessageText>);
const fillSample = (template: string, storeName: string) => template.replaceAll('{nome}', 'Maria').replaceAll('{pedido}', 'PS-EXEMPLO').replaceAll('{loja}', storeName);

/** Textos padrão (os mesmos de backend/src/modules/settings/settings.schemas.ts), para "Restaurar texto padrão". */
const DEFAULT_CUSTOMER_MESSAGES: CustomerMessages = {
  accepted: 'Olá, {nome}! Seu pedido {pedido} foi aceito e já estamos separando tudo. Obrigado pela preferência!',
  processing: 'Olá, {nome}! Seu pedido {pedido} está em separação. Avisaremos assim que estiver pronto.',
  readyPickup: 'Olá, {nome}! Seu pedido {pedido} está pronto para retirada. Aguardamos você na loja!',
  readyDelivery: 'Olá, {nome}! Seu pedido {pedido} está pronto e logo sairá para entrega.',
  outForDelivery: 'Olá, {nome}! Seu pedido {pedido} saiu para entrega. Em breve ele chegará até você.',
  completed: 'Olá, {nome}! Seu pedido {pedido} foi concluído. Obrigado pela preferência!',
  cancelled: 'Olá, {nome}. Houve um cancelamento no pedido {pedido}. Entre em contato conosco caso precise de ajuda.',
};
const MESSAGE_TOKENS = [
  { token: '{nome}', hint: 'primeiro nome' },
  { token: '{pedido}', hint: 'código' },
  { token: '{loja}', hint: 'nome da loja' },
];

/** Uma mensagem por vez: lista à esquerda, editor com prévia em balão do WhatsApp à direita. */
function CustomerMessagesSection({ settings }: { settings: AdminSettings }) {
  const initial = settings.content.customerMessages;
  const [selected, setSelected] = useState<keyof CustomerMessages>('accepted');
  const { register, control, handleSubmit, formState, reset, setError, setValue } = useForm<CustomerMessages>({
    resolver: zodResolver(customerMessagesSchema),
    defaultValues: initial,
  });
  const errors = formState.errors;
  useEffect(() => {
    if (initial) reset(initial, { keepDirtyValues: true });
  }, [initial, reset]);
  const save = useSaveSettings();
  const values = useWatch({ control });

  const onSubmit = handleSubmit(
    (v) =>
      save.mutate(
        { content: { ...settings.content, customerMessages: v } },
        {
          onSuccess: (saved) => saved.content.customerMessages && reset(saved.content.customerMessages),
          onError: (err) => applyServerIssues(err, setError, (f) => f.replace(/^content\.customerMessages\.?/, '')),
        },
      ),
    // Erro numa mensagem que não está aberta: abre a primeira com problema.
    (errs) => {
      const first = CUSTOMER_MESSAGE_FIELDS.find((f) => errs[f.key]);
      if (first) setSelected(first.key);
    },
  );

  if (!initial) return null;
  const meta = CUSTOMER_MESSAGE_FIELDS.find((f) => f.key === selected)!;
  const current = values[selected] ?? '';
  const textareaId = `cm-${selected}`;
  const field = register(selected);

  const insertToken = (token: string) => {
    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const glue = before && !/\s$/.test(before) ? ' ' : '';
    const next = `${before}${glue}${token}${current.slice(end)}`;
    setValue(selected, next, { shouldDirty: true, shouldValidate: !!errors[selected] });
    const caret = start + glue.length + token.length;
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    }, 0);
  };

  return (
    <SectionForm
      id="sec-avisos"
      title="Avisos de andamento ao cliente"
      description="Sugeridos no pedido a cada mudança de status. A loja revisa e envia pelo WhatsApp — nada é enviado sozinho."
      onSubmit={onSubmit}
      dirty={formState.isDirty}
      pending={save.isPending}
      onDiscard={() => reset()}
    >
      <div className="msg-editor">
        <ul className="msg-list" aria-label="Mensagens por etapa">
          {CUSTOMER_MESSAGE_FIELDS.map((f) => {
            const text = values[f.key] ?? '';
            const edited = text !== DEFAULT_CUSTOMER_MESSAGES[f.key];
            return (
              <li key={f.key}>
                <button type="button" className={`msg-item ${f.key === selected ? 'on' : ''}`} aria-pressed={f.key === selected} onClick={() => setSelected(f.key)}>
                  <span className="msg-item-head">
                    <b>{f.label}</b>
                    {errors[f.key] ? <Tag tone="danger">Corrigir</Tag> : edited ? <Tag tone="gold">Editada</Tag> : null}
                  </span>
                  <small>{fillSample(text, settings.storeName)}</small>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="msg-edit">
          <div className="field">
            <label htmlFor={textareaId}>{meta.label}</label>
            <textarea
              key={selected}
              id={textareaId}
              className="textarea"
              rows={5}
              maxLength={500}
              aria-invalid={!!errors[selected]}
              aria-describedby={`${textareaId}-hint`}
              {...field}
            />
            <span className="hint msg-count" id={`${textareaId}-hint`}>
              <span>{meta.hint}</span>
              <span className="mono">{current.length}/500</span>
            </span>
            <FieldError message={errors[selected]?.message} />
          </div>
          <div className="msg-tools">
            <span className="hint">Inserir:</span>
            {MESSAGE_TOKENS.map((t) => (
              <button key={t.token} type="button" className="token-chip" onClick={() => insertToken(t.token)} title={`Inserir ${t.token} (${t.hint})`}>
                <code>{t.token}</code> {t.hint}
              </button>
            ))}
            <button
              type="button"
              className="link-btn msg-restore"
              onClick={() => setValue(selected, DEFAULT_CUSTOMER_MESSAGES[selected], { shouldDirty: true, shouldValidate: true })}
              disabled={current === DEFAULT_CUSTOMER_MESSAGES[selected]}
            >
              Restaurar texto padrão
            </button>
          </div>
          <div className="wa-preview" aria-label="Prévia da mensagem (exemplo)">
            <span className="mono-label">Prévia · como o cliente recebe</span>
            <p className="msg-preview">{fillSample(current, settings.storeName) || '…'}</p>
            <span className="hint">Exemplo com o cliente “Maria” e o pedido “PS-EXEMPLO”.</span>
          </div>
        </div>
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Página inicial (content)                                            */
/* ------------------------------------------------------------------ */

const INFO_ICONS = ['whatsapp', 'truck', 'card', 'shield', 'medal', 'trophy', 'clock', 'diamond'] as const satisfies readonly InfoIcon[];
const ICON_LABEL: Record<InfoIcon, string> = {
  whatsapp: 'WhatsApp',
  truck: 'Caminhão (entrega)',
  card: 'Cartão',
  shield: 'Escudo (garantia)',
  medal: 'Medalha',
  trophy: 'Troféu',
  clock: 'Relógio',
  diamond: 'Diamante',
};

const infoItemSchema = z.object({
  icon: z.enum(INFO_ICONS),
  title: required(1, 40, 'Informe o título.'),
  text: text(60),
});

const contentFormSchema = z.object({
  topbarText: listText(splitLines, 4, 120, 'mensagens (uma por linha)'),
  home: z.object({
    featuredTitle: text(40),
    showCategories: z.boolean(),
    showOnSale: z.boolean(),
    showNewArrivals: z.boolean(),
    showCatalog: z.boolean(),
  }),
  brandBanner: z.object({
    enabled: z.boolean(),
    kicker: text(60),
    title: text(60),
    highlight: text(60),
    text: text(200),
    buttonLabel: text(40),
    buttonUrl: z
      .string()
      .trim()
      .max(300, maxMsg(300))
      .refine((v) => INTERNAL_RE.test(v) || HTTPS_RE.test(v), 'Use um caminho interno começando com "/" (ex.: /produtos?categoria=chuteiras) ou uma URL https://.'),
    brandsText: listText(splitComma, 12, 20, 'marcas'),
  }),
  cta: z.object({
    enabled: z.boolean(),
    title: text(60),
    text: text(200),
    buttonLabel: text(40),
  }),
  benefits: z.array(infoItemSchema).max(4, 'Use no máximo 4 itens.'),
  trustItems: z.array(infoItemSchema).max(4, 'Use no máximo 4 itens.'),
  footerAbout: text(300),
  serviceNotesText: listText(splitLines, 6, 120, 'avisos (um por linha)'),
  cartNote: text(160),
});
type ContentValues = z.infer<typeof contentFormSchema>;

const toContentValues = (s: AdminSettings): ContentValues => {
  const c = s.content;
  return {
    topbarText: c.topbarMessages.join('\n'),
    home: { ...c.home },
    brandBanner: {
      enabled: c.brandBanner.enabled,
      kicker: c.brandBanner.kicker,
      title: c.brandBanner.title,
      highlight: c.brandBanner.highlight,
      text: c.brandBanner.text,
      buttonLabel: c.brandBanner.buttonLabel,
      buttonUrl: c.brandBanner.buttonUrl,
      brandsText: c.brandBanner.brands.join(', '),
    },
    cta: { ...c.cta },
    benefits: c.benefits.map((b) => ({ ...b })),
    trustItems: c.trustItems.map((b) => ({ ...b })),
    footerAbout: c.footerAbout,
    serviceNotesText: c.serviceNotes.join('\n'),
    cartNote: c.cartNote,
  };
};

const toContent = (v: ContentValues): Omit<StoreContent, 'podium'> => ({
  topbarMessages: splitLines(v.topbarText),
  benefits: v.benefits,
  trustItems: v.trustItems,
  brandBanner: {
    enabled: v.brandBanner.enabled,
    kicker: v.brandBanner.kicker,
    title: v.brandBanner.title,
    highlight: v.brandBanner.highlight,
    text: v.brandBanner.text,
    buttonLabel: v.brandBanner.buttonLabel,
    buttonUrl: v.brandBanner.buttonUrl,
    brands: splitComma(v.brandBanner.brandsText),
  },
  cta: v.cta,
  home: v.home,
  footerAbout: v.footerAbout,
  serviceNotes: splitLines(v.serviceNotesText),
  cartNote: v.cartNote,
});

/** "content.topbarMessages.2" → "topbarText" etc. */
function mapContentField(field: string) {
  const f = field.replace(/^content\.?/, '');
  if (f.startsWith('topbarMessages')) return 'topbarText';
  if (f.startsWith('serviceNotes')) return 'serviceNotesText';
  if (f.startsWith('brandBanner.brands')) return 'brandBanner.brandsText';
  return f || 'root.server';
}

function HomeContentSection({ settings }: { settings: AdminSettings }) {
  const { register, control, handleSubmit, formState, reset, setError } = useForm<ContentValues>({ resolver: zodResolver(contentFormSchema), defaultValues: toContentValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toContentValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();

  const onSubmit = handleSubmit((v) =>
    save.mutate({ content: { ...toContent(v), podium: settings.content.podium, customerMessages: settings.content.customerMessages } }, { onSuccess: (s) => reset(toContentValues(s)), onError: (err) => applyServerIssues(err, setError, mapContentField) }),
  );

  const homeSwitches = [
    { name: 'home.showCategories', label: 'Mostrar "Compre por categoria"' },
    { name: 'home.showOnSale', label: 'Mostrar "Ofertas"' },
    { name: 'home.showNewArrivals', label: 'Mostrar "Novidades"' },
    { name: 'home.showCatalog', label: 'Mostrar catálogo por categoria' },
  ] as const;

  return (
    <SectionForm id="sec-inicio" title="Página inicial" description="Textos e seções da vitrine. Os banners do topo são gerenciados em Banners." onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      {errors.root?.server?.message && (
        <p className="alert alert-error" role="alert">
          {errors.root.server.message}
        </p>
      )}
      <Group legend="Barra superior">
        <FormField id="topbarText" label="Mensagens da barra (uma por linha, até 4)" error={errors.topbarText?.message} hint="Trechos entre **asteriscos duplos** aparecem em dourado. Ex.: **PEDIDO PELO WHATSAPP** · rápido e fácil">
          <textarea id="topbarText" className="textarea" rows={4} aria-invalid={!!errors.topbarText} {...register('topbarText')} />
        </FormField>
      </Group>

      <Group
        legend="Seções da página inicial"
        hint={
          <>
            Os produtos, a ordem e os textos do pódio de destaques ficam em{' '}
            <Link to="/admin/podium" className="link-btn">
              Pódio
            </Link>
            .
          </>
        }
      >
        <div className="form-cols two">
          {homeSwitches.map((s) => (
            <Controller key={s.name} control={control} name={s.name} render={({ field }) => <Switch label={s.label} checked={field.value} onChange={field.onChange} />} />
          ))}
        </div>
      </Group>

      <Group legend="Faixa de marcas" hint="Faixa escura exibida logo após os destaques.">
        <Controller control={control} name="brandBanner.enabled" render={({ field }) => <Switch label="Exibir faixa de marcas" checked={field.value} onChange={field.onChange} />} />
        <div className="form-cols three">
          <FormField id="bb-kicker" label="Chamada (acima do título)" error={errors.brandBanner?.kicker?.message}>
            <input id="bb-kicker" className="input" aria-invalid={!!errors.brandBanner?.kicker} {...register('brandBanner.kicker')} />
          </FormField>
          <FormField id="bb-title" label="Título" error={errors.brandBanner?.title?.message}>
            <input id="bb-title" className="input" aria-invalid={!!errors.brandBanner?.title} {...register('brandBanner.title')} />
          </FormField>
          <FormField id="bb-highlight" label="Destaque (em dourado)" error={errors.brandBanner?.highlight?.message}>
            <input id="bb-highlight" className="input" aria-invalid={!!errors.brandBanner?.highlight} {...register('brandBanner.highlight')} />
          </FormField>
          <FormField id="bb-text" label="Texto" error={errors.brandBanner?.text?.message} className="full">
            <textarea id="bb-text" className="textarea" rows={2} aria-invalid={!!errors.brandBanner?.text} {...register('brandBanner.text')} />
          </FormField>
          <FormField id="bb-buttonLabel" label="Texto do botão" error={errors.brandBanner?.buttonLabel?.message}>
            <input id="bb-buttonLabel" className="input" aria-invalid={!!errors.brandBanner?.buttonLabel} {...register('brandBanner.buttonLabel')} />
          </FormField>
          <FormField id="bb-buttonUrl" label="Link do botão" error={errors.brandBanner?.buttonUrl?.message} className="full" hint='Caminho interno (ex.: /produtos?categoria=chuteiras) ou URL https://.'>
            <input id="bb-buttonUrl" className="input" aria-invalid={!!errors.brandBanner?.buttonUrl} {...register('brandBanner.buttonUrl')} />
          </FormField>
          <FormField id="bb-brands" label="Marcas (separadas por vírgula, até 12)" error={errors.brandBanner?.brandsText?.message} className="full" hint="Ex.: Nike, Adidas, Umbro. Cada marca com até 20 caracteres.">
            <input id="bb-brands" className="input" aria-invalid={!!errors.brandBanner?.brandsText} {...register('brandBanner.brandsText')} />
          </FormField>
        </div>
      </Group>

      <Group legend="Chamada para o WhatsApp" hint="Bloco no fim da página com o botão que abre a conversa usando a saudação configurada.">
        <Controller control={control} name="cta.enabled" render={({ field }) => <Switch label="Exibir chamada" checked={field.value} onChange={field.onChange} />} />
        <div className="form-cols two">
          <FormField id="cta-title" label="Título" error={errors.cta?.title?.message}>
            <input id="cta-title" className="input" aria-invalid={!!errors.cta?.title} {...register('cta.title')} />
          </FormField>
          <FormField id="cta-buttonLabel" label="Texto do botão" error={errors.cta?.buttonLabel?.message}>
            <input id="cta-buttonLabel" className="input" aria-invalid={!!errors.cta?.buttonLabel} {...register('cta.buttonLabel')} />
          </FormField>
          <FormField id="cta-text" label="Texto" error={errors.cta?.text?.message} className="full">
            <textarea id="cta-text" className="textarea" rows={2} aria-invalid={!!errors.cta?.text} {...register('cta.text')} />
          </FormField>
        </div>
      </Group>

      <InfoItemsEditor name="benefits" legend="Vantagens (faixa abaixo do banner)" control={control} register={register} errors={errors} />
      <InfoItemsEditor name="trustItems" legend="Por que comprar com a gente (faixa no fim da página)" control={control} register={register} errors={errors} />

      <Group legend="Rodapé e sacola">
        <FormField id="footerAbout" label="Sobre a loja (rodapé)" error={errors.footerAbout?.message}>
          <textarea id="footerAbout" className="textarea" rows={3} aria-invalid={!!errors.footerAbout} {...register('footerAbout')} />
        </FormField>
        <FormField id="serviceNotesText" label="Avisos de atendimento (um por linha, até 6)" error={errors.serviceNotesText?.message} hint="Listados na coluna “Atendimento” do rodapé, junto com o horário.">
          <textarea id="serviceNotesText" className="textarea" rows={4} aria-invalid={!!errors.serviceNotesText} {...register('serviceNotesText')} />
        </FormField>
        <FormField id="cartNote" label="Observação na sacola" error={errors.cartNote?.message} hint="Aparece na sacola antes de finalizar o pedido.">
          <input id="cartNote" className="input" aria-invalid={!!errors.cartNote} {...register('cartNote')} />
        </FormField>
      </Group>
    </SectionForm>
  );
}

function IconPreview({ control, name, index }: { control: Control<ContentValues>; name: 'benefits' | 'trustItems'; index: number }) {
  const icon = useWatch({ control, name: `${name}.${index}.icon` });
  return (
    <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 6, background: 'var(--soft)', color: 'var(--gold)', flex: '0 0 auto' }}>
      <InfoGlyph icon={icon ?? 'shield'} width={24} height={24} />
    </span>
  );
}

function InfoItemsEditor({ name, legend, control, register, errors }: { name: 'benefits' | 'trustItems'; legend: string; control: Control<ContentValues>; register: UseFormRegister<ContentValues>; errors: FieldErrors<ContentValues> }) {
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const listErrors = errors[name];
  const blank: InfoItem = { icon: 'shield', title: '', text: '' };
  return (
    <Group legend={legend} hint={`Até 4 itens com ícone, título (até 40 caracteres) e texto curto (até 60). ${fields.length}/4.`}>
      {fields.length === 0 && <p className="notice">Nenhum item: a faixa não é exibida.</p>}
      {fields.map((f, i) => {
        const e = listErrors?.[i];
        const base = `${name}-${i}`;
        return (
          <fieldset key={f.id} style={{ border: 0, borderTop: i ? '1px dashed var(--line)' : 0, padding: i ? '12px 0 0' : 0, margin: 0, minWidth: 0 }}>
            <legend className="sr-only">Item {i + 1}</legend>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <IconPreview control={control} name={name} index={i} />
              <div className="form-cols three" style={{ flex: '1 1 420px' }}>
                <FormField id={`${base}-icon`} label={`Ícone do item ${i + 1}`}>
                  <select id={`${base}-icon`} className="select" {...register(`${name}.${i}.icon`)}>
                    {INFO_ICONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ICON_LABEL[ic]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id={`${base}-title`} label="Título" error={e?.title?.message}>
                  <input id={`${base}-title`} className="input" aria-invalid={!!e?.title} {...register(`${name}.${i}.title`)} />
                </FormField>
                <FormField id={`${base}-text`} label="Texto" error={e?.text?.message}>
                  <input id={`${base}-text`} className="input" aria-invalid={!!e?.text} {...register(`${name}.${i}.text`)} />
                </FormField>
              </div>
              <div className="row-actions" style={{ alignSelf: 'center' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Mover item ${i + 1} para cima`}>
                  ↑
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, i + 1)} disabled={i === fields.length - 1} aria-label={`Mover item ${i + 1} para baixo`}>
                  ↓
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(i)} aria-label={`Remover item ${i + 1}`}>
                  Remover
                </button>
              </div>
            </div>
          </fieldset>
        );
      })}
      <FieldError message={listErrors?.root?.message ?? listErrors?.message} />
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => append(blank)} disabled={fields.length >= 4}>
          + Adicionar item
        </button>
      </div>
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/* Pedidos e vitrine                                                   */
/* ------------------------------------------------------------------ */

const operationSchema = z.object({
  heroIntervalSeconds: z.number({ error: 'Informe um número de segundos.' }).int('Use um número inteiro.').min(3, 'Mínimo de 3 segundos.').max(30, 'Máximo de 30 segundos.'),
  pendingOrderTtlHours: z.number({ error: 'Informe um número de horas.' }).int('Use um número inteiro.').min(1, 'Mínimo de 1 hora.').max(720, 'Máximo de 720 horas (30 dias).'),
});
type OperationValues = z.infer<typeof operationSchema>;
const toOperationValues = (s: AdminSettings): OperationValues => ({ heroIntervalSeconds: s.heroIntervalSeconds, pendingOrderTtlHours: s.pendingOrderTtlHours });

function OperationSection({ settings }: { settings: AdminSettings }) {
  const { register, handleSubmit, formState, reset, setError } = useForm<OperationValues>({ resolver: zodResolver(operationSchema), defaultValues: toOperationValues(settings) });
  const errors = formState.errors;
  useEffect(() => {
    reset(toOperationValues(settings), { keepDirtyValues: true });
  }, [settings, reset]);
  const save = useSaveSettings();

  const onSubmit = handleSubmit((v) => save.mutate(v, { onSuccess: (s) => reset(toOperationValues(s)), onError: (err) => applyServerIssues(err, setError) }));

  return (
    <SectionForm id="sec-pedidos" title="Pedidos e vitrine" onSubmit={onSubmit} dirty={formState.isDirty} pending={save.isPending} onDiscard={() => reset()}>
      <div className="form-cols two">
        <FormField id="heroIntervalSeconds" label="Troca dos banners (segundos)" error={errors.heroIntervalSeconds?.message} hint="Tempo que cada banner do topo fica na tela antes de passar para o próximo (3 a 30).">
          <input id="heroIntervalSeconds" type="number" min={3} max={30} step={1} className="input" aria-invalid={!!errors.heroIntervalSeconds} {...register('heroIntervalSeconds', { valueAsNumber: true })} />
        </FormField>
        <FormField id="pendingOrderTtlHours" label="Prazo de pedidos pendentes (horas)" error={errors.pendingOrderTtlHours?.message} hint="De 1 a 720 horas (30 dias).">
          <input id="pendingOrderTtlHours" type="number" min={1} max={720} step={1} className="input" aria-invalid={!!errors.pendingOrderTtlHours} {...register('pendingOrderTtlHours', { valueAsNumber: true })} />
        </FormField>
      </div>
      <p className="notice">
        Pedidos que continuam <b>aguardando atendimento</b> depois desse prazo são marcados como <b>expirados</b> automaticamente, e o estoque reservado para eles volta a ficar disponível na loja. Pedidos já aceitos não expiram. Fuso horário da loja: {settings.timezone}.
      </p>
    </SectionForm>
  );
}
