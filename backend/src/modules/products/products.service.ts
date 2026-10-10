import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { computeEffectivePrice } from '../../lib/pricing.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { buildStoragePath, mediaUrl, storage, validateImage } from '../../lib/storage.js';
import { buildProductSearchText, normalizeSearch, slugify } from '../../lib/text.js';
import { paged } from '../../lib/validation.js';
import {
  MAX_QUANTITY_PER_ITEM,
  type adminListQuery,
  type createProductSchema,
  type publicListQuery,
  type updateProductSchema,
} from './products.schemas.js';

export const MAX_IMAGES_PER_PRODUCT = 10;
/** Limite de produtos avaliados em memória para filtros/ordenação por preço efetivo. */
const CATALOG_SCAN_LIMIT = 2000;

/** Inclui categoria, imagens e somente as promoções vigentes (evita N+1). */
export function productInclude(now: Date) {
  return {
    category: true,
    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
    promotions: {
      where: { promotion: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } },
      include: { promotion: true },
    },
  } satisfies Prisma.ProductInclude;
}

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

export function priceOf(p: ProductWithRelations, now: Date) {
  return computeEffectivePrice(
    p,
    p.promotions.map((pp) => pp.promotion),
    now,
  );
}

export function availabilityOf(stock: number, minStock: number) {
  if (stock <= 0) return 'OUT_OF_STOCK' as const;
  if (stock <= minStock) return 'LOW_STOCK' as const;
  return 'IN_STOCK' as const;
}

export function toPublicProduct(p: ProductWithRelations, now: Date) {
  const price = priceOf(p, now);
  const images = p.images.map((img) => ({ id: img.id, url: mediaUrl(img.storagePath)!, altText: img.altText ?? p.name }));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    description: p.description,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug, icon: p.category.icon },
    priceCents: price.priceCents,
    regularPriceCents: price.regularPriceCents,
    onSale: price.onSale,
    discountPercent: price.discountPercent,
    promotion: price.promotion ? { name: price.promotion.name, endsAt: price.promotion.endsAt } : null,
    imageUrl: images[0]?.url ?? null,
    images,
    availability: availabilityOf(p.stockQuantity, p.minStock),
    maxQuantity: Math.max(0, Math.min(p.stockQuantity, MAX_QUANTITY_PER_ITEM)),
    isFeatured: p.isFeatured,
    createdAt: p.createdAt,
  };
}

export type PublicProduct = ReturnType<typeof toPublicProduct>;

function searchFilter(q: string | undefined): Prisma.ProductWhereInput[] {
  if (!q) return [];
  return normalizeSearch(q)
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .map((term) => ({ searchText: { contains: term } }));
}

export async function listPublicProducts(query: z.infer<typeof publicListQuery>) {
  const now = new Date();
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    category: { isActive: true, ...(query.category ? { slug: query.category } : {}) },
    ...(query.featured ? { isFeatured: true } : {}),
    AND: searchFilter(query.q),
  };
  const rows = await prisma.product.findMany({
    where,
    include: productInclude(now),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: CATALOG_SCAN_LIMIT,
  });

  let items = rows.map((p) => toPublicProduct(p, now));
  if (query.onSale) items = items.filter((p) => p.onSale);
  if (query.minPrice !== undefined) items = items.filter((p) => p.priceCents >= query.minPrice!);
  if (query.maxPrice !== undefined) items = items.filter((p) => p.priceCents <= query.maxPrice!);

  const byName = (a: PublicProduct, b: PublicProduct) => a.name.localeCompare(b.name, 'pt-BR');
  switch (query.sort) {
    case 'price_asc':
      items.sort((a, b) => a.priceCents - b.priceCents || byName(a, b));
      break;
    case 'price_desc':
      items.sort((a, b) => b.priceCents - a.priceCents || byName(a, b));
      break;
    case 'name_asc':
      items.sort(byName);
      break;
    case 'newest':
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b));
      break;
    case 'relevance':
      // Disponíveis primeiro, mantendo a ordem definida pelo lojista.
      items.sort((a, b) => Number(a.availability === 'OUT_OF_STOCK') - Number(b.availability === 'OUT_OF_STOCK'));
      break;
  }
  const start = (query.page - 1) * query.pageSize;
  return paged(items.slice(start, start + query.pageSize), items.length, query.page, query.pageSize);
}

export async function getPublicProduct(idOrSlug: string) {
  const now = new Date();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const product = await prisma.product.findFirst({
    where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), isActive: true, category: { isActive: true } },
    include: productInclude(now),
  });
  if (!product) throw notFound('Produto não encontrado.');
  const related = await prisma.product.findMany({
    where: { categoryId: product.categoryId, isActive: true, id: { not: product.id }, stockQuantity: { gt: 0 } },
    include: productInclude(now),
    orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
    take: 5,
  });
  return { ...toPublicProduct(product, now), related: related.map((p) => toPublicProduct(p, now)) };
}

export async function legacyMap(ids: number[]) {
  const rows = await prisma.product.findMany({
    where: { legacyId: { in: ids }, isActive: true },
    select: { id: true, legacyId: true },
  });
  return rows.map((r) => ({ legacyId: r.legacyId!, id: r.id }));
}

// ---------------- Administração ----------------

export function toAdminProduct(p: ProductWithRelations & { _count?: { orderItems: number } }, now: Date) {
  const pub = toPublicProduct(p, now);
  return {
    ...pub,
    priceCents: p.priceCents,
    salePriceCents: p.salePriceCents,
    effectivePriceCents: pub.priceCents,
    categoryId: p.categoryId,
    stockQuantity: p.stockQuantity,
    minStock: p.minStock,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    legacyId: p.legacyId,
    images: p.images.map((img) => ({
      id: img.id,
      url: mediaUrl(img.storagePath)!,
      altText: img.altText,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
      sizeBytes: img.sizeBytes,
    })),
    updatedAt: p.updatedAt,
    ...(p._count ? { orderCount: p._count.orderItems, canDelete: p._count.orderItems === 0 } : {}),
  };
}

export async function listAdminProducts(query: z.infer<typeof adminListQuery>) {
  const now = new Date();
  const where: Prisma.ProductWhereInput = {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { isActive: query.status === 'active' } : {}),
    ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
    AND: searchFilter(query.q),
  };
  if (query.stock === 'out') where.stockQuantity = 0;
  if (query.stock === 'low' || query.stock === 'ok') {
    // Comparação entre colunas: resolvida com SQL parametrizado.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE ${query.stock === 'low' ? Prisma.sql`stock_quantity > 0 AND stock_quantity <= min_stock` : Prisma.sql`stock_quantity > min_stock`}`;
    where.id = { in: rows.map((r) => r.id) };
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
    sortOrder: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
    name: [{ name: 'asc' as const }],
    price: [{ priceCents: 'asc' as const }],
    stock: [{ stockQuantity: 'asc' as const }, { name: 'asc' as const }],
    updated: [{ updatedAt: 'desc' as const }],
  }[query.sort];
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude(now),
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return paged(
    rows.map((p) => toAdminProduct(p, now)),
    total,
    query.page,
    query.pageSize,
  );
}

export async function getAdminProduct(id: string) {
  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id },
    include: { ...productInclude(now), _count: { select: { orderItems: true } } },
  });
  if (!product) throw notFound('Produto não encontrado.');
  return toAdminProduct(product, now);
}

async function uniqueSlug(base: string, tx: Tx, excludeId?: string) {
  const root = slugify(base) || 'produto';
  for (let i = 1; i < 500; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const existing = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  throw conflict('Não foi possível gerar um endereço (slug) único para o produto.');
}

async function requireCategory(tx: Tx, id: string) {
  const category = await tx.category.findUnique({ where: { id } });
  if (!category) throw unprocessable('Categoria inexistente.', [{ field: 'categoryId', message: 'Categoria inexistente.' }]);
  return category;
}

export async function createProduct(input: z.infer<typeof createProductSchema>, profileId: string) {
  const id = await prisma.$transaction(async (tx) => {
    const category = await requireCategory(tx, input.categoryId);
    if (input.slug) {
      const taken = await tx.product.findUnique({ where: { slug: input.slug } });
      if (taken) throw conflict('Este endereço (slug) já está em uso.', [{ field: 'slug', message: 'Já está em uso.' }]);
    }
    const slug = input.slug ?? (await uniqueSlug(input.name, tx));
    const { initialStock, ...data } = input;
    const product = await tx.product.create({
      data: {
        ...data,
        slug,
        stockQuantity: initialStock,
        searchText: buildProductSearchText(input.name, input.brand, category.name),
      },
    });
    if (initialStock > 0) {
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'INITIAL',
          quantity: initialStock,
          balanceBefore: 0,
          balanceAfter: initialStock,
          reason: 'Estoque inicial no cadastro do produto',
          profileId,
        },
      });
    }
    await audit(
      {
        profileId,
        action: 'product.create',
        entityType: 'product',
        entityId: product.id,
        metadata: { name: product.name, priceCents: product.priceCents, initialStock },
      },
      tx,
    );
    return product.id;
  });
  return getAdminProduct(id);
}

export async function updateProduct(id: string, input: z.infer<typeof updateProductSchema>, profileId: string) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id }, include: { category: true } });
    if (!current) throw notFound('Produto não encontrado.');
    const priceCents = input.priceCents ?? current.priceCents;
    const salePriceCents = input.salePriceCents !== undefined ? input.salePriceCents : current.salePriceCents;
    if (salePriceCents !== null && salePriceCents >= priceCents) {
      throw unprocessable('O preço promocional deve ser menor que o preço.', [
        { field: 'salePriceCents', message: 'Deve ser menor que o preço.' },
      ]);
    }
    const category = input.categoryId ? await requireCategory(tx, input.categoryId) : current.category;
    if (input.slug && input.slug !== current.slug) {
      const taken = await tx.product.findUnique({ where: { slug: input.slug } });
      if (taken) throw conflict('Este endereço (slug) já está em uso.', [{ field: 'slug', message: 'Já está em uso.' }]);
    }
    const name = input.name ?? current.name;
    const brand = input.brand !== undefined ? input.brand : current.brand;
    await tx.product.update({
      where: { id },
      data: { ...input, searchText: buildProductSearchText(name, brand, category.name) },
    });
    const changes = diff(current as unknown as Record<string, unknown>, input as Record<string, unknown>);
    if (Object.keys(changes).length > 0) {
      const priceChanged = 'priceCents' in changes || 'salePriceCents' in changes;
      await audit(
        {
          profileId,
          action: priceChanged ? 'product.price_change' : 'product.update',
          entityType: 'product',
          entityId: id,
          metadata: { name, changes } as Prisma.InputJsonValue,
        },
        tx,
      );
    }
  });
  return getAdminProduct(id);
}

export async function deleteProduct(id: string, profileId: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true, _count: { select: { orderItems: true } } },
  });
  if (!product) throw notFound('Produto não encontrado.');
  if (product._count.orderItems > 0) {
    throw conflict(
      'Este produto aparece em pedidos e não pode ser excluído para preservar o histórico. Desative-o para tirá-lo da loja.',
      { orderCount: product._count.orderItems },
      'PRODUCT_HAS_ORDERS',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.product.delete({ where: { id } });
    await audit(
      {
        profileId,
        action: 'product.delete',
        entityType: 'product',
        entityId: id,
        metadata: { name: product.name, slug: product.slug, stockQuantity: product.stockQuantity },
      },
      tx,
    );
  });
  await storage
    .get()
    .remove(product.images.map((i) => i.storagePath))
    .catch(() => undefined);
}

// ---------------- Imagens ----------------

export async function addImages(productId: string, files: Express.Multer.File[], profileId: string) {
  if (files.length === 0) throw badRequest('Envie ao menos uma imagem no campo "images".');
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { _count: { select: { images: true } } } });
  if (!product) throw notFound('Produto não encontrado.');
  if (product._count.images + files.length > MAX_IMAGES_PER_PRODUCT) {
    throw unprocessable(`Cada produto pode ter no máximo ${MAX_IMAGES_PER_PRODUCT} imagens.`);
  }
  // Valida todos os arquivos antes de enviar qualquer um.
  const prepared = files.map((f) => {
    const type = validateImage(f.buffer);
    return { file: f, type, path: buildStoragePath('products', type.ext) };
  });
  const uploaded: string[] = [];
  try {
    for (const item of prepared) {
      await storage.get().upload(item.path, item.file.buffer, item.type.mime);
      uploaded.push(item.path);
    }
    await prisma.$transaction(async (tx) => {
      const hasPrimary = (await tx.productImage.count({ where: { productId, isPrimary: true } })) > 0;
      const last = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
      let order = (last._max.sortOrder ?? -1) + 1;
      for (const [index, item] of prepared.entries()) {
        await tx.productImage.create({
          data: {
            productId,
            storagePath: item.path,
            altText: product.name,
            isPrimary: !hasPrimary && index === 0,
            sortOrder: order++,
            mimeType: item.type.mime,
            sizeBytes: item.file.size,
          },
        });
      }
      await audit(
        { profileId, action: 'product.images_add', entityType: 'product', entityId: productId, metadata: { count: prepared.length } },
        tx,
      );
    });
  } catch (err) {
    await storage.get().remove(uploaded).catch(() => undefined);
    throw err;
  }
  return getAdminProduct(productId);
}

export async function updateImage(
  productId: string,
  imageId: string,
  input: { altText?: string | null; isPrimary?: true },
  profileId: string,
) {
  await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw notFound('Imagem não encontrada.');
    if (input.isPrimary) {
      await tx.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } });
    }
    await tx.productImage.update({
      where: { id: imageId },
      data: { ...(input.altText !== undefined ? { altText: input.altText } : {}), ...(input.isPrimary ? { isPrimary: true } : {}) },
    });
    await audit({ profileId, action: 'product.image_update', entityType: 'product', entityId: productId, metadata: { imageId } }, tx);
  });
  return getAdminProduct(productId);
}

export async function reorderImages(productId: string, imageIds: string[], profileId: string) {
  await prisma.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({ where: { productId }, select: { id: true } });
    const current = new Set(images.map((i) => i.id));
    if (imageIds.length !== current.size || new Set(imageIds).size !== imageIds.length || imageIds.some((i) => !current.has(i))) {
      throw unprocessable('Informe todas as imagens do produto, sem repetir.');
    }
    for (const [index, id] of imageIds.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }
    await audit({ profileId, action: 'product.images_reorder', entityType: 'product', entityId: productId }, tx);
  });
  return getAdminProduct(productId);
}

export async function deleteImage(productId: string, imageId: string, profileId: string) {
  const image = await prisma.$transaction(async (tx) => {
    const img = await tx.productImage.findFirst({ where: { id: imageId, productId } });
    if (!img) throw notFound('Imagem não encontrada.');
    await tx.productImage.delete({ where: { id: imageId } });
    if (img.isPrimary) {
      const next = await tx.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } });
      if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await audit({ profileId, action: 'product.image_delete', entityType: 'product', entityId: productId, metadata: { imageId } }, tx);
    return img;
  });
  await storage
    .get()
    .remove([image.storagePath])
    .catch(() => undefined);
  return getAdminProduct(productId);
}

