import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ProductCard } from '../../components/store/ProductCard';
import { CategoryGlyph, productGlyph } from '../../components/ui/Icons';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useCart } from '../../contexts/CartContext';
import { siteUrl, useJsonLd, usePageMeta } from '../../hooks/usePageMeta';
import { useProduct, useSettings } from '../../hooks/useStoreData';
import { ApiError } from '../../lib/api';
import { cartKey } from '../../lib/cart';
import { brl, formatDate } from '../../lib/format';
import { whatsappLink } from '../../lib/whatsapp';

const AVAILABILITY = {
  IN_STOCK: { label: 'Disponível', cls: 'in' },
  LOW_STOCK: { label: 'Últimas unidades', cls: 'low' },
  OUT_OF_STOCK: { label: 'Esgotado', cls: 'out' },
} as const;

export default function ProductPage() {
  const { slug = '' } = useParams();
  const product = useProduct(slug);
  const settings = useSettings();
  const { add, items } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  // Opção escolhida, presa ao produto (ao navegar para outro produto a escolha some).
  const [choice, setChoice] = useState<{ productId: string; variantId: string } | null>(null);
  const [missingChoice, setMissingChoice] = useState(false);
  const d = product.data;
  usePageMeta({
    title: d?.name,
    description: d ? d.description || `${d.name}${d.brand ? ` (${d.brand})` : ''} por ${brl(d.priceCents)} na Podium Sports, em Videira, SC. Peça pelo site e finalize pelo WhatsApp.` : undefined,
    image: d?.images[0]?.url,
    path: `/produto/${slug}`,
  });
  const jsonLd = useMemo(
    () =>
      d && {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: d.name,
        ...(d.brand ? { brand: { '@type': 'Brand', name: d.brand } } : {}),
        ...(d.description ? { description: d.description } : {}),
        ...(d.images.length ? { image: d.images.map((i) => i.url) } : {}),
        category: d.category.name,
        offers: {
          '@type': 'Offer',
          url: `${siteUrl}/produto/${d.slug}`,
          priceCurrency: 'BRL',
          price: (d.priceCents / 100).toFixed(2),
          availability: d.availability === 'OUT_OF_STOCK' ? 'https://schema.org/OutOfStock' : d.availability === 'LOW_STOCK' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Podium Sports' },
        },
      },
    [d],
  );
  useJsonLd('product-jsonld', jsonLd ?? null);

  if (product.isPending) return <LoadingState label="Carregando produto…" />;
  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404) {
      return (
        <div className="wrap">
          <EmptyState title="Produto não encontrado">
            <p>Ele pode ter saído do catálogo.</p>
            <Link to="/produtos" className="btn btn-gold btn-sm">
              Ver catálogo
            </Link>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="wrap">
        <ErrorState error={product.error} onRetry={() => product.refetch()} />
      </div>
    );
  }

  const p = product.data;
  const variants = p.variants ?? [];
  const hasVariants = variants.length > 0;
  const variantName = p.variantType ?? 'Opção';
  const selected = choice?.productId === p.id ? (variants.find((v) => v.id === choice.variantId) ?? null) : null;
  const inCart = items.find((i) => i.key === cartKey(p.id, selected?.id))?.quantity ?? 0;
  // Com variações, o limite é o da opção escolhida (sem escolha, ainda não dá para comprar).
  const limit = hasVariants ? (selected?.maxQuantity ?? 0) : p.maxQuantity;
  const max = Math.max(0, limit - inCart);
  const soldOut = p.availability === 'OUT_OF_STOCK';
  const image = p.images[imageIndex] ?? p.images[0];
  const availability = AVAILABILITY[p.availability];
  const quantity = Math.min(qty, Math.max(1, max));
  /** Sem a opção escolhida, avisa em vez de adicionar. */
  const needsChoice = () => {
    if (hasVariants && !selected) {
      setMissingChoice(true);
      document.getElementById('variant-picker')?.focus();
      return true;
    }
    return false;
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Você está em">
          <Link to="/">Início</Link> <span aria-hidden>›</span>
          {p.category.parent && (
            <>
              <Link to={`/produtos?categoria=${p.category.parent.slug}`}>{p.category.parent.name}</Link> <span aria-hidden>›</span>
            </>
          )}
          <Link to={`/produtos?categoria=${p.category.slug}`}>{p.category.name}</Link> <span aria-hidden>›</span>
          <span aria-current="page">{p.name}</span>
        </nav>
      </div>
      <div className="product-page">
        <div className="gallery">
          <div className="main">
            {image ? (
              <>
                {/* Fundo desfocado da própria foto: preenche as laterais quando ela não é quadrada. */}
                <img className="backdrop" src={image.thumbUrl ?? image.url} alt="" aria-hidden />
                <img className="photo" src={image.mediumUrl ?? image.url} alt={image.altText} />
              </>
            ) : (
              <CategoryGlyph icon={productGlyph(p.category.icon, p.category.slug)} />
            )}
            {p.onSale && <span className="off">-{p.discountPercent}%</span>}
          </div>
          {p.images.length > 1 && (
            <div className="thumbs" role="group" aria-label="Fotos do produto">
              {p.images.map((img, i) => (
                <button key={img.id} type="button" aria-current={i === imageIndex} aria-label={`Ver foto ${i + 1}`} onClick={() => setImageIndex(i)}>
                  <img src={img.thumbUrl ?? img.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-info">
          <span className="cat">{p.category.name}</span>
          <h1>{p.name}</h1>
          {p.brand && (
            <p className="promo-note">
              Marca: <b>{p.brand}</b>
            </p>
          )}
          <p className="price">
            {p.onSale && (
              <s className="old">
                <span className="sr-only">De </span>
                {brl(p.regularPriceCents)}
              </s>
            )}{' '}
            {p.onSale && <span className="sr-only">por </span>}
            {brl(p.priceCents)}
          </p>
          {p.promotion && <p className="promo-note">{p.promotion.name} · válida até {formatDate(p.promotion.endsAt)}</p>}
          <span className={`availability ${availability.cls}`}>● {availability.label}</span>

          {hasVariants && !soldOut && (
            <fieldset className="variant-picker" aria-describedby={missingChoice ? 'variant-missing' : undefined}>
              <legend>
                {variantName}
                {selected && <b>: {selected.label}</b>}
              </legend>
              <div id="variant-picker" className="variant-options" role="radiogroup" aria-label={variantName} tabIndex={-1}>
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={selected?.id === v.id}
                    className={`variant-option${selected?.id === v.id ? ' selected' : ''}`}
                    disabled={!v.available}
                    title={v.available ? undefined : 'Esgotado'}
                    onClick={() => {
                      setChoice({ productId: p.id, variantId: v.id });
                      setMissingChoice(false);
                      setQty(1);
                    }}
                  >
                    {v.label}
                    {!v.available && <span className="sr-only"> (esgotado)</span>}
                  </button>
                ))}
              </div>
              {missingChoice && (
                <p id="variant-missing" className="err" role="alert">
                  Escolha {variantName.toLowerCase()} para continuar.
                </p>
              )}
            </fieldset>
          )}

          {!soldOut && (
            <div className="buy-row">
              <div className="qty" role="group" aria-label="Quantidade">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Diminuir quantidade">
                  −
                </button>
                <output aria-live="polite">{quantity}</output>
                <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={quantity >= max} aria-label="Aumentar quantidade">
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn btn-gold"
                disabled={max === 0 && !(hasVariants && !selected)}
                onClick={(e) => {
                  if (needsChoice()) return;
                  if (add(p, quantity, e.currentTarget, selected)) setQty(1);
                }}
              >
                Adicionar à sacola
              </button>
              <button
                type="button"
                className="btn btn-wa"
                disabled={max === 0 && inCart === 0 && !(hasVariants && !selected)}
                onClick={() => {
                  if (needsChoice()) return;
                  if (max > 0) add(p, quantity, null, selected);
                  navigate('/checkout');
                }}
              >
                Comprar agora
              </button>
            </div>
          )}
          {max === 0 && inCart > 0 && <p className="alert alert-warn">Você já tem a quantidade máxima disponível na sacola.</p>}
          {soldOut && settings.data && (
            <p style={{ margin: '16px 0' }}>
              <a
                className="btn btn-wa"
                href={whatsappLink(settings.data.whatsappNumber, `Olá! Vocês vão ter o produto "${p.name}" novamente?`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Avise-me pelo WhatsApp
              </a>
            </p>
          )}
          {p.description && <div className="product-desc">{p.description}</div>}
          <ul className="product-meta">
            {!hasVariants && (
              <li>
                <b>Tamanho, cor e sabor:</b> confirmados no atendimento pelo WhatsApp.
              </li>
            )}
            <li>
              <b>Pagamento:</b> combinado na conversa (Pix ou cartão).
            </li>
          </ul>
        </div>
      </div>
      {p.related.length > 0 && (
        <section className="sec" aria-labelledby="related-title">
          <h2 id="related-title">
            Você também pode gostar
          </h2>
          <div className="grid">
            {p.related.map((r, i) => (
              <ProductCard key={r.id} product={r} index={i} />
            ))}
          </div>
        </section>
      )}
      <div style={{ height: 48 }} />
    </div>
  );
}
