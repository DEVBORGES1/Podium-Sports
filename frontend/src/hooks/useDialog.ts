import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogos abertos, do mais antigo ao mais recente: só o do topo responde a Esc e Tab (ex.: confirmação dentro do painel lateral). */
const stack: object[] = [];

/** Comportamento acessível de diálogo: foco inicial, Tab preso dentro, Esc fecha e foco devolvido. */
export function useDialog(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  const previous = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    previous.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    window.setTimeout(() => (first ?? node)?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous.current?.focus?.();
    };
  }, [open, ref]);
}
