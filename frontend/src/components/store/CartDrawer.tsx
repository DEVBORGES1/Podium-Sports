import { useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCart, useCartQuote } from '../../contexts/CartContext';
import { useDialog } from '../../hooks/useDialog';
import { MAX_QUANTITY_PER_ITEM, estimatedTotal } from '../../lib/cart';
import { brl } from '../../lib/format';
import type { LineIssue } from '../../types/api';
import { CategoryGlyph, productGlyph } from '../ui/Icons';

export const ISSUE_TEXT: Record<Exclude<LineIssue, null>, string> = {
  NOT_FOUND: 'Produto não está mais disponível. Remova da sacola.',
  UNAVAILABLE: 'Produto indisponível no momento. Remova da sacola.',
  OUT_OF_STOCK: 'Esgotado. Remova da sacola.',
  INSUFFICIENT_STOCK: 'Quantidade maior que o estoque disponível.',
  QUANTITY_LIMIT: `Máximo de ${MAX_QUANTITY_PER_ITEM} unidades por produto.`,
};

export function CartDrawer({ note }: { note: string }) {
  const { items, isOpen, close, setQuantity, remove } = useCart();
  const quote = useCartQuote(isOpen);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  useDialog(isOpen, close, ref);

  const total = quote.data?.totalCents ?? estimatedTotal(items);
  const blocked = quote.data ? !quote.data.canCheckout : false;

  return (
    <>
      <div className={`overlay ${isOpen ? 'open' : ''}`} onClick={close} aria-hidden />
      <aside ref={ref} className={`drawer ${isOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cart-title" tabIndex={-1}>
        <div className="drawer-head">
          <h2 id="cart-title">Sua sacola</h2>
          <button type="button" className="x" onClick={close} aria-label="Fechar sacola">
            ×
          </button>
        </div>
        <div className="items">
          {items.length === 0 ? (
            <div className="empty">
              <p>Sua sacola está vazia.</p>
              <Link to="/produtos" className="btn btn-gold btn-sm" onClick={close}>
                Ver produtos
              </Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none' }} aria-label="Itens da sacola">
              {items.map((item) => {
                const line = quote.lineFor(item.productId);
                const unit = line?.unitPriceCents ?? item.snapshot.priceCents;
                const max = Math.min(line?.maxQuantity ?? item.snapshot.maxQuantity, MAX_QUANTITY_PER_ITEM);
                return (
                  <li className="item" key={item.productId}>
                    <div className="mini" aria-hidden>
                      {item.snapshot.imageUrl ? <img src={item.snapshot.imageUrl} alt="" /> : <CategoryGlyph icon={productGlyph(item.snapshot.icon, item.snapshot.categorySlug)} />}
                    </div>
                    <div>
                      <Link to={`/produto/${item.snapshot.slug}`} onClick={close}>
                        {line?.name ?? item.snapshot.name}
                      </Link>
                      <small style={{ display: 'block' }}>
                        {brl(unit)} {item.quantity > 1 && `· ${brl(unit * item.quantity)}`}
                      </small>
                      {line?.issue && <span className="issue">{ISSUE_TEXT[line.issue]}</span>}
                      {line?.issue === 'INSUFFICIENT_STOCK' && max > 0 && (
                        <button type="button" className="remove" onClick={() => setQuantity(item.productId, max)}>
                          Ajustar para {max}
                        </button>
                      )}
                      {' '}
                      <button type="button" className="remove" onClick={() => remove(item.productId)}>
                        Remover
                      </button>
                    </div>
                    <div className="qty">
                      <button type="button" onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.snapshot.name}`}>
                        −
                      </button>
                      <output aria-live="polite" aria-label={`Quantidade de ${item.snapshot.name}`}>
                        {item.quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= max}
                        aria-label={`Aumentar quantidade de ${item.snapshot.name}`}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <div className="drawer-foot">
            <small style={{ color: 'var(--muted)' }}>{note}</small>
            {quote.data && quote.data.discountCents > 0 && (
              <div className="total sub">
                <span>Descontos</span>
                <span>-{brl(quote.data.discountCents)}</span>
              </div>
            )}
            <div className="total">
              <span>Total{quote.isFetching ? ' (atualizando…)' : ''}</span>
              <span>{brl(total)}</span>
            </div>
            {quote.isError && <p className="alert alert-warn">Não foi possível confirmar os preços agora. Eles serão conferidos ao finalizar.</p>}
            {blocked && <p className="alert alert-error">Revise os itens marcados para continuar.</p>}
            <button
              type="button"
              className="btn btn-wa"
              disabled={blocked}
              onClick={() => {
                close();
                navigate('/checkout');
              }}
            >
              Finalizar pedido
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
