import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ConfirmDialog, FormField, PageHeader, Tag } from '../../components/admin/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError } from '../../lib/api';
import { brl, formatDateTime, formatPhone } from '../../lib/format';
import { ORDER_ACTION, ORDER_STATUS, PAYMENT_STATUS } from '../../lib/labels';
import { whatsappLink } from '../../lib/whatsapp';
import type { AdminOrder } from '../../types/admin';
import type { OrderStatus, PaymentStatus } from '../../types/api';

type PendingAction = { kind: 'status'; to: OrderStatus } | { kind: 'payment'; to: PaymentStatus };

interface TimelineEvent {
  key: string;
  at: string;
  title: ReactNode;
  detail?: ReactNode;
  who?: string;
}

/** Número no formato internacional para o link do WhatsApp (adiciona 55 quando falta o DDI). */
function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
}

const PAYMENT_ACTION: Record<PaymentStatus, { button: string; title: string; message: string; confirm: string; danger?: boolean }> = {
  PAID: {
    button: 'Marcar como pago',
    title: 'Confirmar pagamento?',
    message: 'Marque como pago somente depois de a loja conferir o recebimento (Pix, cartão ou dinheiro). Esta confirmação é manual e fica registrada no histórico.',
    confirm: 'Marcar como pago',
  },
  UNPAID: {
    button: 'Corrigir: voltar para não pago',
    title: 'Corrigir pagamento?',
    message: 'Use esta opção apenas para corrigir um pagamento marcado por engano. O pedido voltará a constar como não pago.',
    confirm: 'Voltar para não pago',
  },
  REFUNDED: {
    button: 'Registrar reembolso',
    title: 'Registrar reembolso?',
    message: 'Registre o reembolso somente depois de devolver o valor ao cliente. O registro não movimenta dinheiro nem estoque.',
    confirm: 'Registrar reembolso',
    danger: true,
  },
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => adminApi.get<AdminOrder>(`/orders/${id}`),
    enabled: !!id,
  });
  useDocumentTitle(order.data ? `Pedido ${order.data.code}` : 'Pedido');

  const invalidate = [['admin', 'order', id], ['admin', 'orders'], ['admin', 'dashboard']];
  const onSaved = (updated: AdminOrder) => {
    qc.setQueryData(['admin', 'order', id], updated);
    setPending(null);
  };
  const onFailed = (err: unknown) => {
    // Conflito (409) ou transição inválida (422): o pedido mudou em outro lugar — recarrega e fecha o diálogo.
    if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
      setPending(null);
      order.refetch();
    }
  };

  const changeStatus = useAdminMutation((v: { status: OrderStatus; note: string | null }) => adminApi.patch<AdminOrder>(`/orders/${id}/status`, v), {
    success: (r) => `Pedido ${r.code}: ${ORDER_STATUS[r.status].label}.`,
    // Cancelamento devolve estoque: atualiza também saldos, movimentações e produtos.
    invalidate: [...invalidate, ['admin', 'inventory'], ['admin', 'products'], ['products']],
    onSuccess: onSaved,
  });
  const changePayment = useAdminMutation((v: { paymentStatus: PaymentStatus; note: string | null }) => adminApi.patch<AdminOrder>(`/orders/${id}/payment`, v), {
    success: (r) => `Pagamento: ${PAYMENT_STATUS[r.paymentStatus].label}.`,
    invalidate,
    onSuccess: onSaved,
  });
  const busy = changeStatus.isPending || changePayment.isPending;

  const open = (action: PendingAction) => {
    setNote('');
    setNoteError(null);
    setPending(action);
  };
  const confirm = () => {
    if (!pending || busy) return;
    const text = note.trim();
    if (text.length > 300) return setNoteError('Máximo de 300 caracteres.');
    if (pending.kind === 'status') {
      if (pending.to === 'CANCELLED' && text.length < 3) return setNoteError('Informe o motivo do cancelamento (mínimo 3 caracteres).');
      changeStatus.mutate({ status: pending.to, note: text || null }, { onError: onFailed });
    } else {
      changePayment.mutate({ paymentStatus: pending.to, note: text || null }, { onError: onFailed });
    }
  };

  if (order.isPending) return <LoadingState label="Carregando pedido…" />;
  if (order.isError) {
    const err = order.error;
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      return (
        <EmptyState title="Pedido não encontrado">
          <p>O pedido pode ter sido removido ou o endereço está incorreto.</p>
          <Link to="/admin/orders" className="btn btn-outline btn-sm">
            Voltar para pedidos
          </Link>
        </EmptyState>
      );
    }
    return <ErrorState error={err} onRetry={() => order.refetch()} />;
  }

  const o = order.data;
  const st = ORDER_STATUS[o.status];
  const pay = PAYMENT_STATUS[o.paymentStatus];
  const closed = o.status === 'CANCELLED' || o.status === 'EXPIRED';
  const paymentActions: PaymentStatus[] = [];
  if (o.paymentStatus === 'UNPAID' && !closed) paymentActions.push('PAID');
  if (o.paymentStatus === 'PAID') paymentActions.push('REFUNDED', 'UNPAID');

  const events = buildTimeline(o);
  const address = o.address;

  return (
    <>
      <PageHeader
        title={`Pedido ${o.code}`}
        description={
          <>
            Registrado em {formatDateTime(o.createdAt)} · <Tag tone={st.tone}>{st.label}</Tag> <Tag tone={pay.tone}>{pay.label}</Tag>
          </>
        }
        actions={
          <Link to="/admin/orders" className="btn btn-outline btn-sm">
            Voltar
          </Link>
        }
      />

      <div className="adm-grid main-side">
        <div>
          <section className="adm-card" aria-labelledby="sec-status">
            <h2 id="sec-status">
              Andamento <Tag tone={st.tone}>{st.label}</Tag>
            </h2>
            {o.allowedTransitions.length > 0 ? (
              <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                {o.allowedTransitions.map((to) =>
                  to === 'CANCELLED' ? (
                    <button key={to} type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => open({ kind: 'status', to })} disabled={busy}>
                      {ORDER_ACTION[to] ?? ORDER_STATUS[to].label}
                    </button>
                  ) : (
                    <button key={to} type="button" className="btn btn-gold btn-sm" onClick={() => open({ kind: 'status', to })} disabled={busy}>
                      {ORDER_ACTION[to] ?? ORDER_STATUS[to].label}
                    </button>
                  ),
                )}
              </div>
            ) : (
              <p className="notice">
                {o.status === 'COMPLETED' && 'Pedido concluído. Nenhuma outra mudança de status é possível.'}
                {o.status === 'CANCELLED' && 'Pedido cancelado. A reserva de estoque foi devolvida.'}
                {o.status === 'EXPIRED' && 'Pedido expirado automaticamente por falta de atendimento. A reserva de estoque foi devolvida.'}
              </p>
            )}
            {o.cancelReason && (
              <p className="notice" style={{ marginTop: 8 }}>
                Motivo: <b>{o.cancelReason}</b>
              </p>
            )}
          </section>

          <section className="adm-card" aria-labelledby="sec-items">
            <h2 id="sec-items">
              Itens <small>{o.items.length} item(ns)</small>
            </h2>
            <div className="table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Qtd.</th>
                    <th className="num">Preço unit.</th>
                    <th className="num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.productId ? <Link to={`/admin/products/${i.productId}`}>{i.productName}</Link> : i.productName}
                        {!i.productId && <div className="muted">Produto removido do catálogo</div>}
                      </td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">
                        {i.originalUnitPriceCents !== i.unitPriceCents && (
                          <div className="muted">
                            <s aria-label={`Preço original ${brl(i.originalUnitPriceCents)}`}>{brl(i.originalUnitPriceCents)}</s>
                          </div>
                        )}
                        {brl(i.unitPriceCents)}
                      </td>
                      <td className="num">{brl(i.subtotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="info-list" style={{ marginTop: 12, marginLeft: 'auto', maxWidth: 320 }}>
              <dt>Subtotal</dt>
              <dd className="num" style={{ textAlign: 'right' }}>
                {brl(o.subtotalCents)}
              </dd>
              <dt>Descontos</dt>
              <dd style={{ textAlign: 'right' }}>{o.discountCents > 0 ? `− ${brl(o.discountCents)}` : brl(0)}</dd>
              <dt>
                <b>Total</b>
              </dt>
              <dd style={{ textAlign: 'right' }}>
                <b>{brl(o.totalCents)}</b>
              </dd>
            </dl>
            <p className="notice" style={{ marginTop: 8 }}>
              Preços registrados pelo servidor no momento do pedido.
            </p>
          </section>

          <section className="adm-card" aria-labelledby="sec-history">
            <h2 id="sec-history">Histórico</h2>
            <ol className="timeline">
              {events.map((e) => (
                <li key={e.key}>
                  <div>
                    <b>{e.title}</b>
                    {e.detail && <div>{e.detail}</div>}
                    <small>
                      {formatDateTime(e.at)}
                      {e.who ? ` · ${e.who}` : ''}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div>
          <section className="adm-card" aria-labelledby="sec-customer">
            <h2 id="sec-customer">Cliente</h2>
            <dl className="info-list">
              <dt>Nome</dt>
              <dd>{o.customerName}</dd>
              <dt>Telefone</dt>
              <dd>{formatPhone(o.customerPhone)}</dd>
              <dt>Recebimento</dt>
              <dd>{o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada na loja'}</dd>
              {o.fulfillment === 'DELIVERY' && (
                <>
                  <dt>Endereço</dt>
                  <dd>
                    {address && (address.street || address.city) ? (
                      <>
                        {[address.street, address.number].filter(Boolean).join(', ')}
                        {address.complement ? ` (${address.complement})` : ''}
                        <br />
                        {[address.district, address.city].filter(Boolean).join(' · ')}
                      </>
                    ) : (
                      'Não informado'
                    )}
                  </dd>
                </>
              )}
              {o.notes && (
                <>
                  <dt>Observações</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{o.notes}</dd>
                </>
              )}
            </dl>
            <a
              href={whatsappLink(waNumber(o.customerPhone))}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-wa btn-sm"
              style={{ marginTop: 12 }}
              aria-label={`Conversar no WhatsApp com ${o.customerName} (abre em nova aba)`}
            >
              Conversar no WhatsApp
            </a>
            <p className="notice" style={{ marginTop: 8 }}>
              {o.whatsappOpenedAt
                ? `O cliente abriu o WhatsApp em ${formatDateTime(o.whatsappOpenedAt)}. Isso não confirma que a mensagem foi enviada.`
                : 'O cliente ainda não abriu o WhatsApp a partir do site.'}
            </p>
          </section>

          <section className="adm-card" aria-labelledby="sec-payment">
            <h2 id="sec-payment">
              Pagamento <Tag tone={pay.tone}>{pay.label}</Tag>
            </h2>
            <p className="notice" style={{ marginBottom: 12 }}>
              O pagamento é combinado com o cliente fora do site. "Pago" é confirmado <b>manualmente pela loja</b> depois de conferir o recebimento — o site não processa
              pagamentos e a abertura do WhatsApp não significa que a mensagem foi enviada.
            </p>
            {o.paidAt && o.paymentStatus === 'PAID' && (
              <p className="notice" style={{ marginBottom: 12 }}>
                Confirmado em {formatDateTime(o.paidAt)}.
              </p>
            )}
            {paymentActions.length > 0 ? (
              <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                {paymentActions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn btn-sm ${p === 'PAID' ? 'btn-gold' : 'btn-outline'}`}
                    style={p === 'REFUNDED' ? { color: 'var(--danger)' } : undefined}
                    onClick={() => open({ kind: 'payment', to: p })}
                    disabled={busy}
                  >
                    {PAYMENT_ACTION[p].button}
                  </button>
                ))}
              </div>
            ) : (
              <p className="notice">
                {o.paymentStatus === 'REFUNDED' ? 'Pagamento reembolsado. Nenhuma outra alteração disponível.' : 'Pedidos cancelados ou expirados não podem ser marcados como pagos.'}
              </p>
            )}
          </section>

          <section className="adm-card" aria-labelledby="sec-dates">
            <h2 id="sec-dates">Datas</h2>
            <dl className="info-list">
              <dt>Registrado</dt>
              <dd>{formatDateTime(o.createdAt)}</dd>
              {o.acceptedAt && (
                <>
                  <dt>Aceito</dt>
                  <dd>{formatDateTime(o.acceptedAt)}</dd>
                </>
              )}
              {o.completedAt && (
                <>
                  <dt>Concluído</dt>
                  <dd>{formatDateTime(o.completedAt)}</dd>
                </>
              )}
              {o.cancelledAt && (
                <>
                  <dt>{o.status === 'EXPIRED' ? 'Expirado' : 'Cancelado'}</dt>
                  <dd>{formatDateTime(o.cancelledAt)}</dd>
                </>
              )}
              <dt>Atualizado</dt>
              <dd>{formatDateTime(o.updatedAt)}</dd>
            </dl>
          </section>
        </div>
      </div>

      {pending && <ActionDialog action={pending} order={o} note={note} noteError={noteError} busy={busy} onNote={(v) => { setNote(v); setNoteError(null); }} onConfirm={confirm} onCancel={() => !busy && setPending(null)} />}
    </>
  );
}

function ActionDialog({
  action,
  order,
  note,
  noteError,
  busy,
  onNote,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  order: AdminOrder;
  note: string;
  noteError: string | null;
  busy: boolean;
  onNote: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isCancel = action.kind === 'status' && action.to === 'CANCELLED';
  let title: string;
  let message: ReactNode;
  let confirmLabel: string;
  let danger = false;

  if (action.kind === 'status') {
    const label = ORDER_STATUS[action.to].label;
    confirmLabel = ORDER_ACTION[action.to] ?? 'Confirmar';
    if (isCancel) {
      title = `Cancelar o pedido ${order.code}?`;
      danger = true;
      message = (
        <>
          <p>
            O pedido será cancelado e <b>o estoque reservado para os itens será devolvido</b> ao saldo dos produtos. Esta ação não pode ser desfeita.
          </p>
          {order.paymentStatus === 'PAID' && (
            <p className="alert alert-warn" style={{ marginTop: 8 }}>
              Este pedido está marcado como pago. Depois de devolver o valor ao cliente, registre o reembolso na seção Pagamento.
            </p>
          )}
        </>
      );
    } else {
      title = `${confirmLabel}?`;
      message = (
        <p>
          O pedido {order.code} passará de <b>{ORDER_STATUS[order.status].label}</b> para <b>{label}</b>.
        </p>
      );
    }
  } else {
    const cfg = PAYMENT_ACTION[action.to];
    title = cfg.title;
    confirmLabel = cfg.confirm;
    danger = !!cfg.danger;
    message = <p>{cfg.message}</p>;
  }

  return (
    <ConfirmDialog title={title} message={message} confirmLabel={confirmLabel} danger={danger} busy={busy} onConfirm={onConfirm} onCancel={onCancel}>
      <FormField
        id="action-note"
        label={isCancel ? 'Motivo do cancelamento (obrigatório)' : 'Observação (opcional)'}
        error={noteError ?? undefined}
        hint={isCancel ? 'Fica registrado no histórico do pedido.' : 'Aparece no histórico do pedido.'}
      >
        <textarea id="action-note" className="textarea" rows={3} maxLength={300} value={note} aria-invalid={!!noteError} onChange={(e) => onNote(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}

function buildTimeline(o: AdminOrder): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const hasCreationEntry = o.statusHistory.some((h) => h.fromStatus === null);
  if (!hasCreationEntry) events.push({ key: 'created', at: o.createdAt, title: 'Pedido registrado pelo site' });

  for (const h of o.statusHistory) {
    const isCreation = h.fromStatus === null;
    events.push({
      key: `s-${h.id}`,
      at: h.createdAt,
      title: isCreation ? 'Pedido registrado' : `Status: ${h.fromStatus ? `${ORDER_STATUS[h.fromStatus].label} → ` : ''}${ORDER_STATUS[h.toStatus].label}`,
      detail: h.note ?? undefined,
      who: h.user?.name ?? (isCreation ? 'Site' : 'Sistema'),
    });
  }
  if (o.whatsappOpenedAt) {
    events.push({ key: 'wa', at: o.whatsappOpenedAt, title: 'Cliente abriu o WhatsApp — não confirma envio' });
  }
  for (const p of o.paymentHistory) {
    const from = p.from && PAYMENT_STATUS[p.from] ? PAYMENT_STATUS[p.from].label : null;
    const to = p.to && PAYMENT_STATUS[p.to] ? PAYMENT_STATUS[p.to].label : 'alterado';
    events.push({
      key: `p-${p.id}`,
      at: p.createdAt,
      title: `Pagamento: ${from ? `${from} → ` : ''}${to}`,
      detail: p.note ?? undefined,
      who: p.user?.name ?? 'Sistema',
    });
  }
  if (o.stockReleasedAt) {
    events.push({ key: 'stock', at: o.stockReleasedAt, title: 'Estoque devolvido', detail: 'A reserva dos itens voltou ao saldo dos produtos.' });
  }
  return events
    .map((e, index) => ({ e, index, t: new Date(e.at).getTime() }))
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .map((x) => x.e);
}
