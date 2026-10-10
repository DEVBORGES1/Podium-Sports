import type { Category } from '@prisma/client';
import type { z } from 'zod';
import { audit, diff } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
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
    ...(productCount !== undefined ? { productCount } : {}),
  };
}

export async function listPublicCategories() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });
  return categories.map((c) => toCategoryDto(c, c._count.products));
}

export async function listAdminCategories() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  return categories.map((c) => ({ ...toCategoryDto(c, c._count.products), imagePath: c.imagePath, isActive: c.isActive }));
}

export async function createCategory(input: z.infer<typeof createCategorySchema>, profileId: string) {
  const slug = input.slug ?? slugify(input.name);
  return prisma.$transaction(async (tx) => {
    const created = await tx.category.create({ data: { ...input, slug } });
    await audit({ profileId, action: 'category.create', entityType: 'category', entityId: created.id, metadata: { name: created.name } }, tx);
    return created;
  });
}

export async function updateCategory(id: string, input: z.infer<typeof updateCategorySchema>, profileId: string) {
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw notFound('Categoria não encontrada.');
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.category.update({ where: { id }, data: input });
    if (input.name && input.name !== current.name) {
      // Mantém a busca dos produtos coerente com o novo nome da categoria.
      const products = await tx.product.findMany({ where: { categoryId: id }, select: { id: true, name: true, brand: true } });
      for (const p of products) {
        await tx.product.update({ where: { id: p.id }, data: { searchText: buildProductSearchText(p.name, p.brand, saved.name) } });
      }
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
  const current = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!current) throw notFound('Categoria não encontrada.');
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
