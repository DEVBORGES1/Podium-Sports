import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dragFrame, framesOf, type SlideData } from '../../lib/banner';
import type { BannerFrame } from '../../types/api';
import { BannerSlide } from '../store/BannerSlide';
import '../../styles/store.css';

export type PreviewDevice = 'desktop' | 'mobile';

/** Larguras de referência: notebook comum e celular. O banner da loja usa as mesmas regras em qualquer largura. */
const DEVICE_WIDTH: Record<PreviewDevice, number> = { desktop: 1440, mobile: 390 };

/**
 * Prévia do slide com a marcação e o CSS reais da loja, desenhada na largura do dispositivo e reduzida para caber.
 * Com `onFrameChange`, a imagem pode ser arrastada (mouse, toque ou setas do teclado) para ajustar o enquadramento.
 */
export function BannerSlidePreview({
  data,
  device = 'desktop',
  onFrameChange,
  placeholderTitle = 'Título do banner',
}: {
  data: SlideData;
  device?: PreviewDevice;
  onFrameChange?: (frame: BannerFrame) => void;
  placeholderTitle?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: BannerFrame } | null>(null);
  const [scale, setScale] = useState(0);
  const [dragging, setDragging] = useState(false);
  const width = DEVICE_WIDTH[device];

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const current = framesOf(data)[device];
  const editable = !!onFrameChange && !!data.imageUrl;

  const measure = () => {
    const box = media.current?.getBoundingClientRect();
    const img = media.current?.querySelector('img');
    return { box: { width: box?.width ?? 0, height: box?.height ?? 0 }, natural: { width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0 } };
  };

  const mediaProps = editable
    ? {
        className: `slide-media editable ${dragging ? 'dragging' : ''}`,
        tabIndex: 0,
        role: 'group',
        'aria-roledescription': 'área de enquadramento',
        'aria-label': `Imagem do banner (${device === 'desktop' ? 'computador' : 'celular'}). Arraste para reposicionar ou use as setas do teclado.`,
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Sem captura (ponteiro já liberado): o arraste continua enquanto o ponteiro estiver sobre a imagem.
          }
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: current };
          setDragging(true);
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const { box, natural } = measure();
          onFrameChange!(dragFrame(d.start, { dx: e.clientX - d.x, dy: e.clientY - d.y }, box, natural));
        },
        onPointerUp: () => {
          drag.current = null;
          setDragging(false);
        },
        onPointerCancel: () => {
          drag.current = null;
          setDragging(false);
        },
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          // A imagem anda na direção da seta (o sinal depende de a imagem sobrar ou faltar na área).
          const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const m = moves[e.key];
          if (!m) return;
          e.preventDefault();
          const { box, natural } = measure();
          const step = e.shiftKey ? 0.1 : 0.02;
          onFrameChange!(dragFrame(current, { dx: m[0] * step * box.width, dy: m[1] * step * box.height }, box, natural));
        },
      }
    : undefined;

  return (
    <div ref={outer} className={`banner-preview device-${device}`}>
      <div className="banner-preview-canvas" style={{ width, zoom: scale || undefined, visibility: scale ? 'visible' : 'hidden' }}>
        <section className="hero" aria-hidden={!editable}>
          <div className="slides">
            <BannerSlide data={data} active links={false} placeholderTitle={placeholderTitle} mediaRef={media} mediaProps={mediaProps} device={device}>
              {editable && data.layout === 'full' && device === 'desktop' && (
                <span className={`text-zone ${data.contentAlign}`} aria-hidden>
                  Área do texto
                </span>
              )}
              {editable && <span className="drag-hint">Arraste para ajustar</span>}
            </BannerSlide>
          </div>
        </section>
      </div>
    </div>
  );
}
