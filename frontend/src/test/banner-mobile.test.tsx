import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BannerSlide } from '../components/store/BannerSlide';
import { defaultFrame, framesOf, mobileFrameIsOwn, mobileImageSize, slideStyle, type SlideData } from '../lib/banner';

const base: SlideData = {
  kicker: null,
  title: 'Chuteira F50',
  highlight: null,
  subtitle: null,
  footnote: null,
  priceOriginalCents: null,
  priceSaleCents: null,
  imageUrl: 'https://cdn.test/desktop.jpg',
  imageFrame: { desktop: { mode: 'fill', x: 80, y: 50, zoom: 1.4 }, mobile: null },
  imageBg: '#f2f2f2',
  mobileImageUrl: null,
  mobileImageBg: null,
  layout: 'full',
  contentAlign: 'left',
  overlay: 55,
  mobileLayout: 'full',
  mobileOverlay: 55,
  icon: null,
  colorFrom: '#2a2a2e',
  colorTo: '#0b0b0c',
  buttonLabel: null,
  buttonUrl: null,
  secondaryButtonLabel: null,
  secondaryButtonUrl: null,
  badgeTop: null,
  badgeMain: null,
  badgeBottom: null,
};
const withMobile: SlideData = { ...base, mobileImageUrl: 'https://cdn.test/mobile.jpg', mobileImageBg: '#ffffff' };

const imgs = (c: HTMLElement) => [...c.querySelectorAll('img.slide-img')].map((i) => i.getAttribute('src'));

describe('foto exclusiva do celular no banner', () => {
  it('sem foto de celular: uma única imagem, o celular repete o enquadramento do computador', () => {
    const { container } = render(<BannerSlide data={base} active links={false} />, { wrapper: MemoryRouter });
    expect(imgs(container)).toEqual(['https://cdn.test/desktop.jpg']);
    expect(container.querySelector('picture')).toBeNull();
    expect(framesOf(base).mobile).toEqual(base.imageFrame!.desktop);
    expect(slideStyle(base)).toMatchObject({ '--imgbg-m': '#f2f2f2' });
  });

  it('na loja escolhe pela largura da tela e baixa só uma foto', () => {
    const original = window.matchMedia;
    const setNarrow = (narrow: boolean) =>
      (window.matchMedia = ((q: string) => ({
        matches: narrow && q === '(max-width: 759px)',
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia);
    try {
      setNarrow(false);
      const desktop = render(<BannerSlide data={withMobile} active links={false} />, { wrapper: MemoryRouter });
      expect(imgs(desktop.container)).toEqual(['https://cdn.test/desktop.jpg']);
      desktop.unmount();
      setNarrow(true);
      const phone = render(<BannerSlide data={withMobile} active links={false} />, { wrapper: MemoryRouter });
      expect(imgs(phone.container)).toEqual(['https://cdn.test/mobile.jpg']);
      // Um único <img> e nenhum <picture>/<source> (o React faria o navegador baixar as duas fotos).
      expect(phone.container.querySelectorAll('img')).toHaveLength(1);
      expect(phone.container.querySelector('picture, source')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it('na prévia mostra a foto do dispositivo escolhido', () => {
    const mobile = render(<BannerSlide data={withMobile} active links={false} device="mobile" />, { wrapper: MemoryRouter });
    expect(imgs(mobile.container)).toEqual(['https://cdn.test/mobile.jpg']);
    const desktop = render(<BannerSlide data={withMobile} active links={false} device="desktop" />, { wrapper: MemoryRouter });
    expect(imgs(desktop.container)).toEqual(['https://cdn.test/desktop.jpg']);
  });

  it('o enquadramento e a cor do computador não são aplicados à foto do celular', () => {
    expect(framesOf(withMobile).mobile).toEqual(defaultFrame('full'));
    expect(framesOf({ ...withMobile, imageFrame: { desktop: base.imageFrame!.desktop, mobile: { mode: 'fit', x: 50, y: 30, zoom: 1 } } }).mobile).toEqual({
      mode: 'fit',
      x: 50,
      y: 30,
      zoom: 1,
    });
    expect(slideStyle(withMobile)).toMatchObject({ '--imgbg': '#f2f2f2', '--imgbg-m': '#ffffff' });
    expect(slideStyle({ ...withMobile, mobileImageBg: null })).toMatchObject({ '--imgbg-m': 'transparent' });
  });

  it('indica a proporção recomendada da foto do celular conforme o formato', () => {
    expect(mobileImageSize('full').ratio).toBe('16:10');
    expect(mobileImageSize('split').ratio).toBe('4:3');
  });
});

describe('formato independente por dispositivo', () => {
  // Foto de fundo no computador; produto ao lado do texto no celular.
  const mixed: SlideData = { ...base, layout: 'full', overlay: 55, mobileLayout: 'split', mobileOverlay: 0 };
  const slideOf = (c: HTMLElement) => c.querySelector('.slide')!;

  it('a prévia desenha o formato e o escurecimento do dispositivo escolhido', () => {
    const desktop = render(<BannerSlide data={mixed} active links={false} device="desktop" />, { wrapper: MemoryRouter });
    expect(slideOf(desktop.container).classList).toContain('layout-full');
    expect(desktop.container.querySelector('.slide > .slide-media')).not.toBeNull(); // foto ocupando o banner
    expect((slideOf(desktop.container) as HTMLElement).style.getPropertyValue('--ov')).toBe('0.55');

    const mobile = render(<BannerSlide data={mixed} active links={false} device="mobile" />, { wrapper: MemoryRouter });
    expect(slideOf(mobile.container).classList).toContain('layout-split');
    expect(mobile.container.querySelector('.slide-aside .slide-media')).not.toBeNull(); // produto no quadro, acima do texto
    expect((slideOf(mobile.container) as HTMLElement).style.getPropertyValue('--ov')).toBe('0');
  });

  it('na loja escolhe o formato pela largura da tela', () => {
    const original = window.matchMedia;
    const setNarrow = (narrow: boolean) =>
      (window.matchMedia = ((q: string) => ({
        matches: narrow && q === '(max-width: 759px)',
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia);
    try {
      setNarrow(false);
      const desktop = render(<BannerSlide data={mixed} active />, { wrapper: MemoryRouter });
      expect(slideOf(desktop.container).classList).toContain('layout-full');
      desktop.unmount();
      setNarrow(true);
      const phone = render(<BannerSlide data={mixed} active />, { wrapper: MemoryRouter });
      expect(slideOf(phone.container).classList).toContain('layout-split');
    } finally {
      window.matchMedia = original;
    }
  });

  it('com formato diferente, o celular não herda o enquadramento do computador', () => {
    expect(mobileFrameIsOwn(base)).toBe(false);
    expect(mobileFrameIsOwn(mixed)).toBe(true);
    expect(framesOf(base).mobile).toEqual(base.imageFrame!.desktop);
    expect(framesOf(mixed).mobile).toEqual(defaultFrame('split'));
    const tuned = { mode: 'fit' as const, x: 40, y: 20, zoom: 1.1 };
    expect(framesOf({ ...mixed, imageFrame: { desktop: base.imageFrame!.desktop, mobile: tuned } })).toEqual({
      desktop: base.imageFrame!.desktop,
      mobile: tuned,
    });
  });

  it('o escurecimento segue o dispositivo', () => {
    expect(slideStyle(mixed)).toMatchObject({ '--ov': '0.55' });
    expect(slideStyle(mixed, true)).toMatchObject({ '--ov': '0' });
  });
});
