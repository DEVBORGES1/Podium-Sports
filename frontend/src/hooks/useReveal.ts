import { useEffect, useRef, type RefObject } from 'react';

const reduceMotion = () => typeof window === 'undefined' || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animação "revelar ao rolar" do site original, aplicada aos elementos com data-reveal.
 * Um único observer vive enquanto o componente estiver montado; a cada renderização,
 * elementos novos (ex.: carregados depois da API) passam a ser observados.
 */
export function useReveal(ref: RefObject<HTMLElement | null>) {
  const observer = useRef<IntersectionObserver | null>(null);

  const register = (root: HTMLElement) => {
    const io = observer.current;
    root.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)').forEach((el) => {
      if (!io) {
        el.classList.add('in');
        return;
      }
      if (!el.classList.contains('reveal')) {
        const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.hasAttribute('data-reveal')) : [];
        el.style.setProperty('--d', `${Math.max(0, siblings.indexOf(el)) * 0.08}s`);
        el.classList.add('reveal');
      }
      io.observe(el); // observar de novo o mesmo elemento é inofensivo
    });
  };

  useEffect(() => {
    if (reduceMotion()) return;
    observer.current = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            observer.current?.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    if (ref.current) register(ref.current);
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ref.current) register(ref.current);
  });
}
