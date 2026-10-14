import type { InventoryMovementType } from '@prisma/client';
import { conflict, notFound, unprocessable } from './errors.js';
import type { Tx } from './prisma.js';

export interface StockChange {
  productId: string;
  /** Variação (tamanho, sabor…) movimentada. Obrigatória quando o produto tem variações. */
  variantId?: string | null;
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
 * Com variação, o saldo da variação e o total do produto mudam juntos (o total é sempre a soma);
 * a movimentação registra os saldos da variação.
 * Deve ser chamado dentro de uma transação.
 */
export async function applyStockChange(tx: Tx, change: StockChange) {
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    throw new Error('applyStockChange: delta deve ser inteiro e diferente de zero');
  }
  let balanceAfter: number;
  if (change.variantId) {
    // Ordem fixa em todas as operações: primeiro a linha do produto, depois a da variação.
    // Assim dois pedidos do mesmo produto em opções diferentes esperam um pelo outro, sem deadlock.
    // Se a variação não tiver saldo, o erro desfaz a transação inteira (inclusive o total).
    const total = await tx.$executeRaw`
      UPDATE products
         SET stock_quantity = stock_quantity + ${change.delta}, updated_at = now()
       WHERE id = ${change.productId}::uuid AND stock_quantity + ${change.delta} >= 0`;
    const rows =
      total === 0
        ? []
        : await tx.$queryRaw<{ stock_quantity: number }[]>`
      UPDATE product_variants
         SET stock_quantity = stock_quantity + ${change.delta}, updated_at = now()
       WHERE id = ${change.variantId}::uuid
         AND product_id = ${change.productId}::uuid
         AND stock_quantity + ${change.delta} >= 0
   RETURNING stock_quantity`;
    if (rows.length === 0) {
      const variant = await tx.productVariant.findFirst({
        where: { id: change.variantId, productId: change.productId },
        select: { label: true, stockQuantity: true, product: { select: { name: true, variantType: true } } },
      });
      if (!variant) throw notFound('Variação não encontrada.');
      const label = `${variant.product.variantType ?? 'Opção'} ${variant.label}`;
      throw conflict(
        `Estoque insuficiente para "${variant.product.name}" (${label}). Disponível: ${variant.stockQuantity}.`,
        { productId: change.productId, variantId: change.variantId, available: variant.stockQuantity, requested: -change.delta },
        'INSUFFICIENT_STOCK',
      );
    }
    balanceAfter = rows[0]!.stock_quantity;
  } else {
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
    balanceAfter = rows[0]!.stock_quantity;
  }
  return tx.inventoryMovement.create({
    data: {
      productId: change.productId,
      variantId: change.variantId ?? null,
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
export async function lockStock(tx: Tx, productId: string, variantId?: string | null) {
  if (variantId) {
    // Produto antes da variação (mesma ordem de applyStockChange).
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    const rows = await tx.$queryRaw<{ stock_quantity: number }[]>`
      SELECT stock_quantity FROM product_variants WHERE id = ${variantId}::uuid AND product_id = ${productId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Variação não encontrada.');
    return rows[0]!.stock_quantity;
  }
  const rows = await tx.$queryRaw<{ stock_quantity: number }[]>`
    SELECT stock_quantity FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('Produto não encontrado.');
  return rows[0]!.stock_quantity;
}

/**
 * Produto com variações só movimenta estoque por variação (o total é a soma delas);
 * produto sem variações não aceita variação. Garante que o total nunca se desalinhe.
 */
export async function assertStockTarget(tx: Tx, productId: string, variantId: string | null | undefined) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { name: true, variantType: true, _count: { select: { variants: true } } },
  });
  if (!product) throw notFound('Produto não encontrado.');
  const hasVariants = product._count.variants > 0;
  if (hasVariants && !variantId) {
    throw unprocessable(
      `"${product.name}" tem estoque por ${(product.variantType ?? 'variação').toLowerCase()}: escolha a opção a movimentar.`,
      { productId },
      'VARIANT_REQUIRED',
    );
  }
  if (!hasVariants && variantId) throw notFound('Variação não encontrada.');
}
