import type { FulfillmentType, OrderStatus, PaymentStatus } from '@prisma/client';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando confirmação da loja',
  ACCEPTED: 'Aceito',
  PROCESSING: 'Em separação',
  READY: 'Pronto para retirada/envio',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado (sem atendimento)',
};

/** Rótulo considerando a modalidade (ex.: "Pronto para retirada" em vez de "retirada/envio"). */
export function orderStatusLabel(status: OrderStatus, fulfillment: FulfillmentType) {
  if (status === 'READY') return fulfillment === 'DELIVERY' ? 'Pronto para envio' : 'Pronto para retirada';
  return ORDER_STATUS_LABEL[status];
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Não pago',
  PAID: 'Pago (confirmado pela loja)',
  REFUNDED: 'Reembolsado',
};

/** Pedidos ainda em atendimento (o estoque continua reservado). */
export const OPEN_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY'] as const satisfies readonly OrderStatus[];

/**
 * Transições permitidas pelo painel. EXPIRED é aplicado somente pelo sistema.
 * Etapas intermediárias podem ser puladas (loja pequena entrega na hora), mas nunca se volta atrás:
 * um pedido concluído ou cancelado não muda mais.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'],
  PROCESSING: ['READY', 'COMPLETED', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/** "Saiu para entrega" só existe para pedidos com entrega. */
export function allowedTransitions(status: OrderStatus, fulfillment: FulfillmentType): OrderStatus[] {
  return TRANSITIONS[status].filter((to) => to !== 'OUT_FOR_DELIVERY' || fulfillment === 'DELIVERY');
}
