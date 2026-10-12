import type { HTMLAttributes, ReactNode, Ref } from 'react';
import trophy from '../../assets/trophy.png';
import { discountPercent, slideStyle, type SlideData } from '../../lib/banner';
import { brl } from '../../lib/format';
import { CategoryGlyph } from '../ui/Icons';
import { SmartLink } from '../ui/SmartLink';

function SlideArt({ data }: { data: SlideData }) {
  if (!data.icon) return null;
  return (
    <div className="hero-art" aria-hidden>
      <div className="ring">{data.icon === 'trophy' ? <img src={trophy} alt="" /> : <CategoryGlyph icon={data.icon} className="big" strokeWidth={1.1} />}</div>
      {data.badgeMain && (
        <div className="badge">
          <div>
            {data.badgeTop && <small>{data.badgeTop}</small>}
            <strong>{data.badgeMain}</strong>
            {data.badgeBottom && <small>{data.badgeBottom}</small>}
          </div>
        </div>
      )}
    </div>
  );
}

function SlidePrice({ original, sale }: { original: number | null; sale: number | null }) {
  if (!original && !sale) return null;
  const off = discountPercent(original, sale);
  if (original && sale && off) {
    return (
      <div className="slide-price">
        <span className="was">
          De <s>{brl(original)}</s>
        </span>
        <span className="now">
          por <strong>{brl(sale)}</strong>
        </span>
        <span className="slide-off">-{off}%</span>
      </div>
    );
  }
  return (
    <div className="slide-price">
      <span className="now">
        <strong>{brl((sale ?? original)!)}</strong>
      </span>
    </div>
  );
}

/**
 * Um slide do banner. A mesma marcação e o mesmo CSS servem à loja e à prévia do painel: o layout responde à largura
 * do próprio banner (container queries), então a prévia "celular" é idêntica ao que o cliente vê no telefone.
 */
export function BannerSlide({
  data,
  active,
  heading: Heading = 'h2',
  links = true,
  placeholderTitle,
  slideProps,
  mediaRef,
  mediaProps,
  children,
}: {
  data: SlideData;
  active: boolean;
  heading?: 'h1' | 'h2';
  /** false na prévia: botões viram rótulos sem navegação. */
  links?: boolean;
  placeholderTitle?: string;
  slideProps?: HTMLAttributes<HTMLDivElement> & { inert?: boolean };
  mediaRef?: Ref<HTMLDivElement>;
  mediaProps?: HTMLAttributes<HTMLDivElement>;
  /** Elementos extras sobre a imagem (guias do editor). */
  children?: ReactNode;
}) {
  const hasImage = !!data.imageUrl;
  const split = data.layout === 'split';
  const button = (label: string | null, url: string | null, className: string) => {
    if (!label || (links && !url)) return null;
    return links ? (
      <SmartLink to={url!} className={className}>
        {label}
      </SmartLink>
    ) : (
      <span className={className}>{label}</span>
    );
  };
  const primary = button(data.buttonLabel, data.buttonUrl, 'btn btn-gold');
  const secondary = button(data.secondaryButtonLabel, data.secondaryButtonUrl, 'btn btn-ghost');
  const media = hasImage ? (
    <div ref={mediaRef} className="slide-media" {...mediaProps}>
      <img className="slide-img" src={data.imageUrl!} alt="" draggable={false} decoding="async" />
      <div className="slide-shade" aria-hidden />
      {children}
    </div>
  ) : null;
  const art = !hasImage ? <SlideArt data={data} /> : null;
  const aside = split ? media ?? art : art;
  const classes = ['slide', `layout-${data.layout}`, `align-${data.contentAlign}`, active && 'active', hasImage && 'has-photo', !aside && 'no-aside'];

  return (
    <div className={classes.filter(Boolean).join(' ')} style={slideStyle(data)} {...slideProps}>
      {!split && media}
      <div className="wrap slide-inner">
        <div className="slide-copy">
          {data.kicker && <span className="slide-tag">{data.kicker}</span>}
          <Heading className="h1">
            <span className="l1">{data.title || placeholderTitle}</span>
            {data.highlight && <span className="hl">{data.highlight}</span>}
          </Heading>
          {data.subtitle && <p className="slide-sub">{data.subtitle}</p>}
          <SlidePrice original={data.priceOriginalCents} sale={data.priceSaleCents} />
          {(primary || secondary) && (
            <div className="btns">
              {primary}
              {secondary}
            </div>
          )}
          {data.footnote && <p className="slide-note">{data.footnote}</p>}
        </div>
        {aside && <div className="slide-aside">{aside}</div>}
      </div>
    </div>
  );
}
