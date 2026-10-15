import type { FulfillmentType, OrderStatus } from '@prisma/client';
import type { StoreContent } from '../settings/settings.schemas.js';

type Templates = StoreContent['customerMessages'];

/**
 * Status que têm mensagem de atualização para o cliente.
 * PENDING não tem (o próprio cliente enviou o pedido) e EXPIRED não tem (não houve atendimento).
 */
export const MESSAGE_STATUSES = ['ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'] as const satisfies readonly OrderStatus[];

function templateKey(status: OrderStatus, fulfillment: FulfillmentType): keyof Templates | null {
  switch (status) {
    case 'ACCEPTED':
      return 'accepted';
    case 'PROCESSING':
      return 'processing';
    case 'READY':
      return fulfillment === 'DELIVERY' ? 'readyDelivery' : 'readyPickup';
    case 'OUT_FOR_DELIVERY':
      // "Saiu para entrega" nunca é sugerido para retirada.
      return fulfillment === 'DELIVERY' ? 'outForDelivery' : null;
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return null;
  }
}

/** Primeiro nome, para uma mensagem cordial sem repetir o nome completo do cliente. */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * Número no formato internacional exigido pelo wa.me (somente dígitos, com DDI).
 * Telefones brasileiros com DDD (10 ou 11 dígitos) recebem o 55.
 */
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
}

/** Mensagem sugerida para o status do pedido, ou null quando não há o que avisar. */
export function buildCustomerMessage(
  order: { status: OrderStatus; fulfillment: FulfillmentType; code: string; customerName: string },
  templates: Templates,
  storeName: string,
) {
  const key = templateKey(order.status, order.fulfillment);
  if (!key) return null;
  const text = templates[key].replaceAll('{nome}', firstName(order.customerName)).replaceAll('{pedido}', order.code).replaceAll('{loja}', storeName).trim();
  return { status: order.status, text };
}
