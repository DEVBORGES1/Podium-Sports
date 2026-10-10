/**
 * Carga inicial idempotente com os dados do site original.
 * Só cria o que não existe: reexecutar não sobrescreve alterações feitas pelo painel.
 *
 *   npm run db:seed
 *   SEED_DEFAULT_STOCK=0 npm run db:seed   # importa todos os produtos sem estoque
 */
import { PrismaClient } from '@prisma/client';
import { buildProductSearchText, slugify } from '../src/lib/text.js';
import { contentSchema } from '../src/modules/settings/settings.schemas.js';
import { DEFAULT_SETTINGS } from '../src/modules/settings/settings.service.js';
import { BANNERS, CATEGORIES, FEATURED_LEGACY_IDS, PRODUCTS, guessBrand } from './seed-data.js';

const prisma = new PrismaClient();
const DEFAULT_STOCK = Number(process.env.SEED_DEFAULT_STOCK ?? 10);
const DEFAULT_MIN_STOCK = 2;

async function main() {
  if (!Number.isInteger(DEFAULT_STOCK) || DEFAULT_STOCK < 0) throw new Error('SEED_DEFAULT_STOCK inválido');

  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_SETTINGS, content: contentSchema.parse({}) },
  });

  const categoryIds = new Map<string, { id: string; name: string }>();
  for (const [index, c] of CATEGORIES.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { ...c, sortOrder: index },
    });
    categoryIds.set(c.slug, { id: category.id, name: category.name });
  }

  let created = 0;
  const usedSlugs = new Set((await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug));
  for (const [index, [name, categorySlug, price, from]] of PRODUCTS.entries()) {
    const legacyId = index + 1;
    if (await prisma.product.findUnique({ where: { legacyId } })) continue;
    const category = categoryIds.get(categorySlug)!;
    let slug = slugify(name);
    for (let i = 2; usedSlugs.has(slug); i++) slug = `${slugify(name)}-${i}`;
    usedSlugs.add(slug);

    // "de" (preço anterior) vira o preço cheio; o preço exibido vira o preço promocional.
    const priceCents = Math.round((from ?? price) * 100);
    const salePriceCents = from ? Math.round(price * 100) : null;
    const featuredIndex = FEATURED_LEGACY_IDS.indexOf(legacyId);
    const brand = guessBrand(name);

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          legacyId,
          name,
          slug,
          brand,
          priceCents,
          salePriceCents,
          categoryId: category.id,
          stockQuantity: DEFAULT_STOCK,
          minStock: DEFAULT_MIN_STOCK,
          isFeatured: featuredIndex >= 0,
          sortOrder: featuredIndex >= 0 ? featuredIndex : 100 + index,
          searchText: buildProductSearchText(name, brand, category.name),
        },
      });
      if (DEFAULT_STOCK > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            type: 'INITIAL',
            quantity: DEFAULT_STOCK,
            balanceBefore: 0,
            balanceAfter: DEFAULT_STOCK,
            reason: 'Carga inicial da importação do catálogo — ajuste com a contagem real',
          },
        });
      }
    });
    created++;
  }

  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.createMany({ data: BANNERS.map((b, i) => ({ ...b, sortOrder: i })) });
  }

  console.log(`Seed concluído: ${CATEGORIES.length} categorias, ${created} produtos novos, banners e configurações.`);
  if (created > 0) {
    console.warn(
      `ATENÇÃO: os produtos importados receberam estoque provisório de ${DEFAULT_STOCK} unidade(s). ` +
        'Ajuste o saldo real em /admin/inventory antes de divulgar a loja.',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
