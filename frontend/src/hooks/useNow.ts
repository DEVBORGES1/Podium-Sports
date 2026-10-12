import { useEffect, useState } from 'react';

/** Horário atual atualizado periodicamente (para textos como "há 3 min"). */
export function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
