import type { MovementType } from '../types/admin';
import type { Fulfillment, OrderStatus, PaymentStatus } from '../types/api';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'gold';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Novo pedido', tone: 'warn' },
  ACCEPTED: { label: 'Aceito', tone: 'info' },
  PROCESSING: { label: 'Em separação', tone: 'info' },
  READY: { label: 'Pronto', tone: 'gold' },
  OUT_FOR_DELIVERY: { label: 'Saiu para entrega', tone: 'gold' },
  COMPLETED: { label: 'Concluído', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  EXPIRED: { label: 'Expirado', tone: 'neutral' },
};

/** Rótulo do status considerando a modalidade ("Pronto para retirada" × "Pronto para envio"). */
export function orderStatusLabel(status: OrderStatus, fulfillment?: Fulfillment) {
  if (status === 'READY' && fulfillment) return fulfillment === 'DELIVERY' ? 'Pronto para envio' : 'Pronto para retirada';
  return ORDER_STATUS[status].label;
}

/** Texto do botão que leva o pedido a cada status. */
export function orderActionLabel(to: OrderStatus, fulfillment?: Fulfillment) {
  switch (to) {
    case 'ACCEPTED':
      return 'Aceitar pedido';
    case 'PROCESSING':
      return 'Iniciar separação';
    case 'READY':
      return fulfillment === 'DELIVERY' ? 'Marcar como pronto para envio' : 'Marcar como pronto para retirada';
    case 'OUT_FOR_DELIVERY':
      return 'Avisar que saiu para entrega';
    case 'COMPLETED':
      return fulfillment === 'PICKUP' ? 'Concluir (cliente retirou)' : 'Concluir pedido';
    case 'CANCELLED':
      return 'Cancelar pedido';
    default:
      return ORDER_STATUS[to].label;
  }
}

/** Versão curta para botões em listas. */
export const ORDER_ACTION_SHORT: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'Aceitar',
  PROCESSING: 'Separar',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  COMPLETED: 'Concluir',
};

/** Mensagem exibida depois de cada mudança de status. */
export function orderStatusToast(code: string, status: OrderStatus, fulfillment?: Fulfillment) {
  switch (status) {
    case 'ACCEPTED':
      return `Pedido ${code} aceito.`;
    case 'PROCESSING':
      return `Pedido ${code} em separação.`;
    case 'READY':
      return `Pedido ${code} pronto para ${fulfillment === 'DELIVERY' ? 'envio' : 'retirada'}.`;
    case 'OUT_FOR_DELIVERY':
      return `Pedido ${code} saiu para entrega.`;
    case 'COMPLETED':
      return `Pedido ${code} concluído.`;
    case 'CANCELLED':
      return `Pedido ${code} cancelado. O estoque foi devolvido.`;
    default:
      return `Pedido ${code} atualizado.`;
  }
}

/**
 * Próxima etapa natural (botão principal). O servidor devolve as transições já na ordem do fluxo,
 * filtradas pela modalidade; cancelar nunca é a ação principal.
 */
export const primaryTransition = (allowed: OrderStatus[]) => allowed.find((s) => s !== 'CANCELLED') ?? null;

/** Etapas finais pedem confirmação; as intermediárias são de um clique. */
export const needsConfirmation = (to: OrderStatus) => to === 'COMPLETED' || to === 'CANCELLED';

/** Etapas exibidas no indicador de progresso, conforme a modalidade. */
export function orderSteps(fulfillment: Fulfillment): OrderStatus[] {
  return fulfillment === 'DELIVERY'
    ? ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    : ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED'];
}

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
  ORDER_RELEASE: { label: 'Devolução de pedido cancelado', tone: 'gold' },
};

export const AVAILABILITY_LABEL = {
  IN_STOCK: { label: 'Normal', tone: 'ok' },
  LOW_STOCK: { label: 'Baixo', tone: 'warn' },
  OUT_OF_STOCK: { label: 'Esgotado', tone: 'danger' },
} as const;

export const CONTENT_STATE: Record<string, { label: string; tone: Tone }> = {
  LIVE: { label: 'No ar', tone: 'ok' },
  ACTIVE: { label: 'Vigente', tone: 'ok' },
  SCHEDULED: { label: 'Agendado', tone: 'info' },
  EXPIRED: { label: 'Encerrado', tone: 'neutral' },
  INACTIVE: { label: 'Inativo', tone: 'neutral' },
};

/** Etapas do fluxo da loja (quadro de pedidos e "Fluxo de hoje" da visão geral). */
export const ORDER_STAGES = [
  { id: 'new', label: 'Novos', statuses: ['PENDING'], hint: 'Aguardando aceite', tone: 'danger' },
  { id: 'progress', label: 'Em separação', statuses: ['ACCEPTED', 'PROCESSING'], hint: 'Aceitos ou sendo separados', tone: 'info' },
  { id: 'ready', label: 'Prontos', statuses: ['READY'], hint: 'Para retirada ou envio', tone: 'gold' },
  { id: 'delivery', label: 'Saiu para entrega', statuses: ['OUT_FOR_DELIVERY'], hint: 'A caminho do cliente', tone: 'gold' },
  { id: 'done', label: 'Concluídos hoje', statuses: ['COMPLETED'], hint: 'Finalizados hoje', tone: 'ok' },
] as const satisfies readonly { id: string; label: string; statuses: readonly OrderStatus[]; hint: string; tone: Tone }[];

export type OrderStageId = (typeof ORDER_STAGES)[number]['id'];

/** Início do dia de hoje (horário local) em ISO — filtro de "concluídos hoje". */
export function startOfTodayIso(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}
