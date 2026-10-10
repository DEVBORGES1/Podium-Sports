import type { CSSProperties } from 'react';
import trophy from '../../assets/trophy.png';
import { CategoryGlyph } from '../ui/Icons';
import '../../styles/store.css';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const BANNER_ICONS = ['trophy', 'ball', 'run', 'jar', 'shirt', 'glove', 'dumbbell', 'shoe'] as const;
export type BannerIcon = (typeof BANNER_ICONS)[number];

export interface SlideData {
  kicker: string | null;
  title: string;
  highlight: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  icon: BannerIcon | null;
  colorFrom: string;
  colorTo: string;
  buttonLabel: string | null;
  secondaryButtonLabel: string | null;
  badgeTop: string | null;
  badgeMain: string | null;
  badgeBottom: string | null;
}

/** Prévia do slide com a mesma marcação/classes do hero da loja (animações desativadas por .banner-preview). */
export function BannerSlidePreview({ banner, zoom = 1, placeholderTitle = 'Título do banner' }: { banner: SlideData; zoom?: number; placeholderTitle?: string }) {
  const b = banner;
  const style = {
    '--sbg': `radial-gradient(circle at 75% 40%,${HEX.test(b.colorFrom) ? b.colorFrom : '#2a2a2e'} 0,${HEX.test(b.colorTo) ? b.colorTo : '#0b0b0c'} 58%)`,
    ...(b.imageUrl ? { '--simg': `url("${encodeURI(b.imageUrl)}")` } : {}),
  } as CSSProperties;
  return (
    <div className="banner-preview" aria-hidden>
      <div style={{ zoom }}>
        <section className="hero">
          <div className="slides">
            <div className={`slide active ${b.imageUrl ? 'has-photo' : ''}`} style={style}>
              <div className="stripe s1" />
              <div className="stripe s2" />
              <div className="wrap">
                <div>
                  {b.kicker && (
                    <div className="kicker">
                      {b.kicker} <span className="slash">///</span>
                    </div>
                  )}
                  <h2 className="h1">
                    <span className="l1">{b.title || placeholderTitle}</span>
                    {b.highlight && <span>{b.highlight}</span>}
                  </h2>
                  {b.subtitle && <p>{b.subtitle}</p>}
                  {(b.buttonLabel || b.secondaryButtonLabel) && (
                    <div className="btns">
                      {b.buttonLabel && <span className="btn btn-gold">{b.buttonLabel}</span>}
                      {b.secondaryButtonLabel && <span className="btn btn-ghost">{b.secondaryButtonLabel}</span>}
                    </div>
                  )}
                </div>
                {b.icon && (
                  <div className="hero-art">
                    <div className="ring">{b.icon === 'trophy' ? <img src={trophy} alt="" /> : <CategoryGlyph icon={b.icon} className="big" strokeWidth={1.1} />}</div>
                    {b.badgeMain && (
                      <div className="badge">
                        <div>
                          {b.badgeTop && <small>{b.badgeTop}</small>}
                          <strong>{b.badgeMain}</strong>
                          {b.badgeBottom && <small>{b.badgeBottom}</small>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

