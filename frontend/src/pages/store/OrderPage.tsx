import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { InfoGlyph } from '../../components/ui/Icons';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSettings } from '../../hooks/useStoreData';
import { brl, formatDateTime } from '../../lib/format';
import { recallOrder, storeApi } from '../../lib/store-api';
import { buildOrderMessage, whatsappLink } from '../../lib/whatsapp';
import type { PublicOrder } from '../../types/api';

export default function OrderPage() {
  const { code = '' } = useParams();
  const location = useLocation();
  const settings = useSettings();
  const state = location.state as { order?: PublicOrder; token?: string; phone?: string } | null;
  const remembered = recallOrder(code);
  const token = state?.token ?? remembered?.token ?? null;
  const phone = state?.phone ?? remembered?.phone;
  const [opened, setOpened] = useState(false);
  useDocumentTitle(`Pedido ${code}`);

  const order = useQuery({
    queryKey: ['order', code],
    queryFn: () => storeApi.order(code, token!),
    enabled: !!token,
    initialData: state?.order,
    staleTime: 30_000,
  });

  if (!token) {
    return (
      <div className="wrap">
        <EmptyState title="Pedido não encontrado neste navegador">
          <p>Abra a confirmação no mesmo aparelho em que o pedido foi feito, ou fale com a loja informando o código {code}.</p>
          <Link to="/" className="btn btn-gold btn-sm">
            Voltar à loja
          </Link>
        </EmptyState>
      </div>
    );
  }
  if (order.isPending) return <LoadingState label="Carregando pedido…" />;
  if (order.isError) {
    return (
      <div className="wrap">
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      </div>
    );
  }

  const o = order.data;
  const s = settings.data!;
  const message = buildOrderMessage(o, s, phone);
  const link = whatsappLink(s.whatsappNumber, message);
  const alreadyOpened = opened || !!o.whatsappOpenedAt;
  const closed = o.status === 'CANCELLED' || o.status === 'EXPIRED';

  const onOpen = () => {
    setOpened(true);
    // Registra apenas que o cliente clicou para abrir o WhatsApp (não confirma envio).
    storeApi.whatsappOpened(o.code, token).catch(() => undefined);
  };

  return (
    <div className="wrap">
      <div className="order-hero">
        <div className="seal" aria-hidden>
          <InfoGlyph icon="whatsapp" width={36} height={36} />
        </div>
        <h1>{closed ? 'Pedido encerrado' : alreadyOpened ? 'Pedido registrado' : 'Falta só enviar!'}</h1>
        <p>
          Código do pedido: <span className="order-code">{o.code}</span>
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Registrado em {formatDateTime(o.createdAt)} · Situação: <b>{o.statusLabel}</b>
        </p>
      </div>

      <div className="order-layout">
        {!closed && (
          <section className="panel" aria-labelledby="next-title" style={{ textAlign: 'center' }}>
            <h2 id="next-title">Próximos passos</h2>
            <ol className="steps">
              <li>Toque no botão abaixo para abrir o WhatsApp com a mensagem do pedido pronta.</li>
              <li>
                <span>
                  <b>Confira e toque em enviar</b> — a mensagem não é enviada automaticamente.
                </span>
              </li>
              <li>A loja responde confirmando disponibilidade, tamanho/sabor, entrega e forma de pagamento.</li>
            </ol>
            <p style={{ marginTop: 18 }}>
              <a className="btn btn-wa" href={link} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
                {alreadyOpened ? 'Abrir o WhatsApp novamente' : 'Enviar pedido pelo WhatsApp'}
              </a>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              O pedido só é confirmado depois do retorno da loja. Nenhum pagamento é feito pelo site.
            </p>
          </section>
        )}

        <section className="panel" aria-labelledby="items-title">
          <h2 id="items-title">Itens</h2>
          <ul className="summary-list">
            {o.items.map((i, idx) => (
              <li key={idx}>
                <span>
                  {i.quantity}x {i.productName}
                  <span className="muted" style={{ display: 'block' }}>
                    {brl(i.unitPriceCents)} cada
                  </span>
                </span>
                <span>{brl(i.subtotalCents)}</span>
              </li>
            ))}
          </ul>
          {o.discountCents > 0 && (
            <div className="total sub">
              <span>Descontos</span>
              <span>-{brl(o.discountCents)}</span>
            </div>
          )}
          <div className="total" style={{ fontSize: 18 }}>
            <span>Total</span>
            <span>{brl(o.totalCents)}</span>
          </div>
          <div className="review" style={{ marginTop: 16 }}>
            <dl>
              <dt>Cliente</dt>
              <dd>{o.customerName}</dd>
              <dt>Recebimento</dt>
              <dd>
                {o.fulfillment === 'DELIVERY' && o.address
                  ? `Entrega — ${o.address.street}, ${o.address.number}, ${o.address.district}, ${o.address.city}`
                  : 'Retirada na loja'}
              </dd>
              {o.notes && (
                <>
                  <dt>Observações</dt>
                  <dd>{o.notes}</dd>
                </>
              )}
            </dl>
          </div>
        </section>
        <p style={{ textAlign: 'center' }}>
          <Link to="/produtos" className="btn btn-outline btn-sm">
            Continuar comprando
          </Link>
        </p>
      </div>
    </div>
  );
}
