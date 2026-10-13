import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BannerSlide } from '../components/store/BannerSlide';
import { defaultFrame, framesOf, mobileImageSize, slideStyle, type SlideData } from '../lib/banner';

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
      (window.matchMedia = ((q: string) => ({ matches: narrow && q === '(max-width: 759px)', media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia);
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
    expect(framesOf({ ...withMobile, imageFrame: { desktop: base.imageFrame!.desktop, mobile: { mode: 'fit', x: 50, y: 30, zoom: 1 } } }).mobile).toEqual({ mode: 'fit', x: 50, y: 30, zoom: 1 });
    expect(slideStyle(withMobile)).toMatchObject({ '--imgbg': '#f2f2f2', '--imgbg-m': '#ffffff' });
    expect(slideStyle({ ...withMobile, mobileImageBg: null })).toMatchObject({ '--imgbg-m': 'transparent' });
  });

  it('indica a proporção recomendada da foto do celular conforme o formato', () => {
    expect(mobileImageSize('full').ratio).toBe('16:10');
    expect(mobileImageSize('split').ratio).toBe('4:3');
  });
});
