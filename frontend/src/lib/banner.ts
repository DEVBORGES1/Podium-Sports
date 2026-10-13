import type { CSSProperties } from 'react';
import type { AdminBanner, ButtonInfo } from '../types/admin';
import type { Banner, BannerFrame, BannerLayout } from '../types/api';

export const BANNER_ICONS = ['trophy', 'ball', 'run', 'jar', 'shirt', 'glove', 'dumbbell', 'shoe'] as const;
export type BannerIcon = (typeof BANNER_ICONS)[number];

/** O que é preciso para desenhar um slide: banner público ou rascunho do painel. */
export type SlideData = Pick<
  Banner,
  | 'kicker'
  | 'title'
  | 'highlight'
  | 'subtitle'
  | 'footnote'
  | 'priceOriginalCents'
  | 'priceSaleCents'
  | 'imageUrl'
  | 'imageFrame'
  | 'imageBg'
  | 'mobileImageUrl'
  | 'mobileImageBg'
  | 'layout'
  | 'contentAlign'
  | 'overlay'
  | 'mobileLayout'
  | 'mobileOverlay'
  | 'colorFrom'
  | 'colorTo'
  | 'buttonLabel'
  | 'buttonUrl'
  | 'secondaryButtonLabel'
  | 'secondaryButtonUrl'
  | 'badgeTop'
  | 'badgeMain'
  | 'badgeBottom'
> & { icon: BannerIcon | null };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Banners antigos (sem ajuste salvo): foto centralizada preenchendo a área, como antes. */
export const CENTER_FRAME: BannerFrame = { mode: 'fill', x: 50, y: 50, zoom: 1 };

/**
 * Ajuste inicial de uma foto nova. Ao lado do texto, a foto aparece inteira (produto sem cortes);
 * no fundo do banner, preenche a área.
 */
export const defaultFrame = (layout: BannerLayout): BannerFrame => (layout === 'split' ? { mode: 'fit', x: 50, y: 50, zoom: 1 } : { ...CENTER_FRAME });

/** Escurecimento inicial: a foto de produto ao lado do texto não precisa; a foto de fundo precisa para o texto ficar legível. */
export const defaultOverlay = (layout: BannerLayout) => (layout === 'split' ? 0 : 55);

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

export function clampFrame(f: BannerFrame): BannerFrame {
  return { mode: f.mode, x: round(clamp(f.x, 0, 100)), y: round(clamp(f.y, 0, 100)), zoom: round(clamp(f.zoom, MIN_ZOOM, MAX_ZOOM)) };
}

type FrameSource = Pick<SlideData, 'imageFrame'> & Partial<Pick<SlideData, 'mobileImageUrl' | 'layout' | 'mobileLayout'>>;

/**
 * O ajuste do computador não serve para o celular quando o celular mostra outra foto (foto exclusiva) ou usa
 * outro formato (ex.: foto de fundo no computador e produto ao lado do texto no celular).
 */
export const mobileFrameIsOwn = (d: Omit<FrameSource, 'imageFrame'>) => !!d.mobileImageUrl || (!!d.mobileLayout && !!d.layout && d.mobileLayout !== d.layout);

/**
 * Enquadramento de cada dispositivo. Sem ajuste próprio, o celular repete o do computador — exceto quando o
 * ajuste do computador não serve para ele (outra foto ou outro formato): aí vale o padrão do formato do celular.
 */
export function framesOf(d: FrameSource) {
  const desktop = d.imageFrame?.desktop ?? CENTER_FRAME;
  const mobile = d.imageFrame?.mobile ?? (mobileFrameIsOwn(d) ? defaultFrame(d.mobileLayout ?? d.layout ?? 'full') : desktop);
  return { desktop, mobile };
}

/** Formato e escurecimento do dispositivo: computador e celular são configurados de forma independente. */
export const deviceLook = (d: Pick<SlideData, 'layout' | 'overlay' | 'mobileLayout' | 'mobileOverlay'>, mobile: boolean) =>
  mobile ? { layout: d.mobileLayout, overlay: d.mobileOverlay } : { layout: d.layout, overlay: d.overlay };

/**
 * Proporção da área da imagem no celular (a imagem fica acima do texto). Serve de orientação para quem
 * prepara a foto exclusiva do celular.
 */
export const mobileImageSize = (layout: BannerLayout) => (layout === 'split' ? { ratio: '4:3', size: '1200 × 900 px' } : { ratio: '16:10', size: '1200 × 750 px' });

/**
 * Desconto exibido no banner: só quando os dois preços são válidos e o original é maior.
 * Arredonda para baixo para nunca anunciar mais desconto do que o real.
 */
export function discountPercent(original: number | null | undefined, sale: number | null | undefined) {
  if (!original || !sale || !Number.isInteger(original) || !Number.isInteger(sale) || original <= 0 || sale <= 0 || original <= sale) return null;
  const pct = Math.floor(((original - sale) / original) * 100);
  return pct >= 1 ? pct : null;
}

/**
 * Posição da imagem com zoom. Com object-position x% e transform-origin no mesmo ponto, a borda da imagem fica em
 * (área − largura × zoom) × x%: a posição continua válida em qualquer zoom e, no modo "preencher", nunca sobra espaço vazio.
 */
const frameVars = (f: BannerFrame, prefix: string) => ({
  [`--${prefix}x`]: `${f.x}%`,
  [`--${prefix}y`]: `${f.y}%`,
  [`--${prefix}z`]: String(f.zoom),
  [`--${prefix}fit`]: f.mode === 'fit' ? 'contain' : 'cover',
});

/** Variáveis CSS do slide (cores, escurecimento do dispositivo e enquadramento por dispositivo). */
export function slideStyle(d: SlideData, onMobile = false): CSSProperties {
  const from = HEX.test(d.colorFrom) ? d.colorFrom : '#2a2a2e';
  const to = HEX.test(d.colorTo) ? d.colorTo : '#0b0b0c';
  const { desktop, mobile } = framesOf(d);
  return {
    '--sbg': `radial-gradient(circle at 75% 40%,${from} 0,${to} 58%)`,
    '--bgc': to,
    '--ov': String(clamp(deviceLook(d, onMobile).overlay, 0, 90) / 100),
    '--imgbg': d.imageBg && HEX.test(d.imageBg) ? d.imageBg : 'transparent',
    // Cor atrás da foto no celular: a da foto exclusiva, se houver; senão a mesma do computador.
    '--imgbg-m': d.mobileImageUrl ? (d.mobileImageBg && HEX.test(d.mobileImageBg) ? d.mobileImageBg : 'transparent') : d.imageBg && HEX.test(d.imageBg) ? d.imageBg : 'transparent',
    ...frameVars(desktop, 'd'),
    ...frameVars(mobile, 'm'),
  } as CSSProperties;
}

/**
 * Deslocamento do enquadramento ao arrastar a imagem dentro de uma área de `box` pixels.
 * Devolve o novo x/y (em %) para que a imagem acompanhe o ponteiro.
 */
export function dragFrame(
  start: BannerFrame,
  delta: { dx: number; dy: number },
  box: { width: number; height: number },
  natural: { width: number; height: number },
): BannerFrame {
  if (!box.width || !box.height || !natural.width || !natural.height) return start;
  const base = (start.mode === 'fit' ? Math.min : Math.max)(box.width / natural.width, box.height / natural.height);
  const freeX = box.width - natural.width * base * start.zoom;
  const freeY = box.height - natural.height * base * start.zoom;
  const x = Math.abs(freeX) < 1 ? start.x : start.x + (delta.dx / freeX) * 100;
  const y = Math.abs(freeY) < 1 ? start.y : start.y + (delta.dy / freeY) * 100;
  return clampFrame({ ...start, x, y });
}

/** Um botão aparece na loja quando o destino é válido (links antigos digitados continuam valendo). */
const buttonShows = (label: string | null, info: ButtonInfo | null) => !!label && !!info && (!info.issue || info.issue === 'LEGACY_LINK');

/** Como o banner salvo aparece na loja (selo/preços ocultos e botões sem destino válido ficam de fora). */
export function adminSlideData(b: AdminBanner): SlideData {
  const primary = buttonShows(b.buttonLabel, b.buttonInfo);
  const secondary = b.secondaryButtonEnabled && buttonShows(b.secondaryButtonLabel, b.secondaryButtonInfo);
  return {
    ...b,
    icon: b.icon,
    kicker: b.showKicker ? b.kicker : null,
    priceOriginalCents: b.showPrices ? b.priceOriginalCents : null,
    priceSaleCents: b.showPrices ? b.priceSaleCents : null,
    buttonLabel: primary ? b.buttonLabel : null,
    buttonUrl: primary ? b.buttonInfo!.url : null,
    secondaryButtonLabel: secondary ? b.secondaryButtonLabel : null,
    secondaryButtonUrl: secondary ? b.secondaryButtonInfo!.url : null,
  };
}

/**
 * Cor predominante nas bordas da foto (ex.: fundo branco de estúdio), usada atrás da imagem quando ela não
 * preenche toda a área. Devolve null se a imagem não puder ser lida (ex.: servidor sem CORS).
 */
export async function sampleEdgeColor(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x > 1 && x < size - 2 && y > 1 && y < size - 2) continue; // só a moldura de 2px
        const i = (y * size + x) * 4;
        if (data[i + 3]! < 200) continue; // ignora pixels transparentes (PNG recortado)
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n++;
      }
    }
    if (!n) return null;
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}
