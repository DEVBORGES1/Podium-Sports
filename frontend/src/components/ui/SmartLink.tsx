import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Link interno (rota da loja) ou externo https (nova aba). Outros esquemas são ignorados. */
export function SmartLink({ to, className, children, onClick }: { to: string; className?: string; children: ReactNode; onClick?: () => void }) {
  if (to.startsWith('/') && !to.startsWith('//')) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  if (/^https:\/\//.test(to)) {
    return (
      <a href={to} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}
