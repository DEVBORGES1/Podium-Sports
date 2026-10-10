import { describe, expect, it } from 'vitest';
import { order } from '../test/fixtures';
import { buildOrderMessage, whatsappLink } from './whatsapp';

describe('mensagem do pedido no WhatsApp', () => {
  const settings = { orderMessageIntro: 'Olá, Podium Sports! Quero fazer este pedido:', orderMessageFooter: 'Obrigado!' };

  it('inclui código, cliente, itens, preços, subtotais, total, entrega, endereço e observações', () => {
    const msg = buildOrderMessage(order, settings, '49999991234').replace(/\u00a0/g, ' ');
    expect(msg).toContain('*Pedido PS-ABC234*');
    expect(msg).toContain('Cliente: Maria & Cia');
    expect(msg).toContain('Telefone: (49) 99999-1234');
    expect(msg).toContain('Recebimento: Entrega');
    expect(msg).toContain('Endereço: Rua A, 10 (Casa 2) - Centro, Videira');
    expect(msg).toContain('• 2x Chuteira F50 Messi — R$ 399,90 cada = R$ 799,80');
    expect(msg).toContain('• 1x Whey 100% — R$ 219,90 cada = R$ 219,90');
    expect(msg).toContain('Subtotal: R$ 1.417,90');
    expect(msg).toContain('Descontos: -R$ 398,20');
    expect(msg).toContain('*Total: R$ 1.019,70*');
    expect(msg).toContain('Observações: Tamanho 42 #azul');
    expect(msg.endsWith('Obrigado!')).toBe(true);
  });

  it('retirada não mostra endereço e omite subtotal sem desconto', () => {
    const msg = buildOrderMessage({ ...order, fulfillment: 'PICKUP', discountCents: 0, notes: null }, { orderMessageIntro: 'Oi' }).replace(/\u00a0/g, ' ');
    expect(msg).toContain('Recebimento: Retirada na loja');
    expect(msg).not.toContain('Endereço');
    expect(msg).not.toContain('Subtotal');
    expect(msg).not.toContain('Observações');
  });

  it('codifica corretamente o texto no link oficial', () => {
    const link = whatsappLink('+55 (49) 9809-0818', 'Olá & tchau #1\nlinha 2 ?x=1');
    expect(link.startsWith('https://wa.me/554998090818?text=')).toBe(true);
    const text = new URL(link).searchParams.get('text');
    expect(text).toBe('Olá & tchau #1\nlinha 2 ?x=1');
    expect(link).not.toMatch(/[\s&#]text|\n/);
  });
});
