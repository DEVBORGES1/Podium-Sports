import { Link } from 'react-router';
import { useCart } from '../../contexts/CartContext';
import { estimatedTotal } from '../../lib/cart';
import { brl } from '../../lib/format';

/** Celular: barra fixa com a sacola (itens e total) e o atalho para finalizar. Some com a sacola vazia. */
export function BagBar() {
  const { count, items, open } = useCart();
  if (count === 0) return null;
  return (
    <div className="bagbar">
      <button type="button" className="bagbar-info" onClick={open} aria-label={`Ver sacola: ${count} ${count === 1 ? 'item' : 'itens'}, ${brl(estimatedTotal(items))}`}>
        <span>
          Sacola · {count} {count === 1 ? 'item' : 'itens'}
        </span>
        <b>{brl(estimatedTotal(items))}</b>
      </button>
      <Link to="/checkout" className="bagbar-go">
        Finalizar →
      </Link>
    </div>
  );
}
