import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useOrderAlerts } from '../../../contexts/OrderAlertsContext';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useNow } from '../../../hooks/useNow';
import { useChangeOrderStatus, useConfirmCustomerMessage, useOpenCustomerMessage } from '../../../hooks/useOrderActions';
import { adminApi, ApiError } from '../../../lib/api';
import { brl, formatDateTime, formatPhone, formatTime, timeAgo } from '../../../lib/format';
import { needsConfirmation, ORDER_STATUS, orderActionLabel, orderStatusLabel, orderSteps, PAYMENT_STATUS, primaryTransition } from '../../../lib/labels';
import { whatsappLink } from '../../../lib/whatsapp';
import type { AdminOrder } from '../../../types/admin';
import type { OrderStatus, PaymentStatus } from '../../../types/api';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { CheckIcon, ClockIcon, StoreIcon, TruckIcon, WhatsAppIcon } from '../AdminIcons';
import { ConfirmDialog, FormField, Tag } from '../ui';

type PendingAction = { kind: 'status'; to: OrderStatus } | { kind: 'payment'; to: PaymentStatus };

/** Número internacional para conversar com o cliente (adiciona 55 a telefones com DDD). */
function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
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

export function OrderDetail({ id, onNavigateAway, showTitle = true }: { id: string; onNavigateAway?: () => void; showTitle?: boolean }) {
  const qc = useQueryClient();
  const { markSeen } = useOrderAlerts();
  const now = useNow(30_000);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [justChanged, setJustChanged] = useState(false);
  const commsRef = useRef<HTMLElement>(null);

  const order = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => adminApi.get<AdminOrder>(`/orders/${id}`) });
  useEffect(() => markSeen(id), [id, markSeen]);

  const changeStatus = useChangeOrderStatus({
    onSaved: () => {
      setPending(null);
      // Status salvo: destaca a comunicação com o cliente (o envio continua sendo uma decisão da loja).
      setJustChanged(true);
      window.setTimeout(() => commsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    },
  });
  const changePayment = useAdminMutation((v: { paymentStatus: PaymentStatus; note: string | null }) => adminApi.patch<AdminOrder>(`/orders/${id}/payment`, v), {
    success: (r) => `Pagamento: ${PAYMENT_STATUS[r.paymentStatus].label}.`,
    invalidate: [['admin', 'orders'], ['admin', 'dashboard']],
    onSuccess: (updated) => {
      qc.setQueryData(['admin', 'order', id], updated);
      setPending(null);
    },
  });
  const busy = changeStatus.isPending || changePayment.isPending;

  if (order.isPending) return <LoadingState label="Carregando pedido…" />;
  if (order.isError) {
    const err = order.error;
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      return (
        <EmptyState title="Pedido não encontrado">
          <p>O pedido pode ter sido removido ou o endereço está incorreto.</p>
          <Link to="/admin/orders" className="btn btn-outline btn-sm" onClick={onNavigateAway}>
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
  const primary = primaryTransition(o.allowedTransitions);
  const others = o.allowedTransitions.filter((t) => t !== primary && t !== 'CANCELLED');
  const canCancel = o.allowedTransitions.includes('CANCELLED');

  const runStatus = (to: OrderStatus) => {
    if (busy) return;
    if (needsConfirmation(to)) return openDialog({ kind: 'status', to });
    changeStatus.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to });
  };
  const openDialog = (action: PendingAction) => {
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
      changeStatus.mutate({ id: o.id, code: o.code, fulfillment: o.fulfillment, from: o.status, to: pending.to, note: text || null }, { onError: () => setPending(null) });
    } else {
      changePayment.mutate({ paymentStatus: pending.to, note: text || null }, { onError: () => setPending(null) });
    }
  };

  const paymentActions: PaymentStatus[] = [];
  if (o.paymentStatus === 'UNPAID' && !closed) paymentActions.push('PAID');
  if (o.paymentStatus === 'PAID') paymentActions.push('REFUNDED', 'UNPAID');
  const address = o.address;

  return (
    <div className="order-detail">
      <div className="od-summary">
        <div>
          {showTitle && (
            <h3 className="od-title">
              Pedido {o.code} <span>· {o.customerName}</span>
            </h3>
          )}
          <div className="od-badges">
            <Tag tone={st.tone}>{orderStatusLabel(o.status, o.fulfillment)}</Tag>
            <Tag tone={pay.tone}>{pay.label}</Tag>
            <Tag>
              {o.fulfillment === 'DELIVERY' ? <TruckIcon /> : <StoreIcon />}
              {o.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada na loja'}
            </Tag>
          </div>
          <p className="od-when">
            <ClockIcon /> Recebido {timeAgo(o.createdAt, now)} · {formatDateTime(o.createdAt)}
          </p>
        </div>
        <strong className="od-total">{brl(o.totalCents)}</strong>
      </div>

      <StatusSteps order={o} />

      <section className="adm-card od-next" aria-labelledby="sec-next">
        <h2 id="sec-next">{primary || canCancel ? 'Próxima etapa' : 'Andamento'}</h2>
        {primary || canCancel ? (
          <>
            {primary && (
              <button type="button" className="btn btn-gold od-primary" onClick={() => runStatus(primary)} disabled={busy} aria-busy={changeStatus.isPending && changeStatus.variables?.to === primary}>
                {primary === 'COMPLETED' ? <CheckIcon /> : null}
                {orderActionLabel(primary, o.fulfillment)}
              </button>
            )}
            <div className="od-actions">
              {others.map((to) => (
                <button key={to} type="button" className="btn btn-outline btn-sm" onClick={() => runStatus(to)} disabled={busy} aria-busy={changeStatus.isPending && changeStatus.variables?.to === to}>
                  {orderActionLabel(to, o.fulfillment)}
                </button>
              ))}
              {canCancel && (
                <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => openDialog({ kind: 'status', to: 'CANCELLED' })} disabled={busy}>
                  Cancelar pedido
                </button>
              )}
            </div>
            {others.length > 0 && <p className="notice">Os botões menores pulam etapas — use quando o pedido avançar mais rápido.</p>}
          </>
        ) : (
          <p className="notice">
            {o.status === 'COMPLETED' && 'Pedido concluído. Nenhuma outra mudança de status é possível.'}
            {o.status === 'CANCELLED' && 'Pedido cancelado. A reserva de estoque foi devolvida.'}
            {o.status === 'EXPIRED' && 'Pedido expirado automaticamente por falta de atendimento. A reserva de estoque foi devolvida.'}
          </p>
        )}
        {o.cancelReason && (
          <p className="notice">
            Motivo: <b>{o.cancelReason}</b>
          </p>
        )}
      </section>

      <CustomerComms order={o} highlight={justChanged} sectionRef={commsRef} />

      <section className="adm-card" aria-labelledby="sec-customer">
        <h2 id="sec-customer">Cliente e {o.fulfillment === 'DELIVERY' ? 'entrega' : 'retirada'}</h2>
        <dl className="info-list">
          <dt>Nome</dt>
          <dd>{o.customerName}</dd>
          <dt>Telefone</dt>
          <dd>
            <a href={`tel:+${waNumber(o.customerPhone)}`} className="link-btn">
              {formatPhone(o.customerPhone)}
            </a>
          </dd>
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
              <dd className="od-notes">{o.notes}</dd>
            </>
          )}
        </dl>
        <a
          href={whatsappLink(waNumber(o.customerPhone))}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm"
          aria-label={`Abrir conversa no WhatsApp com ${o.customerName} (nova aba)`}
        >
          <WhatsAppIcon /> Abrir conversa
        </a>
        <p className="notice">
          {o.whatsappOpenedAt
            ? `O cliente abriu o WhatsApp pelo site em ${formatDateTime(o.whatsappOpenedAt)} — isso não confirma que a mensagem do pedido foi enviada.`
            : 'O cliente ainda não abriu o WhatsApp a partir do site.'}
        </p>
      </section>

      <section className="adm-card" aria-labelledby="sec-items">
        <h2 id="sec-items">
          Itens <small>{o.items.reduce((s, i) => s + i.quantity, 0)} unidade(s)</small>
        </h2>
        <ul className="od-items">
          {o.items.map((i) => (
            <li key={i.id}>
              <span className="oi-qty">{i.quantity}×</span>
              <span className="oi-name">
                {i.productId ? (
                  <Link to={`/admin/products/${i.productId}`} onClick={onNavigateAway}>
                    {i.productName}
                  </Link>
                ) : (
                  i.productName
                )}
                {i.variantLabel && <b className="oi-variant"> · {i.variantLabel}</b>}
                <small>
                  {i.originalUnitPriceCents !== i.unitPriceCents && <s aria-label={`Preço original ${brl(i.originalUnitPriceCents)}`}>{brl(i.originalUnitPriceCents)}</s>} {brl(i.unitPriceCents)} cada
                  {!i.productId && ' · produto removido do catálogo'}
                </small>
              </span>
              <span className="oi-sub">{brl(i.subtotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="od-totals">
          <dt>Subtotal</dt>
          <dd>{brl(o.subtotalCents)}</dd>
          {o.discountCents > 0 && (
            <>
              <dt>Descontos</dt>
              <dd>− {brl(o.discountCents)}</dd>
            </>
          )}
          <dt>
            <b>Total</b>
          </dt>
          <dd>
            <b>{brl(o.totalCents)}</b>
          </dd>
        </dl>
        <p className="notice">Preços registrados pelo servidor no momento do pedido. Frete, se houver, é combinado pelo WhatsApp.</p>
      </section>

      <section className="adm-card" aria-labelledby="sec-payment">
        <h2 id="sec-payment">
          Pagamento <Tag tone={pay.tone}>{pay.label}</Tag>
        </h2>
        <p className="notice">
          O site não processa pagamentos. “Pago” é marcado <b>manualmente pela loja</b> depois de conferir o recebimento.
          {o.paidAt && o.paymentStatus === 'PAID' && ` Confirmado em ${formatDateTime(o.paidAt)}.`}
        </p>
        {paymentActions.length > 0 ? (
          <div className="row-actions start">
            {paymentActions.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${p === 'PAID' ? 'btn-gold' : p === 'REFUNDED' ? 'btn-danger-outline' : 'btn-outline'}`}
                onClick={() => openDialog({ kind: 'payment', to: p })}
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

      <section className="adm-card" aria-labelledby="sec-history">
        <h2 id="sec-history">Histórico do pedido</h2>
        <ol className="timeline">
          {buildTimeline(o).map((e) => (
            <li key={e.key} className={e.tone ?? ''}>
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

      {pending && (
        <ActionDialog
          action={pending}
          order={o}
          note={note}
          noteError={noteError}
          busy={busy}
          onNote={(v) => {
            setNote(v);
            setNoteError(null);
          }}
          onConfirm={confirm}
          onCancel={() => !busy && setPending(null)}
        />
      )}
    </div>
  );
}

/** Etapas do pedido conforme a modalidade (retirada não mostra "Saiu para entrega"). */
function StatusSteps({ order }: { order: AdminOrder }) {
  if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
    return (
      <p className={`alert ${order.status === 'CANCELLED' ? 'alert-error' : 'alert-warn'} od-closed`}>
        {order.status === 'CANCELLED' ? 'Pedido cancelado.' : 'Pedido expirado sem atendimento.'} O estoque reservado foi devolvido.
      </p>
    );
  }
  const steps = orderSteps(order.fulfillment);
  const reached = new Set(order.statusHistory.map((h) => h.toStatus));
  const currentIndex = steps.indexOf(order.status);
  return (
    <ol className="steps" aria-label="Etapas do pedido">
      {steps.map((s, i) => {
        const state = i < currentIndex ? (reached.has(s) ? 'done' : 'skipped') : i === currentIndex ? 'current' : 'todo';
        return (
          <li key={s} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <i aria-hidden>{state === 'done' ? '✓' : i + 1}</i>
            <span>{orderStatusLabel(s, order.fulfillment)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Comunicação com o cliente: mensagem sugerida para o status atual, aberta no WhatsApp para a loja
 * revisar e enviar. Abrir o link não envia nada — o histórico diferencia "aberto" de "enviado (informado)".
 */
function CustomerComms({ order, highlight, sectionRef }: { order: AdminOrder; highlight: boolean; sectionRef: React.Ref<HTMLElement> }) {
  const open = useOpenCustomerMessage(order.id);
  const confirmSent = useConfirmCustomerMessage(order.id);
  const suggestion = order.customerMessage;
  const current = suggestion ? order.messages.find((m) => m.status === suggestion.status) : undefined;

  return (
    <section ref={sectionRef} className={`adm-card od-comms ${highlight && suggestion && !current ? 'attention' : ''}`} aria-labelledby="sec-comms">
      <h2 id="sec-comms">
        Comunicação com o cliente <small>pelo WhatsApp da loja</small>
      </h2>
      {suggestion ? (
        <>
          {highlight && !current && (
            <p className="alert alert-ok" role="status">
              Status salvo. Quer avisar o cliente? Revise a mensagem abaixo.
            </p>
          )}
          <p className="label">Mensagem sugerida para “{orderStatusLabel(suggestion.status, order.fulfillment)}”</p>
          <blockquote className="msg-preview">{suggestion.text}</blockquote>
          <div className="row-actions start">
            <a
              href={suggestion.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-sm ${current ? 'btn-outline' : 'btn-wa'}`}
              onClick={() => open.mutate(suggestion.status)}
              aria-label={`${current ? 'Abrir novamente' : 'Enviar atualização pelo WhatsApp'} para ${order.customerName} (nova aba)`}
            >
              <WhatsAppIcon /> {current ? 'Abrir no WhatsApp novamente' : 'Enviar atualização pelo WhatsApp'}
            </a>
            {current && current.state === 'WHATSAPP_OPENED' && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => confirmSent.mutate(current.id)} disabled={confirmSent.isPending} aria-busy={confirmSent.isPending}>
                <CheckIcon /> Já enviei esta mensagem
              </button>
            )}
          </div>
          <p className="notice">
            {current
              ? current.state === 'CONFIRMED_BY_STAFF'
                ? `Envio informado por ${current.confirmedBy?.name ?? 'um administrador'} às ${formatTime(current.confirmedAt!)}.`
                : `WhatsApp aberto por ${current.lastOpenedBy?.name ?? 'um administrador'} às ${formatTime(current.lastOpenedAt)}${current.openCount > 1 ? ` (${current.openCount} vezes)` : ''}. O sistema não sabe se a mensagem foi enviada.`
              : 'O botão abre o WhatsApp com o texto pronto; você revisa e toca em enviar. Nada é enviado automaticamente.'}
          </p>
        </>
      ) : (
        <p className="notice">
          {order.status === 'PENDING'
            ? 'O cliente acabou de enviar o pedido. Depois de aceitar, o painel sugere a mensagem de confirmação.'
            : 'Não há mensagem de atualização para esta situação.'}
        </p>
      )}
      {order.messages.length > 0 && (
        <details className="msg-history" open={order.messages.length <= 3}>
          <summary>Mensagens deste pedido ({order.messages.length})</summary>
          <ul>
            {order.messages.map((m) => (
              <li key={m.id}>
                <div className="msg-head">
                  <b>{orderStatusLabel(m.status, order.fulfillment)}</b>
                  <Tag tone={m.state === 'CONFIRMED_BY_STAFF' ? 'ok' : 'info'}>{m.state === 'CONFIRMED_BY_STAFF' ? 'Enviada (informado pela loja)' : 'WhatsApp aberto · envio não confirmado'}</Tag>
                </div>
                <small>
                  Aberto em {formatDateTime(m.openedAt)}
                  {m.openCount > 1 ? ` · ${m.openCount}× (último ${formatDateTime(m.lastOpenedAt)} por ${m.lastOpenedBy?.name ?? '—'})` : m.lastOpenedBy ? ` por ${m.lastOpenedBy.name}` : ''}
                  {m.confirmedAt ? ` · envio informado por ${m.confirmedBy?.name ?? '—'} em ${formatDateTime(m.confirmedAt)}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
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
    if (isCancel) {
      title = `Cancelar o pedido ${order.code}?`;
      confirmLabel = 'Cancelar pedido';
      danger = true;
      message = (
        <>
          <p>
            O pedido será cancelado e <b>as unidades reservadas voltarão ao estoque</b>. Esta ação não pode ser desfeita.
          </p>
          {order.paymentStatus === 'PAID' && (
            <p className="alert alert-warn">Este pedido está marcado como pago. Depois de devolver o valor ao cliente, registre o reembolso na seção Pagamento.</p>
          )}
        </>
      );
    } else {
      title = `${orderActionLabel(action.to, order.fulfillment)}?`;
      confirmLabel = orderActionLabel(action.to, order.fulfillment);
      message = (
        <>
          <p>
            O pedido {order.code} passará de <b>{orderStatusLabel(order.status, order.fulfillment)}</b> para <b>{orderStatusLabel(action.to, order.fulfillment)}</b>. Depois
            de concluído, ele não volta para etapas anteriores.
          </p>
          {order.paymentStatus === 'UNPAID' && <p className="alert alert-warn">O pagamento ainda consta como não pago. Se já recebeu, marque como pago na seção Pagamento.</p>}
        </>
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
        hint={isCancel ? 'Fica registrado no histórico do pedido. Não é enviado ao cliente.' : 'Aparece no histórico do pedido.'}
      >
        <textarea id="action-note" className="textarea" rows={3} maxLength={300} value={note} aria-invalid={!!noteError} onChange={(e) => onNote(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}

interface TimelineEvent {
  key: string;
  at: string;
  title: ReactNode;
  detail?: ReactNode;
  who?: string;
  tone?: 'muted';
}

function buildTimeline(o: AdminOrder): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (!o.statusHistory.some((h) => h.fromStatus === null)) events.push({ key: 'created', at: o.createdAt, title: 'Pedido registrado pelo site' });
  for (const h of o.statusHistory) {
    const isCreation = h.fromStatus === null;
    events.push({
      key: `s-${h.id}`,
      at: h.createdAt,
      title: isCreation ? 'Pedido registrado pelo site' : `${h.fromStatus ? `${orderStatusLabel(h.fromStatus, o.fulfillment)} → ` : ''}${h.toStatusLabel}`,
      detail: h.note ?? undefined,
      who: h.user?.name ?? (isCreation ? 'Site' : 'Sistema'),
    });
  }
  if (o.whatsappOpenedAt) events.push({ key: 'wa', at: o.whatsappOpenedAt, title: 'Cliente abriu o WhatsApp pelo site (não confirma envio)', tone: 'muted' });
  for (const m of o.messages) {
    events.push({
      key: `m-${m.id}`,
      at: m.openedAt,
      title: `Mensagem “${orderStatusLabel(m.status, o.fulfillment)}”: WhatsApp aberto pela loja`,
      detail: m.openCount > 1 ? `Aberto ${m.openCount} vezes.` : undefined,
      who: m.lastOpenedBy?.name,
      tone: 'muted',
    });
    if (m.confirmedAt) events.push({ key: `mc-${m.id}`, at: m.confirmedAt, title: `Mensagem “${orderStatusLabel(m.status, o.fulfillment)}”: envio informado`, who: m.confirmedBy?.name, tone: 'muted' });
  }
  for (const p of o.paymentHistory) {
    const from = p.from && PAYMENT_STATUS[p.from] ? PAYMENT_STATUS[p.from].label : null;
    const to = p.to && PAYMENT_STATUS[p.to] ? PAYMENT_STATUS[p.to].label : 'alterado';
    events.push({ key: `p-${p.id}`, at: p.createdAt, title: `Pagamento: ${from ? `${from} → ` : ''}${to}`, detail: p.note ?? undefined, who: p.user?.name ?? 'Sistema' });
  }
  if (o.stockReleasedAt) events.push({ key: 'stock', at: o.stockReleasedAt, title: 'Estoque devolvido', detail: 'A reserva dos itens voltou ao saldo dos produtos.' });
  return events
    .map((e, index) => ({ e, index, t: new Date(e.at).getTime() }))
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .map((x) => x.e);
}
