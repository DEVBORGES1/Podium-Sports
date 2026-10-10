import { useRef, useState, type ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { adminApi, errorMessage, request } from '../../lib/api';
import { centsToInput, parseMoneyToCents } from '../../lib/format';
import type { Tone } from '../../lib/labels';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adm-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function FormField({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Campo de valor em reais que trabalha com centavos. */
export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  placeholder = '0,00',
}: {
  id: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(centsToInput(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseMoneyToCents(text) !== value) setText(centsToInput(value));
  }
  return (
    <div className="money">
      <span aria-hidden>R$</span>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        placeholder={placeholder}
        aria-invalid={invalid}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoneyToCents(e.target.value));
        }}
        onBlur={() => setText(centsToInput(parseMoneyToCents(text)))}
      />
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, ref);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            Voltar
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? 'btn-dark' : 'btn-gold'}`}
            style={danger ? { background: 'var(--danger)' } : undefined}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
      {children}
    </Modal>
  );
}

/** Upload de imagem única (categoria, banner ou logotipo). Devolve o caminho no Storage. */
export function ImageUpload({
  folder,
  url,
  onUploaded,
  onRemove,
  variant = 'wide',
  label = 'Imagem',
}: {
  folder: 'categories' | 'banners' | 'store';
  url: string | null;
  onUploaded: (path: string, url: string) => void;
  onRemove?: () => void;
  variant?: 'wide' | 'square' | 'logo';
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Use JPG, PNG ou WEBP.');
    if (file.size > 5 * 1024 * 1024) return setError('A imagem deve ter no máximo 5 MB.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await request<{ path: string; url: string }>(`/admin/uploads`, { method: 'POST', body: fd, auth: true, query: { folder } });
      onUploaded(res.path, res.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="uploader">
      <div className={`preview ${variant === 'square' ? 'square' : variant === 'logo' ? 'logo' : ''}`}>{url ? <img src={url} alt={`Prévia: ${label}`} /> : <span>Sem imagem</span>}</div>
      <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
        <label className="btn btn-outline btn-sm" aria-busy={busy}>
          {busy ? 'Enviando…' : url ? 'Trocar imagem' : 'Enviar imagem'}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {url && onRemove && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onRemove}>
            Remover
          </button>
        )}
      </div>
      <span className="hint">JPG, PNG ou WEBP até 5 MB.</span>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TableState({ colSpan, loading, error, empty, onRetry }: { colSpan: number; loading?: boolean; error?: unknown; empty?: string; onRetry?: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-row">
        {loading ? (
          'Carregando…'
        ) : error ? (
          <>
            {errorMessage(error)}{' '}
            {onRetry && (
              <button type="button" className="link-btn" onClick={onRetry}>
                Tentar novamente
              </button>
            )}
          </>
        ) : (
          empty
        )}
      </td>
    </tr>
  );
}

export { adminApi };
