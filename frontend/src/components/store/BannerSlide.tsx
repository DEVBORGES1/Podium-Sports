import type { HTMLAttributes, ReactNode, Ref } from 'react';
import trophy from '../../assets/trophy.png';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { deviceLook, discountPercent, slideStyle, type SlideData } from '../../lib/banner';
import { brl } from '../../lib/format';
import { CategoryGlyph } from '../ui/Icons';
import { SmartLink } from '../ui/SmartLink';

const MOBILE_QUERY = '(max-width: 759px)';

function SlideArt({ data }: { data: SlideData }) {
  if (!data.icon) return null;
  return (
    <div className="hero-art" aria-hidden>
      <div className="art-glow" />
      {data.icon === 'trophy' ? (
        <img className="art-trophy" src={trophy} alt="" />
      ) : (
        // Pódio: o ícone da categoria fica sobre o degrau dourado.
        <div className="art-podium">
          <div className="art-step s2">2</div>
          <div className="art-step s1">
            1
            <CategoryGlyph icon={data.icon} className="art-glyph" strokeWidth={1.1} />
          </div>
          <div className="art-step s3">3</div>
        </div>
      )}
      {data.badgeMain && (
        <div className="badge">
          <div>
            {data.badgeTop && <small>{data.badgeTop}</small>}
            <strong>{data.badgeMain}</strong>
            {data.badgeBottom && <small className="badge-foot">{data.badgeBottom}</small>}
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
  device,
  position,
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
  /** Prévia do painel: mostra a foto e o formato do dispositivo escolhido. Na loja fica vazio e a escolha é pela tela. */
  device?: 'desktop' | 'mobile';
  /** Posição no carrossel ("01 / 04" ao lado do selo). */
  position?: { index: number; total: number };
  /** Elementos extras sobre a imagem (guias do editor). */
  children?: ReactNode;
}) {
  // Celular ou computador. Na loja a escolha é feita pela largura da tela (760 px = mesmo limite do layout de
  // celular do banner, que ocupa toda a largura); na prévia, pelo dispositivo escolhido no painel.
  const narrowScreen = useMediaQuery(MOBILE_QUERY);
  const mobile = device ? device === 'mobile' : narrowScreen;
  // Cada dispositivo tem o próprio formato (ex.: foto de fundo no computador, produto ao lado do texto no celular).
  const { layout } = deviceLook(data, mobile);
  const hasImage = !!data.imageUrl;
  const split = layout === 'split';
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
  // Foto exclusiva do celular: só a foto do dispositivo é baixada. Não usamos <picture>: o React define o src
  // do <img> antes de colocá-lo no <picture>, e o navegador baixaria as duas fotos.
  const showMobilePhoto = !!data.mobileImageUrl && mobile;
  const img = <img className="slide-img" src={showMobilePhoto ? data.mobileImageUrl! : data.imageUrl!} alt="" draggable={false} decoding="async" />;
  const media = hasImage ? (
    <div ref={mediaRef} className="slide-media" {...mediaProps}>
      {img}
      <div className="slide-shade" aria-hidden />
      {children}
    </div>
  ) : null;
  const art = !hasImage ? <SlideArt data={data} /> : null;
  const aside = split ? media ?? art : art;
  const classes = ['slide', `layout-${layout}`, `align-${data.contentAlign}`, active && 'active', hasImage && 'has-photo', !aside && 'no-aside'];

  return (
    <div className={classes.filter(Boolean).join(' ')} style={slideStyle(data, mobile)} {...slideProps}>
      {!split && media}
      <div className="wrap slide-inner">
        <div className="slide-copy">
          {(data.kicker || position) && (
            <span className="slide-eyebrow">
              {position && (
                <span className="slide-num" aria-hidden>
                  {String(position.index + 1).padStart(2, '0')} / {String(position.total).padStart(2, '0')}
                </span>
              )}
              {position && data.kicker && <span className="slide-rule" aria-hidden />}
              {data.kicker && <span className="slide-tag">{data.kicker}</span>}
            </span>
          )}
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
