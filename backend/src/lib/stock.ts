import type { InventoryMovementType } from '@prisma/client';
import { conflict, notFound } from './errors.js';
import type { Tx } from './prisma.js';

export interface StockChange {
  productId: string;
  /** Variação com sinal: positiva entra, negativa sai. */
  delta: number;
  type: InventoryMovementType;
  reason?: string | null;
  orderId?: string | null;
  profileId?: string | null;
}

/**
 * Altera o saldo de forma atômica e registra a movimentação.
 * O UPDATE condicional bloqueia a linha e só aplica a saída se houver saldo:
 * duas operações concorrentes nunca deixam o estoque negativo.
 * Deve ser chamado dentro de uma transação.
 */
export async function applyStockChange(tx: Tx, change: StockChange) {
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    throw new Error('applyStockChange: delta deve ser inteiro e diferente de zero');
  }
  const rows = await tx.$queryRaw<{ stock_quantity: number }[]>`
    UPDATE products
       SET stock_quantity = stock_quantity + ${change.delta}, updated_at = now()
     WHERE id = ${change.productId}::uuid
       AND stock_quantity + ${change.delta} >= 0
 RETURNING stock_quantity`;

  if (rows.length === 0) {
    const product = await tx.product.findUnique({
      where: { id: change.productId },
      select: { name: true, stockQuantity: true },
    });
    if (!product) throw notFound('Produto não encontrado.');
    throw conflict(
      `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQuantity}.`,
      { productId: change.productId, available: product.stockQuantity, requested: -change.delta },
      'INSUFFICIENT_STOCK',
    );
  }
  const balanceAfter = rows[0]!.stock_quantity;
  return tx.inventoryMovement.create({
    data: {
      productId: change.productId,
      type: change.type,
      quantity: change.delta,
      balanceBefore: balanceAfter - change.delta,
      balanceAfter,
      reason: change.reason ?? null,
      orderId: change.orderId ?? null,
      profileId: change.profileId ?? null,
    },
  });
}

/** Lê o saldo travando a linha até o fim da transação (usado em ajustes para um valor absoluto). */
export async function lockStock(tx: Tx, productId: string) {
  const rows = await tx.$queryRaw<{ stock_quantity: number }[]>`
    SELECT stock_quantity FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('Produto não encontrado.');
  return rows[0]!.stock_quantity;
}
