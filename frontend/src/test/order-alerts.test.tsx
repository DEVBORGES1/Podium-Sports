import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { OrderAlertsProvider, useOrderAlerts } from '../contexts/OrderAlertsContext';
import { ToastProvider } from '../contexts/ToastContext';
import type { LiveOrder } from '../lib/order-alerts';
import { API, server } from './server';

const live = (recentOrders: LiveOrder[], pending: number, lastChangeAt = '2026-10-12T10:00:00.000Z') => ({
  serverTime: new Date().toISOString(),
  counts: { PENDING: pending, ACCEPTED: 0, PROCESSING: 0, READY: 0, OUT_FOR_DELIVERY: 0, COMPLETED: 0, CANCELLED: 0, EXPIRED: 0 },
  lastChangeAt,
  recentOrders,
});
const o = (id: string, status = 'PENDING'): LiveOrder => ({ id, code: `PS-${id}`, customerName: 'Maria Souza', fulfillment: 'DELIVERY', totalCents: 15990, status, createdAt: new Date().toISOString() });

function Probe() {
  const a = useOrderAlerts();
  return (
    <div>
      <span data-testid="connection">{a.connection}</span>
      <span data-testid="pending">{a.counts?.PENDING ?? '-'}</span>
      <span data-testid="alert">{a.alert ? `${a.alert.orders.map((x) => x.code).join(',')}|reconnect=${a.alert.afterReconnect}` : 'none'}</span>
      <span data-testid="new">{[...a.newOrderIds].join(',')}</span>
      <button type="button" onClick={a.refresh}>
        consultar
      </button>
      <button type="button" onClick={a.dismissAlert}>
        fechar
      </button>
    </div>
  );
}

function setup(responses: (() => Response)[]) {
  const seen: string[] = [];
  let i = 0;
  server.use(
    http.get(`${API}/admin/orders/live`, ({ request }) => {
      seen.push(new URL(request.url).searchParams.get('since') ?? '');
      const r = responses[Math.min(i, responses.length - 1)]!;
      i++;
      return r();
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <OrderAlertsProvider>
          <Probe />
        </OrderAlertsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const poll = async (expectedCalls: number) => {
    await act(async () => screen.getByText('consultar').click());
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(expectedCalls));
  };
  return { seen, poll };
}

describe('monitor de pedidos do painel', () => {
  it('não avisa pedidos que já existiam ao abrir o painel; avisa o novo uma única vez', async () => {
    const { seen, poll } = setup([
      () => HttpResponse.json(live([o('OLD1')], 1)),
      () => HttpResponse.json(live([o('OLD1'), o('NEW1')], 2, '2026-10-12T10:01:00.000Z')),
      () => HttpResponse.json(live([o('OLD1'), o('NEW1')], 2, '2026-10-12T10:01:00.000Z')),
    ]);
    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('online'));
    expect(screen.getByTestId('alert')).toHaveTextContent('none');
    expect(screen.getByTestId('pending')).toHaveTextContent('1');
    expect(seen[0]).toBe(''); // primeira consulta sem "since"

    await poll(2);
    await waitFor(() => expect(screen.getByTestId('alert')).toHaveTextContent('PS-NEW1|reconnect=false'));
    expect(seen[1]).not.toBe(''); // usa o horário do servidor da consulta anterior
    expect(screen.getByTestId('new')).toHaveTextContent('NEW1');
    expect(screen.getByTestId('pending')).toHaveTextContent('2');

    await act(async () => screen.getByText('fechar').click());
    await poll(3);
    // A mesma resposta (sobreposição) não gera um segundo aviso.
    expect(screen.getByTestId('alert')).toHaveTextContent('none');
    expect(JSON.parse(localStorage.getItem('podium.admin.alertedOrders') ?? '{}')).toHaveProperty('NEW1');
  });

  it('mostra a queda de conexão e, ao voltar, avisa só os pedidos que chegaram no intervalo', async () => {
    const { poll } = setup([
      () => HttpResponse.json(live([o('A')], 1)),
      () => HttpResponse.error(),
      () => HttpResponse.json(live([o('A'), o('B'), o('C', 'ACCEPTED')], 2, '2026-10-12T10:05:00.000Z')),
    ]);
    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('online'));
    await poll(2);
    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('offline'));
    await poll(3);
    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('online'));
    // C já foi aceito por outra pessoa: não toca. Só B é avisado, marcado como chegado durante a queda.
    expect(screen.getByTestId('alert')).toHaveTextContent('PS-B|reconnect=true');
  });
});
