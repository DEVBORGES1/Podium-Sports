import { Prisma, type Banner } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { mediaUrl, storage } from '../../lib/storage.js';
import { imageFrameSchema, type createBannerSchema, type ImageFrame, type updateBannerSchema } from './banners.schemas.js';
import { loadTargetRefs, readTarget, resolveTarget, targetFromLegacyUrl, type ButtonTarget, type TargetRefs } from './banners.targets.js';

type CreateInput = z.infer<typeof createBannerSchema>;
type UpdateInput = z.infer<typeof updateBannerSchema>;

function readFrame(raw: Prisma.JsonValue): ImageFrame | null {
  const parsed = imageFrameSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const buttonsOf = (b: Banner) => [
  { target: readTarget(b.buttonTarget), url: b.buttonUrl },
  { target: readTarget(b.secondaryButtonTarget), url: b.secondaryButtonUrl },
];

const refsFor = (banners: Banner[]) => loadTargetRefs(banners.flatMap(buttonsOf));

/** Endereço que a loja usa: o destino escolhido (sempre atualizado) ou, nos banners antigos, o link salvo. */
function liveUrl(target: ButtonTarget | null, url: string | null, refs: TargetRefs) {
  if (!target) return url;
  const r = resolveTarget(target, refs);
  return r.issue ? null : r.path;
}

/** Dados públicos: somente o que deve aparecer na loja (selo/preços ocultos e botões sem destino válido saem). */
export function toBannerDto(b: Banner, refs: TargetRefs) {
  const [primary, secondary] = buttonsOf(b);
  const buttonUrl = b.buttonLabel ? liveUrl(primary!.target, primary!.url, refs) : null;
  const secondaryButtonUrl = b.secondaryButtonEnabled && b.secondaryButtonLabel ? liveUrl(secondary!.target, secondary!.url, refs) : null;
  return {
    id: b.id,
    kicker: b.showKicker ? b.kicker : null,
    title: b.title,
    highlight: b.highlight,
    subtitle: b.subtitle,
    footnote: b.footnote,
    priceOriginalCents: b.showPrices ? b.priceOriginalCents : null,
    priceSaleCents: b.showPrices ? b.priceSaleCents : null,
    imageUrl: mediaUrl(b.imagePath),
    imageFrame: readFrame(b.imageFrame),
    imageBg: b.imageBg,
    mobileImageUrl: mediaUrl(b.mobileImagePath),
    mobileImageBg: b.mobileImageBg,
    layout: b.layout,
    contentAlign: b.contentAlign,
    overlay: b.overlay,
    // Banners antigos (colunas nulas): o celular repete o formato e o escurecimento do computador.
    mobileLayout: b.mobileLayout ?? b.layout,
    mobileOverlay: b.mobileOverlay ?? b.overlay,
    icon: b.icon,
    colorFrom: b.colorFrom,
    colorTo: b.colorTo,
    buttonLabel: buttonUrl ? b.buttonLabel : null,
    buttonUrl,
    secondaryButtonLabel: secondaryButtonUrl ? b.secondaryButtonLabel : null,
    secondaryButtonUrl,
    badgeTop: b.badgeTop,
    badgeMain: b.badgeMain,
    badgeBottom: b.badgeBottom,
    sortOrder: b.sortOrder,
  };
}

export function bannerState(b: Banner, now = new Date()) {
  if (!b.isActive) return 'INACTIVE' as const;
  if (b.startsAt && b.startsAt > now) return 'SCHEDULED' as const;
  if (b.endsAt && b.endsAt <= now) return 'EXPIRED' as const;
  return 'LIVE' as const;
}

/** Situação de um botão para o painel: destino (convertido de link antigo quando possível), descrição e problema. */
function buttonInfo(label: string | null, stored: { target: ButtonTarget | null; url: string | null }, refs: TargetRefs) {
  const target = stored.target ?? targetFromLegacyUrl(stored.url, refs);
  if (!target) {
    if (!stored.url) return { target: null, info: null };
    return { target: null, info: { description: `Endereço digitado: ${stored.url}`, issue: label ? ('LEGACY_LINK' as const) : null, url: stored.url } };
  }
  const r = resolveTarget(target, refs);
  return { target, info: { description: r.description, issue: r.issue, url: r.path } };
}

export function toAdminBanner(b: Banner, refs: TargetRefs) {
  const [primary, secondary] = buttonsOf(b);
  const p = buttonInfo(b.buttonLabel, primary!, refs);
  const s = buttonInfo(b.secondaryButtonLabel, secondary!, refs);
  return {
    ...toBannerDto(b, refs),
    kicker: b.kicker,
    showKicker: b.showKicker,
    priceOriginalCents: b.priceOriginalCents,
    priceSaleCents: b.priceSaleCents,
    showPrices: b.showPrices,
    buttonLabel: b.buttonLabel,
    buttonUrl: b.buttonUrl,
    buttonTarget: p.target,
    buttonInfo: p.info,
    secondaryButtonLabel: b.secondaryButtonLabel,
    secondaryButtonUrl: b.secondaryButtonUrl,
    secondaryButtonTarget: s.target,
    secondaryButtonInfo: s.info,
    secondaryButtonEnabled: b.secondaryButtonEnabled,
    imagePath: b.imagePath,
    mobileImagePath: b.mobileImagePath,
    isActive: b.isActive,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    state: bannerState(b),
    updatedAt: b.updatedAt,
  };
}

export async function adminView(b: Banner) {
  return toAdminBanner(b, await refsFor([b]));
}

export async function listPublicBanners() {
  const now = new Date();
  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 10,
  });
  const refs = await refsFor(banners);
  return banners.map((b) => toBannerDto(b, refs));
}

export async function listAdminBanners() {
  const banners = await prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const refs = await refsFor(banners);
  return banners.map((b) => toAdminBanner(b, refs));
}

type ButtonFields = 'buttonTarget' | 'buttonUrl' | 'secondaryButtonTarget' | 'secondaryButtonUrl';

/**
 * Normaliza os destinos enviados: com destino escolhido no seletor, o servidor confere se o produto/categoria
 * existe e grava também o endereço gerado (referência para integrações antigas). Só com URL (clientes antigos),
 * vale o link informado e o destino estruturado é descartado.
 */
async function normalizeButtons(input: Partial<Pick<CreateInput, ButtonFields>>) {
  const out: {
    buttonTarget?: ButtonTarget | null;
    buttonUrl?: string | null;
    secondaryButtonTarget?: ButtonTarget | null;
    secondaryButtonUrl?: string | null;
  } = {};
  const pairs = [
    ['buttonTarget', 'buttonUrl'],
    ['secondaryButtonTarget', 'secondaryButtonUrl'],
  ] as const;
  const targets = pairs.map(([t]) => input[t]).filter((t): t is ButtonTarget => !!t);
  const refs = targets.length ? await loadTargetRefs(targets.map((target) => ({ target, url: null }))) : null;
  for (const [targetKey, urlKey] of pairs) {
    const target = input[targetKey];
    const url = input[urlKey];
    if (target) {
      const r = resolveTarget(target, refs!);
      if (r.issue === 'PRODUCT_REMOVED' || r.issue === 'CATEGORY_REMOVED' || r.issue === 'WHATSAPP_MISSING') {
        const message =
          r.issue === 'PRODUCT_REMOVED'
            ? 'O produto escolhido não existe mais.'
            : r.issue === 'CATEGORY_REMOVED'
              ? 'A categoria escolhida não existe mais.'
              : 'Cadastre o número do WhatsApp nas configurações.';
        throw unprocessable(message, [{ field: targetKey, message }], 'BANNER_TARGET_INVALID');
      }
      out[targetKey] = target;
      out[urlKey] = r.path;
    } else if (target === null) {
      out[targetKey] = null;
      out[urlKey] = url ?? null;
    } else if (url !== undefined) {
      out[targetKey] = null;
      out[urlKey] = url;
    }
  }
  return out;
}

type Merged = Pick<
  Banner,
  | 'buttonLabel'
  | 'buttonUrl'
  | 'secondaryButtonLabel'
  | 'secondaryButtonUrl'
  | 'secondaryButtonEnabled'
  | 'startsAt'
  | 'endsAt'
  | 'priceOriginalCents'
  | 'priceSaleCents'
>;

/** Regras entre campos, conferidas sobre o estado final (criação ou edição parcial). */
function assertConsistent(v: Merged) {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    throw unprocessable('A data final deve ser posterior à inicial.', [{ field: 'endsAt', message: 'A data final deve ser posterior à inicial.' }]);
  }
  if (v.priceOriginalCents && v.priceSaleCents && v.priceOriginalCents <= v.priceSaleCents) {
    const message = 'O preço original deve ser maior que o preço promocional.';
    throw unprocessable(message, [{ field: 'priceOriginalCents', message }]);
  }
  const issues: { field: string; message: string }[] = [];
  const message = 'Informe o texto e o destino do botão juntos.';
  if (!v.buttonLabel !== !v.buttonUrl) issues.push({ field: v.buttonLabel ? 'buttonTarget' : 'buttonLabel', message });
  // O botão secundário desligado guarda o que foi preenchido sem exigir os dois campos.
  if (v.secondaryButtonEnabled && !v.secondaryButtonLabel !== !v.secondaryButtonUrl) {
    issues.push({ field: v.secondaryButtonLabel ? 'secondaryButtonTarget' : 'secondaryButtonLabel', message });
  }
  if (issues.length) throw unprocessable(message, issues);
}

/** Campos JSON: null precisa virar DbNull no Prisma. */
function toData<T extends { buttonTarget?: unknown; secondaryButtonTarget?: unknown; imageFrame?: unknown }>(v: T) {
  const json = (x: unknown) => (x === null ? Prisma.DbNull : (x as Prisma.InputJsonValue | undefined));
  return { ...v, buttonTarget: json(v.buttonTarget), secondaryButtonTarget: json(v.secondaryButtonTarget), imageFrame: json(v.imageFrame) };
}

export async function createBanner(input: CreateInput, profileId: string) {
  const data = { ...input, ...(await normalizeButtons(input)) };
  assertConsistent({
    ...data,
    buttonUrl: data.buttonUrl ?? null,
    secondaryButtonUrl: data.secondaryButtonUrl ?? null,
  });
  return prisma.$transaction(async (tx) => {
    const b = await tx.banner.create({ data: toData(data) });
    await audit({ profileId, action: 'banner.create', entityType: 'banner', entityId: b.id, metadata: { title: b.title } }, tx);
    return b;
  });
}

export async function updateBanner(id: string, input: UpdateInput, profileId: string) {
  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) throw notFound('Banner não encontrado.');
  const data = { ...input, ...(await normalizeButtons(input)) };
  const pick = <K extends keyof Merged>(k: K): Merged[K] => (data[k] !== undefined ? (data[k] as Merged[K]) : current[k]);
  assertConsistent({
    buttonLabel: pick('buttonLabel'),
    buttonUrl: pick('buttonUrl'),
    secondaryButtonLabel: pick('secondaryButtonLabel'),
    secondaryButtonUrl: pick('secondaryButtonUrl'),
    secondaryButtonEnabled: pick('secondaryButtonEnabled'),
    startsAt: pick('startsAt'),
    endsAt: pick('endsAt'),
    priceOriginalCents: pick('priceOriginalCents'),
    priceSaleCents: pick('priceSaleCents'),
  });
  const nextImage = data.imagePath !== undefined ? data.imagePath : current.imagePath;
  const nextMobileImage = data.mobileImagePath !== undefined ? data.mobileImagePath : current.mobileImagePath;
  if (nextMobileImage && !nextImage) {
    throw unprocessable('Envie primeiro a foto principal; a foto do celular é uma alternativa a ela.', [
      { field: 'mobileImagePath', message: 'Remova a foto do celular ou envie a foto principal.' },
    ]);
  }
  const saved = await prisma.$transaction(async (tx) => {
    const b = await tx.banner.update({ where: { id }, data: toData(data) });
    await audit({ profileId, action: 'banner.update', entityType: 'banner', entityId: id, metadata: diff(current, data) as object }, tx);
    return b;
  });
  // Arquivos trocados ou removidos saem do Storage (falha aqui não desfaz o salvamento).
  const replaced = [
    current.imagePath !== saved.imagePath && current.imagePath,
    current.mobileImagePath !== saved.mobileImagePath && current.mobileImagePath,
  ].filter((path): path is string => !!path);
  if (replaced.length)
    await storage
      .get()
      .remove(replaced)
      .catch(() => undefined);
  return saved;
}

export async function deleteBanner(id: string, profileId: string) {
  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) throw notFound('Banner não encontrado.');
  await prisma.$transaction(async (tx) => {
    await tx.banner.delete({ where: { id } });
    await audit({ profileId, action: 'banner.delete', entityType: 'banner', entityId: id, metadata: { title: current.title } }, tx);
  });
  const files = [current.imagePath, current.mobileImagePath].filter((path): path is string => !!path);
  if (files.length)
    await storage
      .get()
      .remove(files)
      .catch(() => undefined);
}
