import { useEffect } from 'react';

let baseTitle = typeof document !== 'undefined' ? document.title : '';
let badge = '';
const apply = () => {
  document.title = `${badge}${baseTitle}`;
};

/** Prefixo do título da aba (ex.: "(2) " com pedidos aguardando), visível mesmo com a aba em segundo plano. */
export function setTitleBadge(value: string) {
  badge = value;
  apply();
}

export function useDocumentTitle(title: string | undefined, suffix = 'Podium Sports') {
  useEffect(() => {
    if (!title) return;
    baseTitle = title === suffix ? title : `${title} · ${suffix}`;
    apply();
  }, [title, suffix]);
}
