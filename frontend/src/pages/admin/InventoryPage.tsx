import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormField, Modal, PageHeader, TableState, Tag } from '../../components/admin/ui';
import { Pagination } from '../../components/ui/States';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { AVAILABILITY_LABEL, MOVEMENT_TYPE } from '../../lib/labels';
import type { AdminCategory, InventoryMovement, InventoryRow, MovementType } from '../../types/admin';
import type { Page } from '../../types/api';

type Tab = 'balances' | 'movements';
const TABS: { id: Tab; label: string }[] = [
  { id: 'balances', label: 'Saldo atual' },
  { id: 'movements', label: 'Histórico de movimentações' },
];
const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE) as MovementType[];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte "AAAA-MM-DD" (data local) no instante ISO do início ou do fim daquele dia. */
function dayBoundary(value: string, end: boolean) {
  if (!DATE_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Invalida tudo que depende do saldo: estoque, movimentações, produtos, dashboard e loja. */
const STOCK_KEYS = [['admin', 'inventory'], ['admin', 'products'], ['admin', 'product'], ['admin', 'dashboard'], ['products']];

type SetParam = (k: string, v: string) => void;

export default function InventoryPage() {
  useDocumentTitle('Estoque');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'movements' ? 'movements' : 'balances';

  const set: SetParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const selectTab = (t: Tab, extra?: Record<string, string>) => {
    // Cada aba tem seus próprios filtros: ao trocar, começa limpa.
    const next = new URLSearchParams(t === 'movements' ? { tab: t, ...extra } : extra);
    setParams(next);
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nextTab = tab === 'balances' ? 'movements' : 'balances';
    selectTab(nextTab);
    document.getElementById(`tab-${nextTab}`)?.focus();
  };

  return (
    <>
      <PageHeader title="Estoque" description="Quanto há de cada produto. Use + e − na tabela e salve os ajustes de uma vez, ou “Lançar” para entrada, saída ou ajuste com motivo." />
      <p className="notice" style={{ marginBottom: 14 }}>
        Pedidos reservam as unidades automaticamente e devolvem se forem cancelados. Toda alteração fica no histórico com data, responsável e motivo.
      </p>
      <div className="tabs" role="tablist" aria-label="Seções do estoque">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => tab !== t.id && selectTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'balances' ? (
          <BalancesTab params={params} set={set} onHistory={(productId) => selectTab('movements', { productId })} />
        ) : (
          <MovementsTab params={params} set={set} />
        )}
      </div>
    </>
  );
}

// ---------------- Saldos ----------------

/** Ajuste pendente de um produto (+ / − na tabela), guardado até "Salvar ajustes". */
interface PendingAdjust {
  delta: number;
  name: string;
  /** Saldo exibido quando o ajuste começou (para o resumo, mesmo com o produto fora da página atual). */
  base: number;
}

function BalancesTab({ params, set, onHistory }: { params: URLSearchParams; set: SetParam; onHistory: (productId: string) => void }) {
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const [moving, setMoving] = useState<InventoryRow | null>(null);
  const [adjust, setAdjust] = useState<Record<string, PendingAdjust>>({});
  const stockParam = params.get('stock') ?? '';
  const filters = {
    q,
    categoryId: params.get('categoryId') ?? '',
    stock: ['low', 'out', 'ok'].includes(stockParam) ? stockParam : '',
    page: Number(params.get('page')) || 1,
    pageSize: 25,
  };

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items) });
  const rows = useQuery({
    queryKey: ['admin', 'inventory', 'balances', filters],
    queryFn: () => adminApi.get<Page<InventoryRow>>('/inventory', filters),
    placeholderData: keepPreviousData,
  });

  const step = (r: InventoryRow, d: number) =>
    setAdjust((cur) => {
      const prev = cur[r.productId];
      const delta = Math.max(-r.stockQuantity, Math.min(100_000, (prev?.delta ?? 0) + d));
      const next = { ...cur };
      if (delta === 0) delete next[r.productId];
      else next[r.productId] = { delta, name: r.name, base: prev?.base ?? r.stockQuantity };
      return next;
    });

  return (
    <>
      <div className="filters-bar">
        <div className="field grow">
          <label htmlFor="inv-q">Buscar produto</label>
          <input
            id="inv-q"
            className="input"
            type="search"
            placeholder="Nome, marca ou categoria"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              set('q', e.target.value.trim());
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="inv-cat">Categoria</label>
          <select id="inv-cat" className="select" value={filters.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Todas</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="inv-stock">Situação</label>
          <select id="inv-stock" className="select" value={filters.stock} onChange={(e) => set('stock', e.target.value)}>
            <option value="">Todas</option>
            <option value="low">Baixo</option>
            <option value="out">Esgotado</option>
            <option value="ok">Normal</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="adm-table stock-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Saldo</th>
              <th className="num" title="Quantidade em pedidos ainda abertos (já descontada do saldo)">
                Reservado
              </th>
              <th className="num" title="Avisar quando o saldo chegar a este número">
                Avisar em
              </th>
              <th>Situação</th>
              <th>Última movimentação</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.isPending || rows.isError || rows.data.items.length === 0 ? (
              <TableState colSpan={7} loading={rows.isPending} error={rows.error} empty="Nenhum produto encontrado." onRetry={() => rows.refetch()} />
            ) : (
              rows.data.items.map((r) => {
                const delta = adjust[r.productId]?.delta ?? 0;
                const n = r.stockQuantity + delta;
                const status = n === 0 ? 'OUT_OF_STOCK' : n <= r.minStock ? 'LOW_STOCK' : 'IN_STOCK';
                const st = AVAILABILITY_LABEL[delta ? status : r.status];
                const pct = Math.min(100, (n / Math.max(1, r.minStock * 4)) * 100);
                return (
                  <tr key={r.productId} className={delta ? 'changed' : undefined}>
                    <td>
                      <Link to={`/admin/products/${r.productId}`}>
                        <b>{r.name}</b>
                      </Link>
                      <div className="muted">
                        {r.categoryName}
                        {!r.isActive && (
                          <>
                            {' '}
                            <Tag>Inativo</Tag>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="stepper" role="group" aria-label={`Saldo de ${r.name}`}>
                        <button type="button" onClick={() => step(r, -1)} disabled={n <= 0} aria-label={`Diminuir estoque de ${r.name}`}>
                          −
                        </button>
                        <output aria-live="polite" className={status === 'OUT_OF_STOCK' ? 'out' : status === 'LOW_STOCK' ? 'low' : ''}>
                          {n}
                        </output>
                        <button type="button" onClick={() => step(r, 1)} aria-label={`Aumentar estoque de ${r.name}`}>
                          +
                        </button>
                        {delta !== 0 && <span className="delta">{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}</span>}
                      </div>
                      <span className="meter stock-meter" aria-hidden>
                        <span style={{ width: `${pct}%` }} className={status === 'OUT_OF_STOCK' ? 'out' : status === 'LOW_STOCK' ? 'low' : 'ok'} />
                      </span>
                    </td>
                    <td className="num">{r.reservedInOpenOrders}</td>
                    <td className="num">
                      <MinStockInput row={r} />
                    </td>
                    <td>
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.lastMovementAt ? formatDateTime(r.lastMovementAt) : <span className="muted">—</span>}</td>
                    <td>
                      <div className="row-actions nowrap">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setMoving(r)}
                          aria-label={`Lançar movimentação de ${r.name}`}
                          title="Entrada, saída ou ajuste com motivo"
                        >
                          Lançar…
                        </button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onHistory(r.productId)} aria-label={`Histórico de ${r.name}`}>
                          Histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.data && <Pagination page={rows.data.page} totalPages={rows.data.totalPages} onChange={(p) => set('page', String(p))} />}
      <p className="notice" style={{ marginTop: 12 }}>
        "Reservado" mostra as unidades em pedidos abertos — elas já foram descontadas do saldo e voltam automaticamente se o pedido for cancelado ou expirar.
      </p>
      <AdjustBar adjust={adjust} onDone={() => setAdjust({})} />
      {moving && <MovementModal row={moving} initialType="IN" onClose={() => setMoving(null)} />}
    </>
  );
}

/** Barra fixa com os ajustes pendentes: grava todos de uma vez (tudo ou nada) ou descarta. */
function AdjustBar({ adjust, onDone }: { adjust: Record<string, PendingAdjust>; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const ids = Object.keys(adjust);
  const hasOut = ids.some((id) => adjust[id]!.delta < 0);

  // Ajustes não salvos: o navegador pergunta antes de fechar ou recarregar a página.
  useEffect(() => {
    if (ids.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [ids.length]);

  const save = useAdminMutation(
    () =>
      adminApi.post<{ items: CreatedMovement[] }>('/inventory/movements/batch', {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        items: ids.map((productId) => ({ productId, delta: adjust[productId]!.delta })),
      }),
    {
      success: (r) => {
        const only = r.items.length === 1 ? r.items[0]! : null;
        return only
          ? `Estoque atualizado: ${adjust[ids[0]!]!.name} passou de ${only.balanceBefore} para ${only.balanceAfter}.`
          : `Estoque atualizado em ${r.items.length} produtos.`;
      },
      invalidate: STOCK_KEYS,
      onSuccess: () => {
        setReason('');
        onDone();
      },
    },
  );

  if (ids.length === 0) return null;
  const summary = ids
    .slice(0, 3)
    .map((id) => {
      const a = adjust[id]!;
      return `${a.name}: ${a.base} → ${a.base + a.delta}`;
    })
    .join(' · ');

  const submit = () => {
    if (save.isPending) return;
    if (hasOut && reason.trim().length < 3) return setReasonError('Informe o motivo das saídas (mínimo 3 caracteres).');
    setReasonError(null);
    save.mutate(undefined);
  };

  return (
    <div className="form-bar adjust-bar" role="region" aria-label="Ajustes de estoque não salvos">
      <div className="adjust-info">
        <b>
          {ids.length} ajuste{ids.length > 1 ? 's' : ''} de estoque não salvo{ids.length > 1 ? 's' : ''}
        </b>
        <span>
          {summary}
          {ids.length > 3 && ` · +${ids.length - 3}`}
        </span>
      </div>
      <div className="adjust-reason">
        <label htmlFor="adjust-reason" className="sr-only">
          Motivo dos ajustes
        </label>
        <input
          id="adjust-reason"
          className="input"
          maxLength={300}
          placeholder={hasOut ? 'Motivo (obrigatório para saídas)' : 'Motivo (opcional), ex.: NF 4471'}
          value={reason}
          aria-invalid={!!reasonError}
          aria-describedby={reasonError ? 'adjust-reason-err' : undefined}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {reasonError && (
          <span className="err" id="adjust-reason-err" role="alert">
            {reasonError}
          </span>
        )}
      </div>
      <button type="button" className="btn btn-quiet btn-sm" onClick={onDone} disabled={save.isPending}>
        Descartar
      </button>
      <button type="button" className="btn btn-gold btn-sm" onClick={submit} disabled={save.isPending} aria-busy={save.isPending}>
        Salvar ajustes
      </button>
    </div>
  );
}

/** Estoque mínimo editável na própria linha: salva ao sair do campo ou com Enter. */
function MinStockInput({ row }: { row: InventoryRow }) {
  const [value, setValue] = useState(String(row.minStock));
  const [lastSaved, setLastSaved] = useState(row.minStock);
  if (row.minStock !== lastSaved) {
    setLastSaved(row.minStock);
    setValue(String(row.minStock));
  }
  const save = useAdminMutation((minStock: number) => adminApi.patch(`/inventory/${row.productId}`, { minStock }), {
    success: `Estoque mínimo de "${row.name}" atualizado.`,
    invalidate: STOCK_KEYS,
  });
  const commit = () => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isInteger(n) || n < 0 || n > 1_000_000) {
      setValue(String(row.minStock));
      return;
    }
    if (n === row.minStock || save.isPending) return;
    save.mutate(n, { onError: () => setValue(String(row.minStock)) });
  };
  return (
    <>
      <label htmlFor={`min-${row.productId}`} className="sr-only">
        Estoque mínimo de {row.name}
      </label>
      <input
        id={`min-${row.productId}`}
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={save.isPending}
        aria-busy={save.isPending}
        style={{ width: 76, padding: '6px 8px', fontSize: 14, textAlign: 'right' }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setValue(String(row.minStock));
          }
        }}
      />
    </>
  );
}

// ---------------- Formulário de movimentação ----------------

const movementSchema = z
  .object({
    type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
    quantity: z.number().optional(),
    newBalance: z.number().optional(),
    reason: z.string().trim().max(300, 'Máximo de 300 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'ADJUSTMENT') {
      if (v.newBalance === undefined || !Number.isInteger(v.newBalance) || v.newBalance < 0) {
        ctx.addIssue({ code: 'custom', path: ['newBalance'], message: 'Informe o novo saldo (número inteiro, 0 ou mais).' });
      } else if (v.newBalance > 1_000_000) {
        ctx.addIssue({ code: 'custom', path: ['newBalance'], message: 'Saldo máximo: 1.000.000.' });
      }
    } else if (v.quantity === undefined || !Number.isInteger(v.quantity) || v.quantity < 1) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Informe uma quantidade inteira maior que zero.' });
    } else if (v.quantity > 100_000) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantidade máxima: 100.000.' });
    }
    if (v.type !== 'IN' && v.reason.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Informe a justificativa (mínimo 3 caracteres).' });
    }
  });
type MovementForm = z.infer<typeof movementSchema>;

interface CreatedMovement {
  id: string;
  balanceBefore: number;
  balanceAfter: number;
}

const toOptionalInt = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const MOVEMENT_TITLE: Record<MovementForm['type'], string> = { IN: 'Adicionar estoque', OUT: 'Registrar saída', ADJUSTMENT: 'Ajustar quantidade' };

function MovementModal({ row, initialType, onClose }: { row: InventoryRow; initialType: MovementForm['type']; onClose: () => void }) {
  const { register, control, handleSubmit, formState, setError } = useForm<MovementForm>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: initialType, quantity: undefined, newBalance: undefined, reason: '' },
  });
  // Ajuste substitui o saldo: pede uma segunda confirmação mostrando o antes e o depois.
  const [confirmAdjust, setConfirmAdjust] = useState<MovementForm | null>(null);
  const errors = formState.errors;
  const [type, quantity, newBalance] = useWatch({ control, name: ['type', 'quantity', 'newBalance'] });

  const create = useAdminMutation(
    (v: MovementForm) => {
      const body =
        v.type === 'ADJUSTMENT'
          ? { type: v.type, productId: row.productId, newBalance: v.newBalance, reason: v.reason }
          : { type: v.type, productId: row.productId, quantity: v.quantity, ...(v.reason ? { reason: v.reason } : {}) };
      return adminApi.post<CreatedMovement>('/inventory/movements', body);
    },
    {
      success: (m) => `Estoque atualizado: ${row.name} passou de ${m.balanceBefore} para ${m.balanceAfter}.`,
      invalidate: STOCK_KEYS,
      onSuccess: onClose,
    },
  );
  const busy = create.isPending || formState.isSubmitting;

  const current = row.stockQuantity;
  const validNumber = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n >= 0;
  let preview: number | null = null;
  if (type === 'ADJUSTMENT') preview = validNumber(newBalance) ? (newBalance as number) : null;
  else if (validNumber(quantity) && (quantity as number) > 0) preview = type === 'IN' ? current + (quantity as number) : current - (quantity as number);

  const onSubmit = handleSubmit((v) => {
    if (create.isPending) return;
    if (v.type === 'ADJUSTMENT' && v.newBalance === current) {
      setError('newBalance', { message: `O saldo já é ${current}. Nenhum ajuste necessário.` });
      return;
    }
    if (v.type === 'OUT' && (v.quantity ?? 0) > current) {
      setError('quantity', { message: `Saldo insuficiente. Disponível: ${current}.` });
      return;
    }
    if (v.type === 'ADJUSTMENT' && !confirmAdjust) {
      setConfirmAdjust(v);
      return;
    }
    send(v);
  });

  const send = (v: MovementForm) =>
    create.mutate(v, {
      onError: (err) => {
        if (err instanceof ApiError) {
          for (const issue of err.fieldIssues) {
            const field = issue.field === 'newBalance' || issue.field === 'quantity' || issue.field === 'reason' ? issue.field : null;
            if (field) setError(field, { message: issue.message });
          }
        }
        setConfirmAdjust(null);
      },
    });

  const reasonRequired = type !== 'IN';

  return (
    <Modal
      title={`${MOVEMENT_TITLE[type ?? initialType]} — ${row.name}`}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => (confirmAdjust ? setConfirmAdjust(null) : onClose())} disabled={busy}>
            {confirmAdjust ? 'Voltar' : 'Cancelar'}
          </button>
          {confirmAdjust ? (
            <button type="button" className="btn btn-gold btn-sm" disabled={busy} aria-busy={busy} onClick={() => send(confirmAdjust)}>
              Confirmar: {current} → {confirmAdjust.newBalance}
            </button>
          ) : (
            <button type="submit" form="movement-form" className="btn btn-gold btn-sm" disabled={busy} aria-busy={busy}>
              {type === 'ADJUSTMENT' ? 'Revisar ajuste' : MOVEMENT_TITLE[type ?? initialType]}
            </button>
          )}
        </>
      }
    >
      <form id="movement-form" onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: 14 }}>
        <dl className="info-list">
          <dt>Saldo atual</dt>
          <dd>
            <b>{current}</b>
          </dd>
          <dt>Reservado em pedidos abertos</dt>
          <dd>{row.reservedInOpenOrders}</dd>
        </dl>
        {confirmAdjust && (
          <p className="alert alert-warn" role="alert" style={{ margin: 0 }}>
            Confirme o ajuste: o saldo de <b>{row.name}</b> passará de <b>{current}</b> para <b>{confirmAdjust.newBalance}</b> (
            {(confirmAdjust.newBalance ?? 0) - current >= 0 ? '+' : '−'}
            {Math.abs((confirmAdjust.newBalance ?? 0) - current)}). Motivo: “{confirmAdjust.reason}”.
          </p>
        )}
        {/* Na revisão do ajuste os campos ficam travados: o que foi revisado é exatamente o que será gravado. */}
        <fieldset className="plain-fieldset" disabled={!!confirmAdjust}>
          <FormField id="mv-type" label="O que aconteceu?">
            <select id="mv-type" className="select" {...register('type')}>
              <option value="IN">Chegou mercadoria (adicionar ao estoque)</option>
              <option value="OUT">Saída: perda, avaria ou uso interno</option>
              <option value="ADJUSTMENT">Contei o estoque e o número está diferente (ajuste)</option>
            </select>
          </FormField>
          {type === 'ADJUSTMENT' ? (
            <FormField id="mv-newBalance" label="Novo saldo" error={errors.newBalance?.message} hint="Quantidade real contada no estoque.">
              <input
                key="newBalance"
                id="mv-newBalance"
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-invalid={!!errors.newBalance}
                {...register('newBalance', { setValueAs: toOptionalInt })}
              />
            </FormField>
          ) : (
            <FormField id="mv-quantity" label="Quantidade" error={errors.quantity?.message}>
              <input
                key="quantity"
                id="mv-quantity"
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                aria-invalid={!!errors.quantity}
                {...register('quantity', { setValueAs: toOptionalInt })}
              />
            </FormField>
          )}
          <FormField
            id="mv-reason"
            label={reasonRequired ? 'Justificativa (obrigatória)' : 'Justificativa (opcional)'}
            error={errors.reason?.message}
            hint={reasonRequired ? 'Ex.: avaria, perda, contagem de inventário.' : 'Ex.: nota fiscal do fornecedor.'}
          >
            <textarea id="mv-reason" className="textarea" rows={2} maxLength={300} aria-invalid={!!errors.reason} {...register('reason')} />
          </FormField>
        </fieldset>
        <p className={`alert ${preview !== null && preview < 0 ? 'alert-error' : 'alert-warn'}`} role="status" aria-live="polite" style={{ margin: 0 }}>
          {preview === null ? (
            <>Saldo atual: {current}. Preencha a quantidade para ver o saldo resultante.</>
          ) : preview < 0 ? (
            <>Saldo insuficiente: a saída deixaria o saldo em {preview}. Disponível: {current}.</>
          ) : (
            <>
              Saldo resultante: <b>{current}</b> → <b>{preview}</b> ({preview - current >= 0 ? '+' : '−'}
              {Math.abs(preview - current)})
            </>
          )}
        </p>
        {create.isError && (
          <p className="alert alert-error" role="alert" style={{ margin: 0 }}>
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

// ---------------- Movimentações ----------------

function MovementsTab({ params, set }: { params: URLSearchParams; set: SetParam }) {
  const typeParam = params.get('type') ?? '';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const productId = params.get('productId') ?? '';
  const filters = {
    productId,
    type: (MOVEMENT_TYPES as string[]).includes(typeParam) ? typeParam : '',
    from: dayBoundary(fromDate, false),
    to: dayBoundary(toDate, true),
    page: Number(params.get('page')) || 1,
    pageSize: 30,
  };

  const movements = useQuery({
    queryKey: ['admin', 'inventory', 'movements', filters],
    queryFn: () => adminApi.get<Page<InventoryMovement>>('/inventory/movements', filters),
    placeholderData: keepPreviousData,
  });
  const productName = productId ? (movements.data?.items.find((m) => m.product.id === productId)?.product.name ?? 'Produto selecionado') : null;

  return (
    <>
      <div className="filters-bar">
        <div className="field">
          <label htmlFor="mv-filter-type">Tipo</label>
          <select id="mv-filter-type" className="select" value={filters.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">Todos</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mv-from">De</label>
          <input id="mv-from" className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mv-to">Até</label>
          <input id="mv-to" className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => set('to', e.target.value)} />
        </div>
        {productName && (
          <div className="field">
            <span className="label">Produto</span>
            <button type="button" className="chip active" onClick={() => set('productId', '')} aria-label={`Remover filtro do produto ${productName}`}>
              {productName} ×
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Tipo</th>
              <th className="num">Quantidade</th>
              <th className="num">Saldo</th>
              <th>Justificativa</th>
              <th>Responsável</th>
              <th>Pedido</th>
            </tr>
          </thead>
          <tbody>
            {movements.isPending || movements.isError || movements.data.items.length === 0 ? (
              <TableState colSpan={8} loading={movements.isPending} error={movements.error} empty="Nenhuma movimentação encontrada." onRetry={() => movements.refetch()} />
            ) : (
              movements.data.items.map((m) => {
                const t = MOVEMENT_TYPE[m.type];
                return (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.createdAt)}</td>
                    <td>
                      <Link to={`/admin/products/${m.product.id}`}>{m.product.name}</Link>
                    </td>
                    <td>
                      <Tag tone={t.tone}>{t.label}</Tag>
                    </td>
                    <td className="num" style={{ color: m.quantity > 0 ? 'var(--ok)' : m.quantity < 0 ? 'var(--danger)' : undefined, fontWeight: 700 }}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity < 0 ? `−${Math.abs(m.quantity)}` : '0'}
                    </td>
                    <td className="num">
                      {m.balanceBefore} → <b>{m.balanceAfter}</b>
                    </td>
                    <td>{m.reason ?? <span className="muted">—</span>}</td>
                    <td>{m.user?.name ?? <span className="muted">Sistema</span>}</td>
                    <td>{m.order ? <Link to={`/admin/orders/${m.order.id}`}>{m.order.code}</Link> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {movements.data && <Pagination page={movements.data.page} totalPages={movements.data.totalPages} onChange={(p) => set('page', String(p))} />}
    </>
  );
}
