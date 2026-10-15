import { describe, expect, it } from 'vitest';
import { draftFromTarget, isHttpsUrl, targetError, targetFromDraft } from './banner-targets';
import { CENTER_FRAME, clampFrame, defaultFrame, discountPercent, dragFrame, framesOf, slideStyle, type SlideData } from './banner';

describe('desconto do banner', () => {
  it('calcula somente com preços válidos e original maior', () => {
    expect(discountPercent(59_900, 39_990)).toBe(33); // 33,2% → arredonda para baixo
    expect(discountPercent(10_000, 10_000)).toBeNull();
    expect(discountPercent(10_000, 12_000)).toBeNull();
    expect(discountPercent(null, 5_000)).toBeNull();
    expect(discountPercent(10_000, 0)).toBeNull();
    expect(discountPercent(10_000, 9_950)).toBeNull(); // 0,5% não vira "-0%"
  });
});

describe('enquadramento da imagem', () => {
  const box = { width: 400, height: 300 };
  const natural = { width: 1600, height: 1000 };

  it('preencher: arrastar para a direita revela a parte esquerda da foto', () => {
    // Base "cover" = 0,3 → imagem 480×300: sobram 80px na horizontal, nada na vertical.
    const f = dragFrame({ mode: 'fill', x: 50, y: 50, zoom: 1 }, { dx: 40, dy: 30 }, box, natural);
    expect(f.x).toBe(0);
    expect(f.y).toBe(50); // sem sobra vertical: eixo travado
  });

  it('com zoom, o deslocamento acompanha o ponteiro e respeita os limites', () => {
    const f = dragFrame({ mode: 'fill', x: 50, y: 50, zoom: 2 }, { dx: -56, dy: 0 }, box, natural);
    // largura 960 → sobra 560px; 56px = 10%
    expect(f.x).toBe(60);
    expect(dragFrame({ mode: 'fill', x: 50, y: 50, zoom: 2 }, { dx: -5000, dy: 0 }, box, natural).x).toBe(100);
  });

  it('mostrar inteira: a imagem anda dentro do espaço livre', () => {
    // Base "contain" = 0,25 → 400×250: 50px livres na vertical.
    const f = dragFrame({ mode: 'fit', x: 50, y: 50, zoom: 1 }, { dx: 0, dy: 25 }, box, natural);
    expect(f.y).toBe(100);
  });

  it('limita valores e usa o ajuste do computador no celular quando não há ajuste próprio', () => {
    expect(clampFrame({ mode: 'fill', x: -10, y: 140, zoom: 9 })).toEqual({ mode: 'fill', x: 0, y: 100, zoom: 3 });
    const desktop = { mode: 'fit' as const, x: 20, y: 30, zoom: 1.5 };
    expect(framesOf({ imageFrame: { desktop, mobile: null } })).toEqual({ desktop, mobile: desktop });
    expect(framesOf({ imageFrame: null })).toEqual({ desktop: CENTER_FRAME, mobile: CENTER_FRAME });
    expect(defaultFrame('split').mode).toBe('fit');
    expect(defaultFrame('full').mode).toBe('fill');
  });

  it('gera as variáveis CSS por dispositivo sem alterar a imagem', () => {
    const data = {
      colorFrom: '#1d4a2c',
      colorTo: '#08140c',
      overlay: 40,
      imageBg: '#f2f2f2',
      imageFrame: { desktop: { mode: 'fit', x: 70, y: 40, zoom: 1.2 }, mobile: { mode: 'fill', x: 30, y: 60, zoom: 1 } },
    } as SlideData;
    expect(slideStyle(data)).toMatchObject({
      '--dx': '70%',
      '--dy': '40%',
      '--dz': '1.2',
      '--dfit': 'contain',
      '--mx': '30%',
      '--mfit': 'cover',
      '--ov': '0.4',
      '--imgbg': '#f2f2f2',
      '--bgc': '#08140c',
    });
  });
});

describe('destino dos botões', () => {
  it('converte o destino salvo no rascunho e de volta', () => {
    const product = { type: 'product', productId: '1d953eb8-a82c-442f-9abd-45deaa174ef0' } as const;
    expect(targetFromDraft(draftFromTarget(product, '/produto/x'))).toEqual({ target: product, url: null });
    expect(targetFromDraft(draftFromTarget({ type: 'whatsapp', message: null }, null))).toEqual({ target: { type: 'whatsapp', message: null }, url: null });
    // Link antigo sem correspondência é preservado como está.
    expect(targetFromDraft(draftFromTarget(null, '/produtos?q=messi'))).toEqual({ target: null, url: '/produtos?q=messi' });
    expect(targetFromDraft(draftFromTarget(null, null))).toEqual({ target: null, url: null });
  });

  it('valida o destino de um botão com texto', () => {
    const base = draftFromTarget(null, null);
    expect(targetError(base)).toMatch(/Escolha/);
    expect(targetError({ ...base, type: 'product' })).toBe('Escolha o produto.');
    expect(targetError({ ...base, type: 'external', url: 'http://site.com' })).toMatch(/https/);
    expect(targetError({ ...base, type: 'external', url: 'https://instagram.com/podium' })).toBeNull();
    expect(targetError({ ...base, type: 'page', page: 'offers' })).toBeNull();
  });

  it('aceita somente URLs externas https seguras', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'http://x.com',
      'https://',
      'https://localhost',
      'https://user:pw@site.com',
      'https://a b.com',
    ]) {
      expect(isHttpsUrl(bad), bad).toBe(false);
    }
    expect(isHttpsUrl('https://wa.me/5549999999999')).toBe(true);
  });
});
