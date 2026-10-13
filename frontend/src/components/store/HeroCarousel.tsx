import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SlideData } from '../../lib/banner';
import type { Banner } from '../../types/api';
import { ChevronLeft, ChevronRight } from '../ui/Icons';
import { BannerSlide } from './BannerSlide';

/** Slide institucional exibido enquanto não há banners ativos. */
const fallbackSlide = (storeName: string): SlideData => ({
  kicker: storeName,
  title: 'Supere',
  highlight: 'seus limites',
  subtitle: null,
  footnote: null,
  priceOriginalCents: null,
  priceSaleCents: null,
  imageUrl: null,
  imageFrame: null,
  imageBg: null,
  mobileImageUrl: null,
  mobileImageBg: null,
  layout: 'full',
  contentAlign: 'left',
  overlay: 0,
  mobileLayout: 'full',
  mobileOverlay: 0,
  icon: 'trophy',
  colorFrom: '#2a2a2e',
  colorTo: '#0b0b0c',
  buttonLabel: 'Ver produtos →',
  buttonUrl: '/produtos',
  secondaryButtonLabel: null,
  secondaryButtonUrl: null,
  badgeTop: null,
  badgeMain: null,
  badgeBottom: null,
});

/**
 * Carrossel do hero (mesmo comportamento do original): avanço automático com barra de progresso,
 * setas, indicadores, swipe, teclado e pausa ao passar o mouse/focar/ocultar a aba. Botão de pausa (WCAG 2.2.2).
 */
export function HeroCarousel({ banners, intervalSeconds, storeName }: { banners: Banner[]; intervalSeconds: number; storeName: string }) {
  const [rawIndex, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = banners.length;
  const index = rawIndex < count ? rawIndex : 0;
  const paused = hoverPaused || userPaused || hidden || reduced || count < 2;

  const go = useCallback(
    (i: number) => {
      if (count === 0) return;
      setIndex(((i % count) + count) % count);
      setCycle((c) => c + 1); // reinicia a barra de progresso
    },
    [count],
  );

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);


  if (count === 0) {
    // Sem banners ativos: slide institucional coerente com o layout.
    return (
      <section className="hero hero-fallback" aria-label="Destaque">
        <div className="slides">
          <BannerSlide data={fallbackSlide(storeName)} active />
        </div>
      </section>
    );
  }

  return (
    <section
      className={`hero ${paused ? 'paused' : ''}`}
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) touch.current = { x: t.clientX, y: t.clientY };
        setHoverPaused(true);
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (t && touch.current) {
          const dx = t.clientX - touch.current.x;
          const dy = t.clientY - touch.current.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
        }
        touch.current = null;
        setHoverPaused(false);
      }}
    >
      <div className="slides" aria-live={paused ? 'polite' : 'off'}>
        {banners.map((b, i) => {
          const active = i === index;
          return (
            <BannerSlide
              key={b.id}
              data={b as SlideData}
              active={active}
              heading={i === 0 ? 'h1' : 'h2'}
              slideProps={{ role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} de ${count}`, 'aria-hidden': !active, inert: !active }}
            />
          );
        })}
      </div>
      {count > 1 && (
        <>
          <button type="button" className="hnav prev" aria-label="Slide anterior" onClick={() => go(index - 1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="hnav next" aria-label="Próximo slide" onClick={() => go(index + 1)}>
            <ChevronRight />
          </button>
          <div className="dots" style={{ '--dur': `${intervalSeconds}s` } as CSSProperties}>
            {banners.map((b, i) => (
              <button
                key={`${b.id}-${i === index ? cycle : 'idle'}`}
                type="button"
                className={i === index ? 'on' : ''}
                aria-label={`Ir para o slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
                onAnimationEnd={() => {
                  if (i === index && !paused) go(index + 1);
                }}
              />
            ))}
          </div>
          {!reduced && (
            <button
              type="button"
              className="hero-pause"
              aria-label={userPaused ? 'Retomar rotação dos slides' : 'Pausar rotação dos slides'}
              onClick={() => setUserPaused((v) => !v)}
            >
              {userPaused ? '▶' : '❚❚'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
