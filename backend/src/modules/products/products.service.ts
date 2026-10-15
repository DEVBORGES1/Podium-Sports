import { Prisma, type Category } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { buildDerivedImages, derivedPath } from '../../lib/images.js';
import { logger } from '../../lib/logger.js';
import { computeEffectivePrice } from '../../lib/pricing.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { applyStockChange } from '../../lib/stock.js';
import { buildStoragePath, mediaUrl, storage, validateImage } from '../../lib/storage.js';
import { buildProductSearchText, normalizeSearch, slugify } from '../../lib/text.js';
import { paged } from '../../lib/validation.js';
import { OPEN_ORDER_STATUSES } from '../orders/orders.labels.js';
import {
  MAX_QUANTITY_PER_ITEM,
  type adminListQuery,
  type createProductSchema,
  type publicListQuery,
  type setVariantsSchema,
  type updateProductSchema,
} from './products.schemas.js';

export const MAX_IMAGES_PER_PRODUCT = 10;
/** Limite de produtos avaliados em memória para filtros/ordenação por preço efetivo. */
const CATALOG_SCAN_LIMIT = 2000;

/**
 * Filtro de categoria da loja: a categoria (e a mãe, se for subcategoria) precisa estar ativa.
 * Com slug, uma categoria principal inclui os produtos das suas subcategorias.
 */
export function storeCategoryWhere(slug?: string): Prisma.CategoryWhereInput {
  return {
    isActive: true,
    AND: [{ OR: [{ parentId: null }, { parent: { isActive: true } }] }, ...(slug ? [{ OR: [{ slug }, { parent: { slug } }] }] : [])],
  };
}

/** Texto de categoria usado na busca: inclui a categoria-mãe ("Acessórios Natação"). */
export function categorySearchLabel(category: Category & { parent?: Category | null }) {
  return category.parent ? `${category.parent.name} ${category.name}` : category.name;
}

/** Inclui categoria, imagens, variações e somente as promoções vigentes (evita N+1). */
export function productInclude(now: Date) {
  return {
    category: { include: { parent: true } },
    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
    variants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
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

const maxQuantityFor = (stock: number) => Math.max(0, Math.min(stock, MAX_QUANTITY_PER_ITEM));

/**
 * Estoque vendável do produto: com variações, a soma das variações ativas (as inativas não aparecem na loja);
 * sem variações, o estoque do produto.
 */
export function sellableStock(p: Pick<ProductWithRelations, 'stockQuantity' | 'variants'>) {
  if (p.variants.length === 0) return p.stockQuantity;
  return p.variants.filter((v) => v.isActive).reduce((sum, v) => sum + v.stockQuantity, 0);
}

export function imageDto(img: { id: string; storagePath: string; thumbPath: string | null; mediumPath: string | null }) {
  const url = mediaUrl(img.storagePath)!;
  return { id: img.id, url, thumbUrl: mediaUrl(img.thumbPath) ?? url, mediumUrl: mediaUrl(img.mediumPath) ?? url };
}

export function toPublicProduct(p: ProductWithRelations, now: Date) {
  const price = priceOf(p, now);
  const images = p.images.map((img) => ({ ...imageDto(img), altText: img.altText ?? p.name }));
  const hasVariants = p.variants.length > 0;
  const stock = sellableStock(p);
  const parent = p.category.parent;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    description: p.description,
    category: {
      id: p.category.id,
      name: p.category.name,
      slug: p.category.slug,
      icon: p.category.icon,
      parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null,
    },
    priceCents: price.priceCents,
    regularPriceCents: price.regularPriceCents,
    onSale: price.onSale,
    discountPercent: price.discountPercent,
    promotion: price.promotion ? { name: price.promotion.name, endsAt: price.promotion.endsAt } : null,
    imageUrl: images[0]?.url ?? null,
    thumbUrl: images[0]?.thumbUrl ?? null,
    images,
    availability: availabilityOf(stock, p.minStock),
    maxQuantity: hasVariants ? Math.max(0, ...p.variants.filter((v) => v.isActive).map((v) => maxQuantityFor(v.stockQuantity))) : maxQuantityFor(stock),
    /** Nome da escolha (ex.: "Tamanho"); null = produto sem variações. */
    variantType: hasVariants ? (p.variantType ?? 'Opção') : null,
    variants: p.variants
      .filter((v) => v.isActive)
      .map((v) => ({ id: v.id, label: v.label, available: v.stockQuantity > 0, maxQuantity: maxQuantityFor(v.stockQuantity) })),
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
    category: storeCategoryWhere(query.category),
    ...(query.featured ? { isFeatured: true } : {}),
    ...(query.brand?.length ? { OR: query.brand.map((b) => ({ brand: { equals: b, mode: 'insensitive' as const } })) } : {}),
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
    where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), isActive: true, category: storeCategoryWhere() },
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

/** Marcas com produtos à venda (opcionalmente só de uma categoria), para o filtro do catálogo. */
export async function listBrands(category?: string) {
  const rows = await prisma.product.groupBy({
    by: ['brand'],
    where: { isActive: true, brand: { not: null }, category: storeCategoryWhere(category) },
    _count: { _all: true },
  });
  // Junta grafias diferentes da mesma marca ("POKER" e "Poker"). A grafia exibida é a mais usada;
  // em empate vale a ordem de código dos caracteres, para o resultado não depender do banco.
  const ordered = [...rows].sort((a, b) => b._count._all - a._count._all || (a.brand! < b.brand! ? -1 : a.brand! > b.brand! ? 1 : 0));
  const merged = new Map<string, { name: string; count: number }>();
  for (const r of ordered) {
    const name = r.brand!.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    const current = merged.get(key);
    merged.set(key, { name: current?.name ?? name, count: (current?.count ?? 0) + r._count._all });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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
    /** No painel, todas as variações (inclusive inativas) com o estoque de cada uma. */
    variantType: p.variants.length > 0 ? (p.variantType ?? 'Opção') : null,
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, stockQuantity: v.stockQuantity, isActive: v.isActive, sortOrder: v.sortOrder })),
    images: p.images.map((img) => ({
      ...imageDto(img),
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
  const category = await tx.category.findUnique({ where: { id }, include: { parent: true } });
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
        searchText: buildProductSearchText(input.name, input.brand, categorySearchLabel(category)),
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
    const current = await tx.product.findUnique({ where: { id }, include: { category: { include: { parent: true } } } });
    if (!current) throw notFound('Produto não encontrado.');
    const priceCents = input.priceCents ?? current.priceCents;
    const salePriceCents = input.salePriceCents !== undefined ? input.salePriceCents : current.salePriceCents;
    if (salePriceCents !== null && salePriceCents >= priceCents) {
      throw unprocessable('O preço promocional deve ser menor que o preço.', [{ field: 'salePriceCents', message: 'Deve ser menor que o preço.' }]);
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
      data: { ...input, searchText: buildProductSearchText(name, brand, categorySearchLabel(category)) },
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

// ---------------- Variações ----------------

/** Itens com estoque ainda reservado em pedidos abertos (a devolução precisa saber para onde voltar). */
function openReservations(tx: Tx, where: Prisma.OrderItemWhereInput) {
  return tx.orderItem.count({
    where: { ...where, order: { status: { in: [...OPEN_ORDER_STATUSES] }, stockReleasedAt: null } },
  });
}

/**
 * Salva a lista de variações do produto (ver setVariantsSchema).
 * - Ativar variações: o estoque único é zerado e passa a ser lançado por opção.
 * - Desativar (lista vazia): as opções somem e o estoque total vira o estoque único.
 * - Excluir uma opção zera o estoque dela; com reserva em pedido aberto, é preciso desativá-la.
 */
export async function setVariants(productId: string, input: z.infer<typeof setVariantsSchema>, profileId: string) {
  await prisma.$transaction(async (tx) => {
    // Mesma ordem de travamento das vendas (produto e depois as variações): sem deadlock.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw notFound('Produto não encontrado.');
    await tx.$queryRaw`SELECT id FROM product_variants WHERE product_id = ${productId}::uuid ORDER BY id FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: true } });

    const existing = new Map(product.variants.map((v) => [v.id, v]));
    if (input.variants.some((v) => v.id && !existing.has(v.id))) throw notFound('Variação não encontrada.');
    const kept = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
    const removed = product.variants.filter((v) => !kept.has(v.id));
    const enabling = product.variants.length === 0 && input.variants.length > 0;
    const disabling = product.variants.length > 0 && input.variants.length === 0;
    const kind = (input.variantType ?? product.variantType ?? 'variação').toLowerCase();

    if (enabling) {
      if ((await openReservations(tx, { productId })) > 0) {
        throw conflict(
          'Há pedidos em aberto com este produto. Finalize ou cancele esses pedidos antes de passar o estoque para variações.',
          undefined,
          'OPEN_ORDERS',
        );
      }
      if (product.stockQuantity > 0) {
        await applyStockChange(tx, {
          productId,
          delta: -product.stockQuantity,
          type: 'ADJUSTMENT',
          reason: `Estoque passou a ser lançado por ${kind}`,
          profileId,
        });
      }
    }
    if (disabling) {
      // O total (soma das opções) continua como estoque único; reservas abertas voltam para ele.
      await tx.productVariant.deleteMany({ where: { productId } });
    } else if (removed.length > 0) {
      if ((await openReservations(tx, { variantId: { in: removed.map((v) => v.id) } })) > 0) {
        throw conflict(
          'Uma das opções excluídas está reservada em pedido aberto. Desative a opção (ela some da loja) em vez de excluir.',
          undefined,
          'VARIANT_RESERVED',
        );
      }
      for (const v of [...removed].sort((a, b) => a.id.localeCompare(b.id))) {
        if (v.stockQuantity > 0) {
          await applyStockChange(tx, {
            productId,
            variantId: v.id,
            delta: -v.stockQuantity,
            type: 'ADJUSTMENT',
            reason: `Opção ${v.label} excluída do cadastro`,
            profileId,
          });
        }
      }
      await tx.productVariant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });
    }

    const saved: { id: string; label: string; stockDelta: number; isNew: boolean }[] = [];
    for (const [index, v] of input.variants.entries()) {
      if (v.id) {
        await tx.productVariant.update({ where: { id: v.id }, data: { label: v.label, isActive: v.isActive, sortOrder: index } });
        saved.push({ id: v.id, label: v.label, stockDelta: v.stockDelta, isNew: false });
      } else {
        const created = await tx.productVariant.create({ data: { productId, label: v.label, isActive: v.isActive, sortOrder: index } });
        saved.push({ id: created.id, label: v.label, stockDelta: v.stockDelta, isNew: true });
      }
    }
    for (const v of [...saved].sort((a, b) => a.id.localeCompare(b.id))) {
      if (v.stockDelta === 0) continue;
      await applyStockChange(tx, {
        productId,
        variantId: v.id,
        delta: v.stockDelta,
        type: v.isNew ? 'INITIAL' : 'ADJUSTMENT',
        reason: v.isNew ? `Estoque inicial da opção ${v.label}` : `Ajuste da opção ${v.label} no cadastro do produto`,
        profileId,
      });
    }
    await tx.product.update({ where: { id: productId }, data: { variantType: input.variants.length > 0 ? input.variantType : null } });
    await audit(
      {
        profileId,
        action: 'product.variants',
        entityType: 'product',
        entityId: productId,
        metadata: {
          name: product.name,
          variantType: input.variantType,
          options: saved.map((v) => v.label),
          removed: removed.map((v) => v.label),
          stockChanges: saved.filter((v) => v.stockDelta !== 0).map((v) => ({ label: v.label, delta: v.stockDelta })),
        } as Prisma.InputJsonValue,
      },
      tx,
    );
  });
  return getAdminProduct(productId);
}

/** Produtos do pódio (destaques) na ordem em que aparecem na loja. */
export async function listPodium() {
  const now = new Date();
  const rows = await prisma.product.findMany({
    where: { isFeatured: true },
    include: productInclude(now),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return { items: rows.map((p) => ({ ...toAdminProduct(p, now), categoryActive: p.category.isActive })) };
}

/**
 * Define o pódio inteiro de uma vez: os produtos listados viram destaque com ordem 0, 1, 2…
 * (a mesma "Ordem de exibição" do catálogo) e os demais destaques deixam de ser.
 */
export async function setPodium(productIds: string[], profileId: string) {
  // Poucas idas ao banco (a API e o banco ficam em regiões diferentes): uma leitura e uma escrita.
  await prisma.$transaction(async (tx) => {
    const rows = await tx.product.findMany({
      where: { OR: [{ id: { in: productIds } }, { isFeatured: true }] },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isFeatured: true },
    });
    const names = new Map(rows.map((p) => [p.id, p.name]));
    if (productIds.some((id) => !names.has(id))) throw notFound('Produto não encontrado.');
    const before = rows.filter((p) => p.isFeatured);
    // Posição = ordem na lista (0, 1, 2…); quem não está na lista deixa de ser destaque.
    await tx.$executeRaw`
      UPDATE products p
         SET is_featured = v.ord IS NOT NULL,
             sort_order = COALESCE(v.ord - 1, p.sort_order),
             updated_at = now()
        FROM products p2
        LEFT JOIN unnest(${productIds}::uuid[]) WITH ORDINALITY AS v(id, ord) ON v.id = p2.id
       WHERE p.id = p2.id AND (p2.is_featured OR v.id IS NOT NULL)`;
    await audit(
      {
        profileId,
        action: 'product.podium',
        entityType: 'product',
        entityId: null,
        metadata: { from: before.map((p) => p.name), to: productIds.map((id) => names.get(id)!) } as Prisma.InputJsonValue,
      },
      tx,
    );
  });
  return listPodium();
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
    .remove(product.images.flatMap(imagePaths))
    .catch(() => undefined);
}

// ---------------- Imagens ----------------

/** Arquivos de uma foto no armazenamento: original e versões leves. */
function imagePaths(img: { storagePath: string; thumbPath: string | null; mediumPath: string | null }) {
  return [img.storagePath, img.thumbPath, img.mediumPath].filter((p): p is string => !!p);
}

/**
 * Gera e envia as versões leves de uma foto. Se a foto não puder ser processada, segue sem elas
 * (a loja usa a original): uma miniatura nunca impede o cadastro da foto.
 */
async function uploadDerived(originalPath: string, data: Buffer) {
  let derived;
  try {
    derived = await buildDerivedImages(data);
  } catch (err) {
    logger.warn({ err, path: originalPath }, 'could not build image variants');
    return { thumbPath: null, mediumPath: null, uploaded: [] as string[] };
  }
  const thumbPath = derivedPath(originalPath, 'thumb');
  const mediumPath = derivedPath(originalPath, 'medium');
  const uploaded: string[] = [];
  try {
    await storage.get().upload(thumbPath, derived.thumb, 'image/webp');
    uploaded.push(thumbPath);
    await storage.get().upload(mediumPath, derived.medium, 'image/webp');
    uploaded.push(mediumPath);
  } catch (err) {
    await storage
      .get()
      .remove(uploaded)
      .catch(() => undefined);
    throw err;
  }
  return { thumbPath, mediumPath, uploaded };
}

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
  const derived = new Map<string, { thumbPath: string | null; mediumPath: string | null }>();
  try {
    for (const item of prepared) {
      await storage.get().upload(item.path, item.file.buffer, item.type.mime);
      uploaded.push(item.path);
      const d = await uploadDerived(item.path, item.file.buffer);
      uploaded.push(...d.uploaded);
      derived.set(item.path, d);
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
            thumbPath: derived.get(item.path)?.thumbPath ?? null,
            mediumPath: derived.get(item.path)?.mediumPath ?? null,
            altText: product.name,
            isPrimary: !hasPrimary && index === 0,
            sortOrder: order++,
            mimeType: item.type.mime,
            sizeBytes: item.file.size,
          },
        });
      }
      await audit({ profileId, action: 'product.images_add', entityType: 'product', entityId: productId, metadata: { count: prepared.length } }, tx);
    });
  } catch (err) {
    await storage
      .get()
      .remove(uploaded)
      .catch(() => undefined);
    throw err;
  }
  return getAdminProduct(productId);
}

export async function updateImage(productId: string, imageId: string, input: { altText?: string | null; isPrimary?: true }, profileId: string) {
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
    .remove(imagePaths(image))
    .catch(() => undefined);
  return getAdminProduct(productId);
}

/**
 * Gera as versões leves das fotos antigas (enviadas antes das miniaturas existirem), em lotes pequenos
 * para não estourar o tempo da requisição. O painel chama de novo enquanto "remaining" for maior que zero.
 */
export async function optimizeImages(limit: number, profileId: string) {
  const pending = await prisma.productImage.findMany({
    where: { thumbPath: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, productId: true, storagePath: true },
  });
  let processed = 0;
  const failed: string[] = [];
  for (const img of pending) {
    try {
      const data = await storage.get().download(img.storagePath);
      const d = await uploadDerived(img.storagePath, data);
      if (!d.thumbPath) {
        failed.push(img.id);
        continue;
      }
      const result = await prisma.productImage.updateMany({
        where: { id: img.id, thumbPath: null },
        data: { thumbPath: d.thumbPath, mediumPath: d.mediumPath },
      });
      // A foto foi excluída (ou já processada) enquanto isso: descarta os arquivos novos.
      if (result.count === 0)
        await storage
          .get()
          .remove(d.uploaded)
          .catch(() => undefined);
      else processed++;
    } catch (err) {
      logger.warn({ err, imageId: img.id }, 'image optimization failed');
      failed.push(img.id);
    }
  }
  const remaining = await prisma.productImage.count({ where: { thumbPath: null } });
  if (processed > 0) {
    await audit({ profileId, action: 'product.images_optimize', entityType: 'product', entityId: null, metadata: { processed, failed: failed.length } });
  }
  return { processed, failed, remaining };
}
