import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCart } from '../../contexts/CartContext';
import { brl } from '../../lib/format';
import type { Product } from '../../types/api';
import { CategoryGlyph, productGlyph } from '../ui/Icons';

export function ProductThumb({ product, eager = false }: { product: Product; eager?: boolean }) {
  return product.imageUrl ? (
    <img src={product.imageUrl} alt={product.images[0]?.altText ?? product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  ) : (
    <CategoryGlyph icon={productGlyph(product.category.icon, product.category.slug)} />
  );
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
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
        <span className="cat">{product.category.name}</span>
        <Link to={`/produto/${product.slug}`} className="name card-link">
          {product.name}
        </Link>
        <span className="price">
          {product.onSale && (
            <s className="old">
              <span className="sr-only">De </span>
              {brl(product.regularPriceCents)}
            </s>
          )}
          {product.onSale && <span className="sr-only">por </span>}
          {brl(product.priceCents)}
        </span>
        <button
          type="button"
          className={`add ${done ? 'done' : ''}`}
          disabled={soldOut}
          aria-label={soldOut ? `${product.name} esgotado` : `Adicionar ${product.name} à sacola`}
          onClick={(e) => {
            if (add(product, 1, e.currentTarget)) {
              setDone(true);
              window.setTimeout(() => setDone(false), 1200);
            }
          }}
        >
          {soldOut ? 'Esgotado' : done ? 'Adicionado ✓' : 'Adicionar'}
        </button>
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
