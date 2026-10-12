// Gera public/og-image.jpg (1200×630) a partir de og-card.html.
// Uso: node scripts/og/render.mjs   (requer o Chromium do Playwright)
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${here('./og-card.html')}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: here('../../public/og-image.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
console.log('public/og-image.jpg gerado');
