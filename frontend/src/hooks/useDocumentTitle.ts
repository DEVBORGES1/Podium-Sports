import { useEffect } from 'react';

export function useDocumentTitle(title: string | undefined, suffix = 'Podium Sports') {
  useEffect(() => {
    if (title) document.title = title === suffix ? title : `${title} · ${suffix}`;
  }, [title, suffix]);
}
