import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import PodiumPage from '../pages/admin/PodiumPage';
import type { StoreContent } from '../types/api';
import { product, settings, whey } from './fixtures';
import { renderStore } from './render';
import { API, server } from './server';

const admin = (p: ReturnType<typeof product>, over: object = {}) => ({
  ...p,
  priceCents: p.regularPriceCents,
  salePriceCents: null,
  effectivePriceCents: p.priceCents,
  categoryId: p.category.id,
  stockQuantity: 5,
  minStock: 1,
  isActive: true,
  sortOrder: 0,
  legacyId: null,
  images: [],
  updatedAt: '2026-01-01T00:00:00Z',
  categoryActive: true,
  ...over,
});

function setup(podium: ReturnType<typeof admin>[]) {
  const puts: string[][] = [];
  const patches: { content: StoreContent }[] = [];
  let current = podium;
  server.use(
    http.get(`${API}/admin/products/podium`, () => HttpResponse.json({ items: current })),
    http.put(`${API}/admin/products/podium`, async ({ request }) => {
      const { productIds } = (await request.json()) as { productIds: string[] };
      puts.push(productIds);
      current = productIds.map((id) => [...podium, admin(whey)].find((p) => p.id === id)!);
      return HttpResponse.json({ items: current });
    }),
    http.get(`${API}/admin/dashboard/top-products`, () =>
      HttpResponse.json({ period: { from: '', to: '', timezone: '' }, criteria: '', items: [{ productId: whey.id, name: whey.name, quantity: 7, valueCents: 1000, orders: 3 }] }),
    ),
    http.get(`${API}/admin/store/settings`, () => HttpResponse.json(settings)),
    http.patch(`${API}/admin/store/settings`, async ({ request }) => {
      const body = (await request.json()) as { content: StoreContent };
      patches.push(body);
      return HttpResponse.json({ ...settings, content: body.content });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <PodiumPage /> }]);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { puts, patches };
}

describe('tela Pódio do painel', () => {
  it('coloca um dos mais pedidos no pódio e reordena', async () => {
    const user = userEvent.setup();
    const { puts } = setup([admin(product())]);
    const top = await screen.findByRole('region', { name: /Mais pedidos da semana/ });
    await user.click(await within(top).findByRole('button', { name: 'Colocar no pódio' }));
    await waitFor(() => expect(puts).toEqual([[product().id, whey.id]]));
    expect(await within(top).findByText('No pódio')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: `Subir ${whey.name} para o 1º lugar` }));
    await waitFor(() => expect(puts.at(-1)).toEqual([whey.id, product().id]));
  });

  it('mostra a nova ordem na hora e envia cliques seguidos em fila, na ordem', async () => {
    const user = userEvent.setup();
    const camisa = admin(product({ id: '33333333-3333-4333-8333-333333333333', slug: 'camisa', name: 'Camisa Podium' }));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const puts: string[][] = [];
    setup([admin(product()), admin(whey), camisa]);
    server.use(
      http.put(`${API}/admin/products/podium`, async ({ request }) => {
        const { productIds } = (await request.json()) as { productIds: string[] };
        puts.push(productIds);
        await gate;
        return HttpResponse.json({ items: productIds.map((id) => [admin(product()), admin(whey), camisa].find((p) => p.id === id)) });
      }),
    );
    const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent);

    await user.click(await screen.findByRole('button', { name: 'Subir Camisa Podium para o 2º lugar' }));
    await user.click(screen.getByRole('button', { name: 'Subir Camisa Podium para o 1º lugar' }));
    // Já na tela antes de a API responder; a segunda gravação espera a primeira.
    expect(names().slice(0, 3)).toEqual(['Camisa Podium', 'Chuteira F50 Messi', whey.name]);
    await waitFor(() => expect(puts).toHaveLength(1));
    release();
    await waitFor(() => expect(puts).toEqual([[product().id, camisa.id, whey.id], [camisa.id, product().id, whey.id]]));
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Camisa Podium', 'Chuteira F50 Messi', whey.name]));
  });

  it('avisa quando o produto do pódio não aparece na loja', async () => {
    setup([admin(product(), { isActive: false })]);
    expect(await screen.findByText('Produto inativo: não aparece na loja.')).toBeInTheDocument();
  });

  it('salva os textos sem perder o resto do conteúdo', async () => {
    const user = userEvent.setup();
    const { patches } = setup([]);
    const title = await screen.findByLabelText('Título');
    await waitFor(() => expect(title).toHaveValue('Pódio da semana'));
    await user.clear(title);
    await user.type(title, 'Campeões de venda');
    await user.click(screen.getByRole('button', { name: 'Salvar textos' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.content.podium).toEqual({ enabled: true, title: 'Campeões de venda', text: 'Os mais pedidos pelo WhatsApp.' });
    expect(patches[0]!.content.cartNote).toBe(settings.content.cartNote);
  });
});

describe('pódio na loja', () => {
  it('usa os textos das configurações', async () => {
    server.use(http.get(`${API}/store/settings`, () => HttpResponse.json({ ...settings, content: { ...settings.content, podium: { enabled: true, title: 'Campeões de venda', text: 'Escolhidos a dedo.' } } })));
    renderStore('/');
    expect(await screen.findByRole('heading', { name: 'Campeões de venda' })).toBeInTheDocument();
    expect(screen.getByText('Escolhidos a dedo.')).toBeInTheDocument();
  });

  it('some quando desativado', async () => {
    server.use(http.get(`${API}/store/settings`, () => HttpResponse.json({ ...settings, content: { ...settings.content, podium: { ...settings.content.podium, enabled: false } } })));
    renderStore('/');
    await screen.findByRole('region', { name: 'Vantagens' });
    expect(screen.queryByRole('heading', { name: 'Pódio da semana' })).not.toBeInTheDocument();
  });
});
