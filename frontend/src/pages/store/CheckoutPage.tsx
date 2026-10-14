import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { ISSUE_TEXT } from '../../components/store/CartDrawer';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { useCart, useCartQuote } from '../../contexts/CartContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSettings } from '../../hooks/useStoreData';
import { ApiError, errorMessage } from '../../lib/api';
import { brl, maskPhone } from '../../lib/format';
import { rememberOrder, storeApi } from '../../lib/store-api';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
    phone: z.string().refine((v) => /^\d{10,11}$/.test(v.replace(/\D/g, '')), 'Informe um telefone com DDD.'),
    fulfillment: z.enum(['PICKUP', 'DELIVERY'], { error: 'Escolha como quer receber.' }),
    street: z.string().trim().max(160),
    number: z.string().trim().max(20),
    district: z.string().trim().max(100),
    city: z.string().trim().max(100),
    complement: z.string().trim().max(160),
    notes: z.string().trim().max(500, 'Máximo de 500 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment !== 'DELIVERY') return;
    const req: [keyof typeof v, string, number][] = [
      ['street', 'Informe a rua.', 2],
      ['number', 'Informe o número.', 1],
      ['district', 'Informe o bairro.', 2],
      ['city', 'Informe a cidade.', 2],
    ];
    for (const [field, message, min] of req) {
      if ((v[field] as string).length < min) ctx.addIssue({ code: 'custom', path: [field], message });
    }
  });

export type CheckoutForm = z.infer<typeof schema>;

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="err" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  useDocumentTitle('Finalizar pedido');
  const settings = useSettings();
  const { items, clear, setQuantity, remove } = useCart();
  const quote = useCartQuote(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Uma chave por tentativa de envio: repetir o clique não cria pedido duplicado.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const s = settings.data!;

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      fulfillment: s.pickupEnabled ? 'PICKUP' : 'DELIVERY',
      street: '',
      number: '',
      district: '',
      city: s.city?.split(',')[0]?.trim() ?? '',
      complement: '',
      notes: '',
    },
  });
  const { register, handleSubmit, formState, control } = form;
  const errors = formState.errors;
  const fulfillment = useWatch({ control, name: 'fulfillment' });

  if (items.length === 0) {
    return (
      <div className="wrap">
        <EmptyState title="Sua sacola está vazia">
          <p>Adicione produtos para finalizar o pedido.</p>
          <Link to="/produtos" className="btn btn-gold btn-sm">
            Ver produtos
          </Link>
        </EmptyState>
      </div>
    );
  }

  const q = quote.data;
  const canCheckout = !!q?.canCheckout && !quote.isFetching;

  const toReview = handleSubmit(() => {
    setIdempotencyKey(crypto.randomUUID().replace(/-/g, ''));
    setSubmitError(null);
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const confirm = async () => {
    if (submitting || !idempotencyKey) return;
    const v = form.getValues();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { order, accessToken } = await storeApi.createOrder(
        {
          customer: { name: v.name, phone: v.phone },
          fulfillment: v.fulfillment,
          address:
            v.fulfillment === 'DELIVERY'
              ? { street: v.street, number: v.number, district: v.district, city: v.city, complement: v.complement || null }
              : null,
          notes: v.notes || null,
          items: items.map((i) => ({ productId: i.productId, ...(i.variantId ? { variantId: i.variantId } : {}), quantity: i.quantity })),
        },
        idempotencyKey,
      );
      rememberOrder(order.code, accessToken, v.phone.replace(/\D/g, ''));
      clear();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(`/pedido/${order.code}`, { replace: true, state: { order, token: accessToken, phone: v.phone.replace(/\D/g, '') } });
    } catch (err) {
      if (err instanceof ApiError && ['ITEMS_UNAVAILABLE', 'INSUFFICIENT_STOCK'].includes(err.code)) {
        await quote.refetch();
        setStep('form');
        setIdempotencyKey(null);
      }
      if (err instanceof ApiError && err.status === 429) {
        setSubmitError('Muitas tentativas seguidas. Aguarde alguns minutos ou chame a loja no WhatsApp.');
      } else {
        setSubmitError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const summary = (
    <aside className="panel sticky" aria-labelledby="summary-title">
      <h2 id="summary-title">Resumo</h2>
      {quote.isPending && <LoadingState label="Conferindo preços e estoque…" />}
      {quote.isError && (
        <div className="alert alert-error" role="alert">
          {errorMessage(quote.error)}{' '}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => quote.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {q && (
        <>
          <ul className="summary-list">
            {items.map((item) => {
              const line = quote.lineFor(item);
              const variantLabel = line?.variantLabel ?? item.variantLabel;
              return (
                <li key={item.key}>
                  <span>
                    {item.quantity}x {line?.name ?? item.snapshot.name}
                    {variantLabel && <span className="muted"> ({variantLabel})</span>}
                    {line?.issue && (
                      <span className="err" style={{ display: 'block' }}>
                        {ISSUE_TEXT[line.issue]}{' '}
                        {line.issue === 'INSUFFICIENT_STOCK' && (line.maxQuantity ?? 0) > 0 ? (
                          <button type="button" className="remove" onClick={() => setQuantity(item.key, line.maxQuantity!)}>
                            Ajustar para {line.maxQuantity}
                          </button>
                        ) : (
                          <button type="button" className="remove" onClick={() => remove(item.key)}>
                            Remover
                          </button>
                        )}
                      </span>
                    )}
                    {line?.unitPriceCents !== undefined && <span className="muted" style={{ display: 'block' }}>{brl(line.unitPriceCents)} cada</span>}
                  </span>
                  <span>{line?.subtotalCents !== undefined ? brl(line.subtotalCents) : '—'}</span>
                </li>
              );
            })}
          </ul>
          {q.discountCents > 0 && (
            <>
              <div className="total sub">
                <span>Subtotal</span>
                <span>{brl(q.subtotalCents)}</span>
              </div>
              <div className="total sub">
                <span>Descontos</span>
                <span>-{brl(q.discountCents)}</span>
              </div>
            </>
          )}
          <div className="total" style={{ fontSize: 18, marginTop: 6 }}>
            <span>Total</span>
            <span>{brl(q.totalCents)}</span>
          </div>
          <p className="hint" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            {fulfillment === 'DELIVERY' ? (s.deliveryInfo ?? 'Taxa de entrega combinada pelo WhatsApp.') : (s.pickupInfo ?? '')} Pagamento combinado no atendimento.
          </p>
        </>
      )}
    </aside>
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Você está em">
          <Link to="/">Início</Link> <span aria-hidden>›</span> <span>Finalizar pedido</span>
        </nav>
        <h1 className="sec-title" style={{ textAlign: 'left', marginBottom: 8 }}>
          {step === 'form' ? 'Seus dados' : 'Confira seu pedido'}
        </h1>
      </div>
      <div className="checkout">
        {step === 'form' ? (
          <form className="panel" onSubmit={toReview} noValidate aria-labelledby="form-title">
            <h2 id="form-title">Contato</h2>
            <div className="form-grid two">
              <Field id="name" label="Nome" error={errors.name?.message}>
                <input id="name" className="input" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} {...register('name')} />
              </Field>
              <Field id="phone" label="WhatsApp / telefone" error={errors.phone?.message} hint="Com DDD, para a loja falar com você.">
                <input
                  id="phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(49) 99999-9999"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'phone-err' : undefined}
                  {...register('phone', { onChange: (e) => form.setValue('phone', maskPhone(e.target.value)) })}
                />
              </Field>
            </div>

            <h2 style={{ marginTop: 22 }}>Recebimento</h2>
            <fieldset style={{ border: 0 }}>
              <legend className="sr-only">Como você quer receber?</legend>
              <div className="choice-group">
                {s.pickupEnabled && (
                  <label className="choice">
                    <input type="radio" value="PICKUP" {...register('fulfillment')} />
                    <span>
                      <b>Retirar na loja</b>
                      <small>{s.pickupInfo ?? s.address ?? ''}</small>
                    </span>
                  </label>
                )}
                {s.deliveryEnabled && (
                  <label className="choice">
                    <input type="radio" value="DELIVERY" {...register('fulfillment')} />
                    <span>
                      <b>Entrega</b>
                      <small>{s.deliveryInfo ?? 'Taxa combinada pelo WhatsApp.'}</small>
                    </span>
                  </label>
                )}
              </div>
            </fieldset>

            {fulfillment === 'DELIVERY' && (
              <div className="form-grid two" style={{ marginTop: 14 }}>
                <Field id="street" label="Rua" error={errors.street?.message}>
                  <input id="street" className="input" autoComplete="address-line1" aria-invalid={!!errors.street} {...register('street')} />
                </Field>
                <Field id="number" label="Número" error={errors.number?.message}>
                  <input id="number" className="input" inputMode="numeric" aria-invalid={!!errors.number} {...register('number')} />
                </Field>
                <Field id="district" label="Bairro" error={errors.district?.message}>
                  <input id="district" className="input" aria-invalid={!!errors.district} {...register('district')} />
                </Field>
                <Field id="city" label="Cidade" error={errors.city?.message}>
                  <input id="city" className="input" autoComplete="address-level2" aria-invalid={!!errors.city} {...register('city')} />
                </Field>
                <div className="span-2">
                  <Field id="complement" label="Complemento / referência (opcional)" error={errors.complement?.message}>
                    <input id="complement" className="input" {...register('complement')} />
                  </Field>
                </div>
              </div>
            )}

            <h2 style={{ marginTop: 22 }}>Observações</h2>
            <Field id="notes" label="Tamanho, cor, sabor ou outra informação (opcional)" error={errors.notes?.message}>
              <textarea id="notes" className="textarea" maxLength={500} {...register('notes')} />
            </Field>

            {submitError && (
              <p className="alert alert-error" role="alert" style={{ marginTop: 16 }}>
                {submitError}
              </p>
            )}
            <div className="btns" style={{ marginTop: 20 }}>
              <button type="submit" className="btn btn-gold" disabled={!canCheckout}>
                Revisar pedido →
              </button>
              <Link to="/produtos" className="btn btn-outline">
                Continuar comprando
              </Link>
            </div>
            {q && !q.canCheckout && <p className="err" style={{ marginTop: 10 }}>Ajuste os itens indicados no resumo para continuar.</p>}
          </form>
        ) : (
          <section className="panel review" aria-labelledby="review-title">
            <h2 id="review-title">Confira antes de enviar</h2>
            <dl>
              <dt>Nome</dt>
              <dd>{form.getValues('name')}</dd>
              <dt>Telefone</dt>
              <dd>{form.getValues('phone')}</dd>
              <dt>Recebimento</dt>
              <dd>{fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada na loja'}</dd>
              {fulfillment === 'DELIVERY' && (
                <>
                  <dt>Endereço</dt>
                  <dd>
                    {form.getValues('street')}, {form.getValues('number')}
                    {form.getValues('complement') ? ` (${form.getValues('complement')})` : ''} — {form.getValues('district')}, {form.getValues('city')}
                  </dd>
                </>
              )}
              {form.getValues('notes') && (
                <>
                  <dt>Observações</dt>
                  <dd>{form.getValues('notes')}</dd>
                </>
              )}
            </dl>
            <p className="alert alert-warn" style={{ marginTop: 16 }}>
              Ao confirmar, o pedido é registrado e você será direcionado para enviá-lo pelo WhatsApp. A loja confirma disponibilidade, entrega e
              pagamento na conversa.
            </p>
            {submitError && (
              <p className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
                {submitError}
              </p>
            )}
            <div className="btns" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-wa" onClick={confirm} disabled={submitting || !canCheckout} aria-busy={submitting}>
                {submitting ? 'Registrando pedido…' : 'Confirmar pedido'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={submitting}
                onClick={() => {
                  setIdempotencyKey(null);
                  setStep('form');
                }}
              >
                Editar dados
              </button>
            </div>
          </section>
        )}
        {summary}
      </div>
    </div>
  );
}
