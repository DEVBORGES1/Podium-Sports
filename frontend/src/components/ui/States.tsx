import type { ReactNode } from 'react';
import { errorMessage } from '../../lib/api';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Não foi possível carregar' }: { error?: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="state error" role="alert">
      <h3>{title}</h3>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let p = Math.max(1, to - 4); p <= to; p++) pages.push(p);
  return (
    <nav className="pagination" aria-label="Paginação">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
        ‹
      </button>
      {pages.map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Página ${p}`}>
          {p}
        </button>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Próxima página">
        ›
      </button>
    </nav>
  );
}
