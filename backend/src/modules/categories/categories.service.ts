import type { Category } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { mediaUrl, storage } from '../../lib/storage.js';
import { buildProductSearchText, slugify } from '../../lib/text.js';
import type { createCategorySchema, updateCategorySchema } from './categories.schemas.js';

export function toCategoryDto(c: Category, productCount?: number) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon: c.icon,
    colorFrom: c.colorFrom,
    colorTo: c.colorTo,
    imageUrl: mediaUrl(c.imagePath),
    sortOrder: c.sortOrder,
    showOnHome: c.showOnHome,
    /** Nula = categoria principal; preenchida = subcategoria. */
    parentId: c.parentId,
    ...(productCount !== undefined ? { productCount } : {}),
  };
}

/** Contagem que a loja mostra: a categoria principal soma os produtos das suas subcategorias. */
function withTreeCounts<T extends Category & { _count: { products: number } }>(categories: T[]) {
  const childTotals = new Map<string, number>();
  for (const c of categories) {
    if (c.parentId) childTotals.set(c.parentId, (childTotals.get(c.parentId) ?? 0) + c._count.products);
  }
  return categories.map((c) => ({ category: c, count: c._count.products + (childTotals.get(c.id) ?? 0) }));
}

export async function listPublicCategories() {
  const categories = await prisma.category.findMany({
    // Subcategoria de uma categoria desativada também some da loja.
    where: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });
  return withTreeCounts(categories).map(({ category, count }) => toCategoryDto(category, count));
}

export async function listAdminCategories() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true, children: true } } },
  });
  return categories.map((c) => ({
    ...toCategoryDto(c, c._count.products),
    imagePath: c.imagePath,
    isActive: c.isActive,
    childCount: c._count.children,
  }));
}

/** Subcategoria só pode ficar dentro de uma categoria principal (um nível) e nunca dentro de si mesma. */
async function validateParent(tx: Tx, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw unprocessable('Uma categoria não pode estar dentro dela mesma.', [{ field: 'parentId', message: 'Escolha outra categoria.' }]);
  const parent = await tx.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
  if (!parent) throw unprocessable('Categoria-mãe inexistente.', [{ field: 'parentId', message: 'Categoria inexistente.' }]);
  if (parent.parentId) {
    throw unprocessable('Escolha uma categoria principal: subcategorias não podem ter subcategorias.', [
      { field: 'parentId', message: 'Escolha uma categoria principal.' },
    ]);
  }
  if (selfId && (await tx.category.count({ where: { parentId: selfId } })) > 0) {
    throw unprocessable('Esta categoria tem subcategorias e não pode virar subcategoria.', [
      { field: 'parentId', message: 'Mova as subcategorias antes.' },
    ]);
  }
}

/** A busca dos produtos inclui o nome da categoria (e da mãe): mantém o texto coerente após mudanças. */
async function refreshSearchText(tx: Tx, categoryIds: string[]) {
  const products = await tx.product.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true, name: true, brand: true, category: { select: { name: true, parent: { select: { name: true } } } } },
  });
  for (const p of products) {
    const label = p.category.parent ? `${p.category.parent.name} ${p.category.name}` : p.category.name;
    await tx.product.update({ where: { id: p.id }, data: { searchText: buildProductSearchText(p.name, p.brand, label) } });
  }
}

export async function createCategory(input: z.infer<typeof createCategorySchema>, profileId: string) {
  const slug = input.slug ?? slugify(input.name);
  return prisma.$transaction(async (tx) => {
    await validateParent(tx, input.parentId);
    const created = await tx.category.create({ data: { ...input, slug } });
    await audit({ profileId, action: 'category.create', entityType: 'category', entityId: created.id, metadata: { name: created.name } }, tx);
    return created;
  });
}

export async function updateCategory(id: string, input: z.infer<typeof updateCategorySchema>, profileId: string) {
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw notFound('Categoria não encontrada.');
  const updated = await prisma.$transaction(async (tx) => {
    if (input.parentId !== undefined) await validateParent(tx, input.parentId, id);
    const saved = await tx.category.update({ where: { id }, data: input });
    const renamed = input.name !== undefined && input.name !== current.name;
    const moved = input.parentId !== undefined && input.parentId !== current.parentId;
    if (renamed || moved) {
      // Produtos desta categoria e, se ela é principal, os das subcategorias (o nome da mãe entra na busca).
      const children = await tx.category.findMany({ where: { parentId: id }, select: { id: true } });
      await refreshSearchText(tx, [id, ...children.map((c) => c.id)]);
    }
    await audit(
      { profileId, action: 'category.update', entityType: 'category', entityId: id, metadata: diff(current, input) as object },
      tx,
    );
    return saved;
  });
  if (current.imagePath && current.imagePath !== updated.imagePath) {
    await storage.get().remove([current.imagePath]).catch(() => undefined);
  }
  return updated;
}

export async function deleteCategory(id: string, profileId: string) {
  const current = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!current) throw notFound('Categoria não encontrada.');
  if (current._count.children > 0) {
    throw conflict(
      `A categoria possui ${current._count.children} subcategoria(s). Exclua ou mova as subcategorias antes.`,
      { childCount: current._count.children },
      'CATEGORY_HAS_CHILDREN',
    );
  }
  if (current._count.products > 0) {
    throw conflict(
      `A categoria possui ${current._count.products} produto(s). Mova-os para outra categoria ou desative a categoria.`,
      { productCount: current._count.products },
      'CATEGORY_IN_USE',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id } });
    await audit({ profileId, action: 'category.delete', entityType: 'category', entityId: id, metadata: { name: current.name } }, tx);
  });
  if (current.imagePath) await storage.get().remove([current.imagePath]).catch(() => undefined);
}
