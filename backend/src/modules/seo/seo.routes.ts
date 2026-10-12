import { Router } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Gera o sitemap da loja: páginas fixas, categorias e produtos ativos. */
export async function buildSitemap(siteUrl: string) {
  const base = siteUrl.replace(/\/$/, '');
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.product.findMany({
      where: { isActive: true, category: { isActive: true } },
      select: { slug: true, updatedAt: true },
      orderBy: { name: 'asc' },
      take: 5000,
    }),
  ]);
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/produtos`, priority: '0.8' },
    { loc: `${base}/produtos?ofertas=1`, priority: '0.7' },
    ...categories.map((c) => ({ loc: `${base}/produtos?categoria=${encodeURIComponent(c.slug)}`, lastmod: c.updatedAt, priority: '0.7' })),
    ...products.map((p) => ({ loc: `${base}/produto/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt, priority: '0.6' })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escapeXml(u.loc)}</loc>${'lastmod' in u && u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const publicSeoRouter = Router();
publicSeoRouter.get('/sitemap.xml', async (_req, res) => {
  const xml = await buildSitemap(env.ADMIN_APP_URL ?? 'http://localhost:5173');
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(xml);
});
