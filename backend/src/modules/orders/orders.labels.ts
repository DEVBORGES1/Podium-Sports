import type { OrderStatus, PaymentStatus } from '@prisma/client';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando atendimento',
  ACCEPTED: 'Aceito',
  PROCESSING: 'Em separação',
  READY: 'Pronto para retirada/envio',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado (sem atendimento)',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Não pago',
  PAID: 'Pago (confirmado pela loja)',
  REFUNDED: 'Reembolsado',
};

/** Transições permitidas pelo painel. EXPIRED é aplicado somente pelo sistema. */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'],
  PROCESSING: ['READY', 'COMPLETED', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};
