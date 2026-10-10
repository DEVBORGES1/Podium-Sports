import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import trophy from '../../assets/trophy.png';
import type { Banner } from '../../types/api';
import { CategoryGlyph, ChevronLeft, ChevronRight } from '../ui/Icons';
import { SmartLink } from '../ui/SmartLink';

function SlideArt({ banner }: { banner: Banner }) {
  if (!banner.icon) return null;
  return (
    <div className="hero-art" aria-hidden>
      <div className="ring">{banner.icon === 'trophy' ? <img src={trophy} alt="" /> : <CategoryGlyph icon={banner.icon} className="big" strokeWidth={1.1} />}</div>
      {banner.badgeMain && (
        <div className="badge">
          <div>
            {banner.badgeTop && <small>{banner.badgeTop}</small>}
            <strong>{banner.badgeMain}</strong>
            {banner.badgeBottom && <small>{banner.badgeBottom}</small>}
          </div>
        </div>
      )}
    </div>
  );
}

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
          <div className="slide active" style={{ '--sbg': 'radial-gradient(circle at 75% 40%,#2a2a2e 0,#0b0b0c 58%)' } as CSSProperties}>
            <div className="stripe s1" />
            <div className="stripe s2" />
            <div className="wrap">
              <div>
                <div className="kicker">
                  {storeName} <span className="slash">///</span>
                </div>
                <h2 className="h1">
                  <span className="l1">Supere</span>
                  <span>seus limites</span>
                </h2>
                <div className="btns">
                  <SmartLink to="/produtos" className="btn btn-gold">
                    Ver produtos →
                  </SmartLink>
                </div>
              </div>
              <SlideArt banner={{ icon: 'trophy' } as Banner} />
            </div>
          </div>
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
          const style = {
            '--sbg': `radial-gradient(circle at 75% 40%,${b.colorFrom} 0,${b.colorTo} 58%)`,
            ...(b.imageUrl ? { '--simg': `url("${encodeURI(b.imageUrl)}")` } : {}),
          } as CSSProperties;
          const Heading = i === 0 ? 'h1' : 'h2';
          return (
            <div
              key={b.id}
              className={`slide ${active ? 'active' : ''} ${b.imageUrl ? 'has-photo' : ''}`}
              style={style}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${count}`}
              aria-hidden={!active}
              inert={!active}
            >
              <div className="stripe s1" />
              <div className="stripe s2" />
              <div className="wrap">
                <div>
                  {b.kicker && (
                    <div className="kicker">
                      {b.kicker} <span className="slash">///</span>
                    </div>
                  )}
                  <Heading className="h1">
                    <span className="l1">{b.title}</span>
                    {b.highlight && <span>{b.highlight}</span>}
                  </Heading>
                  {b.subtitle && <p>{b.subtitle}</p>}
                  {(b.buttonUrl || b.secondaryButtonUrl) && (
                    <div className="btns">
                      {b.buttonUrl && b.buttonLabel && (
                        <SmartLink to={b.buttonUrl} className="btn btn-gold">
                          {b.buttonLabel}
                        </SmartLink>
                      )}
                      {b.secondaryButtonUrl && b.secondaryButtonLabel && (
                        <SmartLink to={b.secondaryButtonUrl} className="btn btn-ghost">
                          {b.secondaryButtonLabel}
                        </SmartLink>
                      )}
                    </div>
                  )}
                </div>
                <SlideArt banner={b} />
              </div>
            </div>
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
