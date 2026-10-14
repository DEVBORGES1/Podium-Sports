import type { PublicOrder } from '../types/api';
import { brl, formatPhone } from './format';

/** Link oficial de compartilhamento do WhatsApp com a mensagem codificada. */
export function whatsappLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

interface MessageSettings {
  orderMessageIntro: string;
  orderMessageFooter?: string | null;
}

/** Monta a mensagem do pedido a partir dos dados registrados no servidor (nunca da sacola local). */
export function buildOrderMessage(order: PublicOrder, settings: MessageSettings, customerPhone?: string) {
  const lines: string[] = [settings.orderMessageIntro.trim(), '', `*Pedido ${order.code}*`, `Cliente: ${order.customerName}`];
  if (customerPhone) lines.push(`Telefone: ${formatPhone(customerPhone)}`);
  lines.push(`Recebimento: ${order.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada na loja'}`);
  if (order.fulfillment === 'DELIVERY' && order.address) {
    const a = order.address;
    const complement = a.complement ? ` (${a.complement})` : '';
    lines.push(`Endereço: ${a.street}, ${a.number}${complement} - ${a.district}, ${a.city}`);
  }
  lines.push('', '*Itens*');
  for (const item of order.items) {
    const variant = item.variantLabel ? ` (${item.variantLabel})` : '';
    lines.push(`• ${item.quantity}x ${item.productName}${variant} — ${brl(item.unitPriceCents)} cada = ${brl(item.subtotalCents)}`);
  }
  lines.push('');
  if (order.discountCents > 0) {
    lines.push(`Subtotal: ${brl(order.subtotalCents)}`);
    lines.push(`Descontos: -${brl(order.discountCents)}`);
  }
  lines.push(`*Total: ${brl(order.totalCents)}*`);
  if (order.notes) lines.push('', `Observações: ${order.notes}`);
  if (settings.orderMessageFooter) lines.push('', settings.orderMessageFooter.trim());
  return lines.join('\n');
}
