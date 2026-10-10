import type { MovementType } from '../types/admin';
import type { OrderStatus, PaymentStatus } from '../types/api';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'gold';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Aguardando atendimento', tone: 'warn' },
  ACCEPTED: { label: 'Aceito', tone: 'info' },
  PROCESSING: { label: 'Em separação', tone: 'info' },
  READY: { label: 'Pronto p/ retirada/envio', tone: 'gold' },
  COMPLETED: { label: 'Concluído', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  EXPIRED: { label: 'Expirado', tone: 'neutral' },
};

/** Texto do botão que leva o pedido a cada status. */
export const ORDER_ACTION: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'Aceitar pedido',
  PROCESSING: 'Iniciar separação',
  READY: 'Marcar como pronto',
  COMPLETED: 'Concluir pedido',
  CANCELLED: 'Cancelar pedido',
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Não pago', tone: 'neutral' },
  PAID: { label: 'Pago', tone: 'ok' },
  REFUNDED: { label: 'Reembolsado', tone: 'danger' },
};

export const MOVEMENT_TYPE: Record<MovementType, { label: string; tone: Tone }> = {
  INITIAL: { label: 'Estoque inicial', tone: 'neutral' },
  IN: { label: 'Entrada', tone: 'ok' },
  OUT: { label: 'Saída', tone: 'danger' },
  ADJUSTMENT: { label: 'Ajuste', tone: 'warn' },
  ORDER_RESERVATION: { label: 'Reserva de pedido', tone: 'info' },
  ORDER_RELEASE: { label: 'Devolução (cancelado/expirado)', tone: 'gold' },
};

export const AVAILABILITY_LABEL = { IN_STOCK: { label: 'Normal', tone: 'ok' }, LOW_STOCK: { label: 'Baixo', tone: 'warn' }, OUT_OF_STOCK: { label: 'Esgotado', tone: 'danger' } } as const;

export const CONTENT_STATE: Record<string, { label: string; tone: Tone }> = {
  LIVE: { label: 'No ar', tone: 'ok' },
  ACTIVE: { label: 'Vigente', tone: 'ok' },
  SCHEDULED: { label: 'Agendado', tone: 'info' },
  EXPIRED: { label: 'Encerrado', tone: 'neutral' },
  INACTIVE: { label: 'Inativo', tone: 'neutral' },
};
