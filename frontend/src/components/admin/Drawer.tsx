import { useRef, type ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { CloseIcon } from './AdminIcons';

/** Painel lateral (detalhes sem sair da lista). Esc fecha, foco preso dentro e devolvido ao fechar. */
export function Drawer({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, ref);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="side-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
        <div className="side-drawer-head">
          <h2 id="drawer-title">{title}</h2>
          <div className="side-drawer-actions">
            {actions}
            <button type="button" className="btn btn-quiet btn-sm btn-icon" onClick={onClose} aria-label="Fechar">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="side-drawer-body">{children}</div>
      </div>
    </div>
  );
}
