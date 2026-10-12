import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CART_KEY } from '../lib/cart';
import { order, product, whey } from './fixtures';
import { renderStore } from './render';
import { API, server } from './server';

function seedCart(items: { p: ReturnType<typeof product>; q: number }[]) {
  localStorage.setItem(
    CART_KEY,
    JSON.stringify({
      v: 2,
      items: items.map(({ p, q }) => ({
        productId: p.id,
        quantity: q,
        snapshot: { name: p.name, slug: p.slug, priceCents: p.priceCents, regularPriceCents: p.regularPriceCents, imageUrl: null, icon: p.category.icon, categorySlug: p.category.slug, maxQuantity: p.maxQuantity },
      })),
    }),
  );
}

describe('catálogo', () => {
  it('carrega produtos da API com preço promocional e disponibilidade', async () => {
    renderStore('/produtos');
    expect(await screen.findByRole('link', { name: 'Chuteira F50 Messi' })).toBeInTheDocument();
    expect(screen.getByText('-33%')).toBeInTheDocument();
    expect(screen.getByText('2 produtos')).toBeInTheDocument();
  });

  it('filtra por categoria enviando o filtro para a API', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [whey], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      }),
    );
    renderStore('/produtos');
    await userEvent.click(await screen.findByRole('button', { name: 'Suplementos' }));
    await waitFor(() => expect(seen.some((s) => s.includes('category=suplementos'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Suplementos' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mostra estado de busca sem resultados', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 })));
    renderStore('/produtos?q=xyz');
    expect(await screen.findByText(/Nenhum produto encontrado/)).toBeInTheDocument();
  });

  it('mostra erro com opção de tentar novamente', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } }, { status: 500 })));
    renderStore('/produtos');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('produto esgotado não pode ser adicionado', async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ items: [product({ availability: 'OUT_OF_STOCK', maxQuantity: 0 })], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
      ),
    );
    renderStore('/produtos');
    expect(await screen.findByRole('button', { name: 'Chuteira F50 Messi esgotado' })).toBeDisabled();
  });
});

describe('produto e sacola', () => {
  it('adiciona à sacola e atualiza o contador', async () => {
    renderStore('/produtos');
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar Chuteira F50 Messi à sacola' }));
    expect(await screen.findByRole('button', { name: 'Sacola, 1 item' })).toBeInTheDocument();
    expect(screen.getByText('Chuteira F50 Messi na sacola')).toBeInTheDocument();
  });

  it('página do produto respeita a quantidade máxima disponível', async () => {
    server.use(http.get(`${API}/products/:slug`, () => HttpResponse.json({ ...product({ maxQuantity: 2, availability: 'LOW_STOCK' }), related: [] })));
    renderStore('/produto/chuteira-f50-messi');
    expect(await screen.findByRole('heading', { name: 'Chuteira F50 Messi' })).toBeInTheDocument();
    expect(screen.getByText(/Últimas unidades/)).toBeInTheDocument();
    const plus = screen.getByRole('button', { name: 'Aumentar quantidade' });
    await userEvent.click(plus);
    expect(plus).toBeDisabled();
  });

  it('produto inexistente mostra estado de não encontrado', async () => {
    renderStore('/produto/nao-existe');
    expect(await screen.findByText('Produto não encontrado')).toBeInTheDocument();
  });

  it('a sacola usa os totais do servidor e bloqueia itens indisponíveis', async () => {
    seedCart([{ p: product(), q: 3 }]);
    server.use(
      http.post(`${API}/orders/quote`, () =>
        HttpResponse.json({
          lines: [{ productId: product().id, quantity: 3, issue: 'INSUFFICIENT_STOCK', available: false, name: 'Chuteira F50 Messi', unitPriceCents: 39_990, regularUnitPriceCents: 59_900, subtotalCents: 119_970, maxQuantity: 1 }],
          subtotalCents: 0,
          discountCents: 0,
          totalCents: 0,
          canCheckout: false,
        }),
      ),
    );
    renderStore('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sacola, 3 itens' }));
    const drawer = screen.getByRole('dialog', { name: 'Sua sacola' });
    expect(await within(drawer).findByText('Quantidade maior que o estoque disponível.')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Finalizar pedido' })).toBeDisabled();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Ajustar para 1' }));
    expect(within(drawer).getByLabelText('Quantidade de Chuteira F50 Messi')).toHaveTextContent('1');
  });
});

describe('checkout', () => {
  it('valida os campos obrigatórios', async () => {
    seedCart([{ p: whey, q: 1 }]);
    renderStore('/checkout');
    const review = await screen.findByRole('button', { name: /Revisar pedido/ });
    await waitFor(() => expect(review).toBeEnabled());
    await userEvent.click(review);
    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe um telefone com DDD.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Entrega/));
    await userEvent.click(review);
    expect(await screen.findByText('Informe a rua.')).toBeInTheDocument();
  });

  it('envia apenas IDs e quantidades com Idempotency-Key e abre a confirmação com o link do WhatsApp', async () => {
    seedCart([{ p: product(), q: 2 }]);
    let body: Record<string, unknown> | null = null;
    let key: string | null = null;
    server.use(
      http.post(`${API}/orders`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ order: { ...order, fulfillment: 'PICKUP', address: null }, accessToken: 'tok_'.padEnd(43, 'x') }, { status: 201 });
      }),
    );
    renderStore('/checkout');
    await userEvent.type(await screen.findByLabelText('Nome'), 'Maria');
    await userEvent.type(screen.getByLabelText('WhatsApp / telefone'), '49999991234');
    const review = screen.getByRole('button', { name: /Revisar pedido/ });
    await waitFor(() => expect(review).toBeEnabled());
    await userEvent.click(review);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    const link = await screen.findByRole('link', { name: 'Enviar pedido pelo WhatsApp' });
    expect(body).toEqual({
      customer: { name: 'Maria', phone: '(49) 99999-1234' },
      fulfillment: 'PICKUP',
      address: null,
      notes: null,
      items: [{ productId: product().id, quantity: 2 }],
    });
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    const href = link.getAttribute('href')!;
    expect(href.startsWith('https://wa.me/554998090818?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('*Pedido PS-ABC234*');
    expect(screen.getByText('PS-ABC234')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CART_KEY)!).items).toEqual([]);
  });

  it('mostra o erro quando o servidor recusa itens indisponíveis', async () => {
    seedCart([{ p: whey, q: 1 }]);
    server.use(
      http.post(`${API}/orders`, () =>
        HttpResponse.json({ error: { code: 'ITEMS_UNAVAILABLE', message: 'Alguns itens da sacola não estão disponíveis. Revise a sacola.' } }, { status: 422 }),
      ),
    );
    renderStore('/checkout');
    await userEvent.type(await screen.findByLabelText('Nome'), 'Maria');
    await userEvent.type(screen.getByLabelText('WhatsApp / telefone'), '49999991234');
    const review = screen.getByRole('button', { name: /Revisar pedido/ });
    await waitFor(() => expect(review).toBeEnabled());
    await userEvent.click(review);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));
    expect(await screen.findByText(/Alguns itens da sacola não estão disponíveis/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seus dados' })).toBeInTheDocument();
  });

  it('sacola vazia mostra estado vazio', async () => {
    renderStore('/checkout');
    expect(await screen.findByText('Sua sacola está vazia')).toBeInTheDocument();
  });
});

describe('banner da página inicial', () => {
  const banner = {
    id: 'b1',
    kicker: 'Oferta especial',
    title: 'O próximo nível do seu jogo',
    highlight: 'começa aqui',
    subtitle: 'Encontre sua próxima chuteira.',
    footnote: 'Confirme o tamanho pelo WhatsApp.',
    priceOriginalCents: 59_900,
    priceSaleCents: 39_990,
    imageUrl: 'https://storage.test/banners/f.png',
    imageFrame: { desktop: { mode: 'fit', x: 70, y: 50, zoom: 1.2 }, mobile: null },
    imageBg: '#f2f2f2',
    layout: 'split',
    contentAlign: 'left',
    overlay: 0,
    icon: null,
    colorFrom: '#1d4a2c',
    colorTo: '#08140c',
    buttonLabel: 'Quero a minha',
    buttonUrl: '/produto/chuteira-f50-messi',
    secondaryButtonLabel: 'Ver todas as chuteiras',
    secondaryButtonUrl: '/produtos?categoria=chuteiras',
    badgeTop: null,
    badgeMain: null,
    badgeBottom: null,
    sortOrder: 0,
  };

  it('mostra selo, título, preços com desconto e botões com os destinos gerados pela API', async () => {
    server.use(http.get(`${API}/banners`, () => HttpResponse.json({ items: [banner] })));
    renderStore('/');
    const hero = await screen.findByRole('region', { name: 'Destaques da loja' });
    expect(within(hero).getByText('Oferta especial')).toBeInTheDocument();
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent('O próximo nível do seu jogocomeça aqui');
    expect(within(hero).getByText('-33%')).toBeInTheDocument();
    expect(within(hero).getByText('R$ 399,90')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Quero a minha' })).toHaveAttribute('href', '/produto/chuteira-f50-messi');
    expect(within(hero).getByRole('link', { name: 'Ver todas as chuteiras' })).toHaveAttribute('href', '/produtos?categoria=chuteiras');
    expect(within(hero).getByText('Confirme o tamanho pelo WhatsApp.')).toBeInTheDocument();
    expect(hero.querySelector('.slide')).toHaveClass('layout-split');
    expect(document.body.textContent).not.toContain('///');
  });

  it('sem preço original válido não exibe desconto', async () => {
    server.use(http.get(`${API}/banners`, () => HttpResponse.json({ items: [{ ...banner, priceOriginalCents: null, secondaryButtonLabel: null, secondaryButtonUrl: null }] })));
    renderStore('/');
    const hero = await screen.findByRole('region', { name: 'Destaques da loja' });
    expect(within(hero).getByText('R$ 399,90')).toBeInTheDocument();
    expect(within(hero).queryByText(/%$/)).toBeNull();
    expect(within(hero).getAllByRole('link')).toHaveLength(1);
  });
});
