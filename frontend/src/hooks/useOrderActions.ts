import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrderAlerts } from '../contexts/OrderAlertsContext';
import { useToast } from '../contexts/ToastContext';
import { adminApi, ApiError, errorMessage } from '../lib/api';
import { orderStatusToast } from '../lib/labels';
import { refreshQueries } from '../lib/query';
import type { AdminOrder, OrderMessageEntry } from '../types/admin';
import type { Fulfillment, OrderStatus } from '../types/api';

export interface StatusChange {
  id: string;
  code: string;
  fulfillment: Fulfillment;
  /** Status exibido na tela no momento do clique (o servidor recusa se o pedido já mudou). */
  from: OrderStatus;
  to: OrderStatus;
  note?: string | null;
}

/**
 * Mudança de status persistida no servidor. A tela só muda depois da resposta (nada de atualização
 * "otimista"); em conflito, recarrega o pedido para mostrar o estado real do banco.
 */
export function useChangeOrderStatus(options: { onSaved?: (order: AdminOrder, change: StatusChange) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { refresh } = useOrderAlerts();
  return useMutation({
    mutationFn: (c: StatusChange) => adminApi.patch<AdminOrder>(`/orders/${c.id}/status`, { status: c.to, expectedStatus: c.from, note: c.note ?? null }),
    onSuccess: (order, change) => {
      qc.setQueryData(['admin', 'order', order.id], order);
      refreshQueries(qc, [['admin', 'orders'], ['admin', 'dashboard']]);
      // Cancelar devolve o estoque: saldos, movimentações e a loja precisam refletir.
      if (change.to === 'CANCELLED') refreshQueries(qc, [['admin', 'inventory'], ['admin', 'products'], ['admin', 'product'], ['products']]);
      toast.show(orderStatusToast(order.code, order.status, order.fulfillment));
      refresh(); // atualiza já os contadores (menu, abas e título da aba)
      options.onSaved?.(order, change);
    },
    onError: (err, change) => {
      toast.show(errorMessage(err), { tone: 'error' });
      if (err instanceof ApiError && (err.status === 409 || err.status === 422 || err.status === 404)) {
        refreshQueries(qc, [['admin', 'order', change.id], ['admin', 'orders']]);
      }
    },
  });
}

/** Registra que o WhatsApp foi aberto com a mensagem do status (não significa que foi enviada). */
export function useOpenCustomerMessage(orderId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (status: OrderStatus) => adminApi.post<{ message: OrderMessageEntry; whatsappUrl: string }>(`/orders/${orderId}/messages`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] }),
    onError: (err) => {
      toast.show(`O WhatsApp foi aberto, mas o registro falhou: ${errorMessage(err)}`, { tone: 'error' });
      void qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    },
  });
}

export function useConfirmCustomerMessage(orderId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (messageId: string) => adminApi.post<OrderMessageEntry>(`/orders/${orderId}/messages/${messageId}/confirm`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
      toast.show('Envio registrado no histórico do pedido.');
    },
    onError: (err) => toast.show(errorMessage(err), { tone: 'error' }),
  });
}
