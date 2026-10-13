import { useState } from 'react';
import { useChangeOrderStatus } from '../../../hooks/useOrderActions';
import { needsConfirmation, ORDER_ACTION_SHORT, orderActionLabel, orderStatusLabel, primaryTransition } from '../../../lib/labels';
import type { AdminOrderRow } from '../../../types/admin';
import type { OrderStatus } from '../../../types/api';
import { ConfirmDialog } from '../ui';

/**
 * Botão que leva o pedido à próxima etapa (lista, quadro e fila da visão geral). Etapas finais pedem
 * confirmação; a tela só muda depois da resposta do servidor.
 */
export function OrderAdvanceButton({ order: o, className = '', arrow = false }: { order: AdminOrderRow; className?: string; arrow?: boolean }) {
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const change = useChangeOrderStatus({ onSaved: () => setConfirming(null) });
  const next = primaryTransition(o.allowedTransitions);
  if (!next) return null;

  const run = (to: OrderStatus) => {
    if (needsConfirmation(to)) return setConfirming(to);
    change.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to });
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${o.status === 'PENDING' ? 'btn-gold' : 'btn-outline'} ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          run(next);
        }}
        disabled={change.isPending}
        aria-busy={change.isPending}
        aria-label={`${orderActionLabel(next, o.fulfillment)}: ${o.code}`}
        title={orderActionLabel(next, o.fulfillment)}
      >
        {ORDER_ACTION_SHORT[next] ?? orderActionLabel(next, o.fulfillment)}
        {arrow && <span aria-hidden> →</span>}
      </button>
      {confirming && (
        <ConfirmDialog
          title={`${orderActionLabel(confirming, o.fulfillment)}?`}
          message={
            <p>
              O pedido <b>{o.code}</b> de {o.customerName} será marcado como <b>{orderStatusLabel(confirming, o.fulfillment)}</b> e não volta para etapas anteriores.
              {o.paymentStatus === 'UNPAID' && ' O pagamento ainda consta como não pago.'}
            </p>
          }
          confirmLabel={orderActionLabel(confirming, o.fulfillment)}
          busy={change.isPending}
          onConfirm={() => change.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to: confirming }, { onError: () => setConfirming(null) })}
          onCancel={() => !change.isPending && setConfirming(null)}
        />
      )}
    </>
  );
}
