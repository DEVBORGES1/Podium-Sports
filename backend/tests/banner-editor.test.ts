import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createAdmin, createCategory, createProduct, makeApp, resetDb, type AdminCtx } from './helpers.js';

const app = makeApp();
let admin: AdminCtx;

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});

const create = (body: object) =>
  api(app)
    .post('/api/v1/admin/banners')
    .set('Authorization', admin.auth)
    .send({ title: 'Oferta', ...body });
const patch = (id: string, body: object) => api(app).patch(`/api/v1/admin/banners/${id}`).set('Authorization', admin.auth).send(body);
const publicBanners = async () => (await api(app).get('/api/v1/banners')).body.items as Record<string, unknown>[];

describe('banners: destinos escolhidos no painel', () => {
  it('gera o endereço a partir do produto e da categoria cadastrados (slug atual)', async () => {
    const category = await createCategory({ name: 'Chuteiras', slug: 'chuteiras' });
    const product = await createProduct({ name: 'Chuteira F50', categoryId: category.id });
    const res = await create({
      buttonLabel: 'Quero a minha',
      buttonTarget: { type: 'product', productId: product.id },
      secondaryButtonLabel: 'Ver chuteiras',
      secondaryButtonTarget: { type: 'category', categoryId: category.id },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      buttonUrl: `/produto/${product.slug}`,
      buttonTarget: { type: 'product', productId: product.id },
      buttonInfo: { description: 'Produto: Chuteira F50', issue: null },
      secondaryButtonUrl: '/produtos?categoria=chuteiras',
      secondaryButtonInfo: { description: 'Categoria: Chuteiras', issue: null },
    });

    // Slug alterado depois: o botão acompanha sem editar o banner.
    await prisma.product.update({ where: { id: product.id }, data: { slug: 'chuteira-f50-nova' } });
    const [pub] = await publicBanners();
    expect(pub).toMatchObject({ buttonUrl: '/produto/chuteira-f50-nova', buttonLabel: 'Quero a minha', secondaryButtonUrl: '/produtos?categoria=chuteiras' });
  });

  it('produto desativado ou excluído: o botão sai da loja e o painel avisa', async () => {
    const product = await createProduct();
    const { body } = await create({ buttonLabel: 'Comprar', buttonTarget: { type: 'product', productId: product.id } });

    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    expect((await publicBanners())[0]).toMatchObject({ buttonUrl: null, buttonLabel: null, title: 'Oferta' });
    let list = await api(app).get('/api/v1/admin/banners').set('Authorization', admin.auth);
    expect(list.body.items[0].buttonInfo.issue).toBe('PRODUCT_INACTIVE');

    await prisma.product.delete({ where: { id: product.id } });
    list = await api(app).get('/api/v1/admin/banners').set('Authorization', admin.auth);
    expect(list.body.items[0]).toMatchObject({ buttonLabel: 'Comprar', buttonInfo: { issue: 'PRODUCT_REMOVED' } });

    // Salvar de novo apontando para o produto excluído é recusado com o campo indicado.
    const again = await patch(body.id, { buttonTarget: { type: 'product', productId: product.id } });
    expect(again.status).toBe(422);
    expect(again.body.error.details[0].field).toBe('buttonTarget');
  });

  it('páginas internas, link externo e WhatsApp com mensagem inicial', async () => {
    const page = await create({ buttonLabel: 'Ofertas', buttonTarget: { type: 'page', page: 'offers' } });
    expect(page.body.buttonUrl).toBe('/produtos?ofertas=1');

    const ext = await create({ buttonLabel: 'Instagram', buttonTarget: { type: 'external', url: 'https://instagram.com/podium' } });
    expect(ext.body.buttonUrl).toBe('https://instagram.com/podium');

    const wa = await create({ buttonLabel: 'Falar no WhatsApp', buttonTarget: { type: 'whatsapp', message: 'Quero a chuteira F50' } });
    expect(wa.status).toBe(201);
    expect(wa.body.buttonUrl).toMatch(/^https:\/\/wa\.me\/\d+\?text=Quero%20a%20chuteira%20F50$/);
  });

  it('valida destinos no servidor', async () => {
    const bad = [
      { type: 'external', url: 'http://inseguro.com' },
      { type: 'external', url: 'javascript:alert(1)' },
      { type: 'external', url: 'https://' },
      { type: 'product', productId: 'nao-e-uuid' },
      { type: 'page', page: 'admin' },
      { type: 'script', url: '/x' },
    ];
    for (const target of bad) expect((await create({ buttonLabel: 'Ir', buttonTarget: target })).status, JSON.stringify(target)).toBe(400);
    const missing = await create({ buttonLabel: 'Ir', buttonTarget: { type: 'category', categoryId: '00000000-0000-4000-8000-000000000000' } });
    expect(missing.status).toBe(422);
    // Texto sem destino (e vice-versa) continua bloqueado.
    expect((await create({ buttonTarget: { type: 'page', page: 'home' } })).status).toBe(400);
  });

  it('botão secundário desligado some da loja sem perder a configuração', async () => {
    const { body } = await create({ secondaryButtonLabel: 'Ver todas', secondaryButtonTarget: { type: 'page', page: 'catalog' } });
    expect((await publicBanners())[0]!.secondaryButtonUrl).toBe('/produtos');

    const off = await patch(body.id, { secondaryButtonEnabled: false });
    expect(off.body).toMatchObject({
      secondaryButtonEnabled: false,
      secondaryButtonLabel: 'Ver todas',
      secondaryButtonTarget: { type: 'page', page: 'catalog' },
    });
    expect((await publicBanners())[0]).toMatchObject({ secondaryButtonUrl: null, secondaryButtonLabel: null });

    // Desligado, pode ficar incompleto; ao religar, volta a exigir texto e destino.
    expect((await patch(body.id, { secondaryButtonLabel: null })).status).toBe(200);
    expect((await patch(body.id, { secondaryButtonEnabled: true })).status).toBe(422);
    const on = await patch(body.id, { secondaryButtonEnabled: true, secondaryButtonLabel: 'Ver todas' });
    expect(on.status).toBe(200);
    expect((await publicBanners())[0]!.secondaryButtonUrl).toBe('/produtos');
  });
});

describe('banners: compatibilidade com links antigos', () => {
  it('banners com caminho digitado continuam funcionando e o painel converte para o seletor', async () => {
    const category = await createCategory({ slug: 'chuteiras' });
    const product = await createProduct({ categoryId: category.id });
    const legacy = await prisma.banner.create({
      data: {
        title: 'Chuteira',
        buttonLabel: 'Quero a minha',
        buttonUrl: `/produto/${product.slug}`,
        secondaryButtonLabel: 'Ver chuteiras',
        secondaryButtonUrl: '/produtos?categoria=chuteiras',
      },
    });
    const [pub] = await publicBanners();
    expect(pub).toMatchObject({
      buttonUrl: `/produto/${product.slug}`,
      secondaryButtonUrl: '/produtos?categoria=chuteiras',
      layout: 'full',
      overlay: 85,
      imageFrame: null,
    });

    const list = await api(app).get('/api/v1/admin/banners').set('Authorization', admin.auth);
    expect(list.body.items[0]).toMatchObject({
      id: legacy.id,
      buttonTarget: { type: 'product', productId: product.id },
      secondaryButtonTarget: { type: 'category', categoryId: category.id },
    });
  });

  it('caminho antigo sem correspondência fica como está e é sinalizado', async () => {
    await prisma.banner.create({ data: { title: 'Busca', buttonLabel: 'Ver', buttonUrl: '/produtos?q=messi' } });
    expect((await publicBanners())[0]!.buttonUrl).toBe('/produtos?q=messi');
    const list = await api(app).get('/api/v1/admin/banners').set('Authorization', admin.auth);
    expect(list.body.items[0]).toMatchObject({ buttonTarget: null, buttonUrl: '/produtos?q=messi', buttonInfo: { issue: 'LEGACY_LINK' } });
  });

  it('editar outros campos não altera o link antigo', async () => {
    const b = await prisma.banner.create({ data: { title: 'Antigo', buttonLabel: 'Ver', buttonUrl: '/produtos?q=messi' } });
    const res = await patch(b.id, { title: 'Novo título' });
    expect(res.body).toMatchObject({ title: 'Novo título', buttonUrl: '/produtos?q=messi' });
  });
});

describe('banners: conteúdo comercial e imagem', () => {
  it('preços: original precisa ser maior que o promocional; ocultar preços não apaga os valores', async () => {
    expect((await create({ priceOriginalCents: 39_990, priceSaleCents: 59_900 })).status).toBe(400);
    expect((await create({ priceOriginalCents: 0 })).status).toBe(400);
    const { body } = await create({
      kicker: 'Oferta especial',
      priceOriginalCents: 59_900,
      priceSaleCents: 39_990,
      footnote: 'Confirme o tamanho pelo WhatsApp.',
    });
    expect((await publicBanners())[0]).toMatchObject({
      kicker: 'Oferta especial',
      priceOriginalCents: 59_900,
      priceSaleCents: 39_990,
      footnote: 'Confirme o tamanho pelo WhatsApp.',
    });

    // Edição parcial também confere o par de preços.
    expect((await patch(body.id, { priceSaleCents: 70_000 })).status).toBe(422);

    const hidden = await patch(body.id, { showPrices: false, showKicker: false });
    expect(hidden.body).toMatchObject({ priceOriginalCents: 59_900, priceSaleCents: 39_990, kicker: 'Oferta especial' });
    expect((await publicBanners())[0]).toMatchObject({ kicker: null, priceOriginalCents: null, priceSaleCents: null });
  });

  it('salva layout e enquadramento por dispositivo; rejeita valores fora da faixa', async () => {
    const imageFrame = { desktop: { mode: 'fit', x: 72.345, y: 40, zoom: 1.25 }, mobile: { mode: 'fill', x: 50, y: 30, zoom: 1 } };
    const res = await create({ layout: 'split', contentAlign: 'right', overlay: 20, imageBg: '#f2f2f2', imageFrame });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      layout: 'split',
      contentAlign: 'right',
      overlay: 20,
      imageBg: '#f2f2f2',
      imageFrame: { desktop: { x: 72.35, zoom: 1.25 }, mobile: { mode: 'fill' } },
    });
    expect((await publicBanners())[0]!.imageFrame).toEqual({
      desktop: { mode: 'fit', x: 72.35, y: 40, zoom: 1.25 },
      mobile: { mode: 'fill', x: 50, y: 30, zoom: 1 },
    });

    const id = res.body.id;
    for (const body of [
      { imageFrame: { desktop: { mode: 'fill', x: 120, y: 0, zoom: 1 }, mobile: null } },
      { imageFrame: { desktop: { mode: 'stretch', x: 0, y: 0, zoom: 1 }, mobile: null } },
      { imageFrame: { desktop: { mode: 'fill', x: 0, y: 0, zoom: 0.5 }, mobile: null } },
      { layout: 'grid' },
      { overlay: 95 },
      { imageBg: 'red' },
    ]) {
      expect((await patch(id, body)).status, JSON.stringify(body)).toBe(400);
    }
    // Remover a foto mantém o restante da configuração.
    const cleared = await patch(id, { imagePath: null });
    expect(cleared.body).toMatchObject({ layout: 'split', imageFrame: { desktop: { mode: 'fit' } } });
  });
});

describe('banners: foto exclusiva do celular', () => {
  const desktop = 'banners/11111111-1111-4111-8111-111111111111.jpg';
  const mobile = 'banners/22222222-2222-4222-8222-222222222222.webp';

  it('salva e publica a foto do celular com enquadramento e cor próprios', async () => {
    const res = await create({
      imagePath: desktop,
      mobileImagePath: mobile,
      mobileImageBg: '#ffffff',
      layout: 'full',
      imageFrame: { desktop: { mode: 'fill', x: 70, y: 50, zoom: 1 }, mobile: { mode: 'fit', x: 50, y: 40, zoom: 1.2 } },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ imagePath: desktop, mobileImagePath: mobile, mobileImageBg: '#ffffff' });
    const [pub] = await publicBanners();
    expect(pub!.imageUrl).toContain(desktop);
    expect(pub!.mobileImageUrl).toContain(mobile);
    expect(pub!.mobileImageBg).toBe('#ffffff');
    expect(pub).not.toHaveProperty('mobileImagePath'); // a loja recebe só a URL pública
  });

  it('banner sem foto de celular continua usando a principal (campo nulo)', async () => {
    const res = await create({ imagePath: desktop });
    expect(res.body.mobileImagePath).toBeNull();
    const [pub] = await publicBanners();
    expect(pub!.mobileImageUrl).toBeNull();
  });

  it('remover a foto do celular volta a usar a principal; caminho inválido é recusado', async () => {
    const { body } = await create({ imagePath: desktop, mobileImagePath: mobile });
    expect((await patch(body.id, { mobileImagePath: 'https://evil.example/x.jpg' })).status).toBe(400);
    expect((await patch(body.id, { mobileImagePath: 'products/22222222-2222-4222-8222-222222222222.jpg' })).status).toBe(400);
    const cleared = await patch(body.id, { mobileImagePath: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.mobileImagePath).toBeNull();
    expect((await prisma.banner.findUniqueOrThrow({ where: { id: body.id } })).imagePath).toBe(desktop);
  });

  it('foto do celular exige a foto principal', async () => {
    const res = await create({ mobileImagePath: mobile });
    expect(res.status).toBe(400);
    const { body } = await create({ imagePath: desktop, mobileImagePath: mobile });
    const removed = await patch(body.id, { imagePath: null });
    expect(removed.status).toBe(422);
    expect(removed.body.error.details[0].field).toBe('mobileImagePath');
    expect((await patch(body.id, { imagePath: null, mobileImagePath: null })).status).toBe(200);
  });
});

describe('banners: formato e escurecimento independentes por dispositivo', () => {
  it('foto de fundo no computador e produto ao lado do texto no celular, mantidos após editar o computador', async () => {
    const res = await create({ layout: 'full', overlay: 55, mobileLayout: 'split', mobileOverlay: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ layout: 'full', overlay: 55, mobileLayout: 'split', mobileOverlay: 0 });
    expect((await publicBanners())[0]).toMatchObject({ layout: 'full', overlay: 55, mobileLayout: 'split', mobileOverlay: 0 });

    // Mudar o computador não mexe no celular (e vice-versa).
    const desktopOnly = await patch(res.body.id, { layout: 'split', overlay: 10 });
    expect(desktopOnly.body).toMatchObject({ layout: 'split', overlay: 10, mobileLayout: 'split', mobileOverlay: 0 });
    const mobileOnly = await patch(res.body.id, { mobileLayout: 'full', mobileOverlay: 40 });
    expect(mobileOnly.body).toMatchObject({ layout: 'split', overlay: 10, mobileLayout: 'full', mobileOverlay: 40 });
    const saved = await prisma.banner.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved).toMatchObject({ layout: 'split', overlay: 10, mobileLayout: 'full', mobileOverlay: 40 });
  });

  it('banners antigos (sem configuração do celular) repetem o formato e o escurecimento do computador', async () => {
    const { body } = await create({ layout: 'full', overlay: 70 });
    expect(await prisma.banner.findUniqueOrThrow({ where: { id: body.id } })).toMatchObject({ mobileLayout: null, mobileOverlay: null });
    expect(body).toMatchObject({ mobileLayout: 'full', mobileOverlay: 70 });
    expect((await publicBanners())[0]).toMatchObject({ layout: 'full', mobileLayout: 'full', mobileOverlay: 70 });
  });

  it('rejeita formato ou escurecimento inválido para o celular', async () => {
    const { body } = await create({});
    for (const input of [{ mobileLayout: 'grid' }, { mobileOverlay: 95 }, { mobileOverlay: -1 }, { mobileOverlay: 12.5 }]) {
      expect((await patch(body.id, input)).status, JSON.stringify(input)).toBe(400);
    }
  });
});
