import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCart } from '../../contexts/CartContext';
import { cartKey } from '../../lib/cart';
import { brl } from '../../lib/format';
import type { Product } from '../../types/api';
import { CategoryGlyph, PlusIcon, productGlyph } from '../ui/Icons';

export function ProductThumb({ product, eager = false }: { product: Product; eager?: boolean }) {
  const src = product.thumbUrl ?? product.imageUrl;
  return src ? (
    <img src={src} alt={product.images[0]?.altText ?? product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  ) : (
    <CategoryGlyph icon={productGlyph(product.category.icon, product.category.slug)} strokeWidth={1.2} />
  );
}

/** Preço com o valor original riscado acima quando há promoção. */
export function CardPrice({ product }: { product: Product }) {
  return (
    <span className="price">
      {product.onSale && (
        <s className="old">
          <span className="sr-only">De </span>
          {brl(product.regularPriceCents)}
        </s>
      )}
      <b>
        {product.onSale && <span className="sr-only">por </span>}
        {brl(product.priceCents)}
      </b>
    </span>
  );
}

/** "+" que adiciona à sacola e vira contador (− quantidade +) quando o produto já está nela. */
export function AddToBag({ product }: { product: Product }) {
  const { add, items, setQuantity } = useCart();
  const qty = items.find((i) => i.key === cartKey(product.id))?.quantity ?? 0;
  if (product.availability === 'OUT_OF_STOCK') {
    return (
      <button type="button" className="add sold" disabled aria-label={`${product.name} esgotado`}>
        Sem estoque
      </button>
    );
  }
  // Com tamanho/sabor, a escolha é feita na página do produto.
  if (product.variants?.length) {
    return (
      <Link to={`/produto/${product.slug}`} className="add choose" aria-label={`Escolher ${(product.variantType ?? 'opção').toLowerCase()} de ${product.name}`}>
        <PlusIcon />
      </Link>
    );
  }
  if (qty > 0) {
    return (
      <div className="stepper" role="group" aria-label={`${product.name} na sacola`}>
        <button type="button" onClick={() => setQuantity(cartKey(product.id), qty - 1)} aria-label={`Diminuir quantidade de ${product.name}`}>
          −
        </button>
        <output aria-live="polite" aria-label={`Quantidade de ${product.name}`}>
          {qty}
        </output>
        <button type="button" onClick={(e) => add(product, 1, e.currentTarget)} aria-label={`Aumentar quantidade de ${product.name}`}>
          +
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="add" aria-label={`Adicionar ${product.name} à sacola`} onClick={(e) => add(product, 1, e.currentTarget)}>
      <PlusIcon />
    </button>
  );
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const soldOut = product.availability === 'OUT_OF_STOCK';
  return (
    <article className={`card ${soldOut ? 'sold-out' : ''}`} style={{ '--i': Math.min(index, 15) } as CSSProperties}>
      <div className="thumb">
        <ProductThumb product={product} />
        {product.onSale && <span className="off">-{product.discountPercent}%</span>}
        {soldOut && <span className="stock-tag">Esgotado</span>}
        {product.availability === 'LOW_STOCK' && <span className="stock-tag low">Últimas unidades</span>}
      </div>
      <div className="card-body">
        <span className="cat">
          {product.category.name}
          {product.brand && ` · ${product.brand}`}
        </span>
        <Link to={`/produto/${product.slug}`} className="name card-link">
          {product.name}
        </Link>
        <div className="card-buy">
          <CardPrice product={product} />
          <AddToBag product={product} />
        </div>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 10, className = 'grid' }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton card-skeleton" />
      ))}
    </div>
  );
}
