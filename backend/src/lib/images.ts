import sharp from 'sharp';

/**
 * Versões leves de uma foto de produto (WEBP), geradas no envio:
 * - thumb: listagens e sacola; o menor lado fica com até 600 px (cobre um card quadrado em telas 2x);
 * - medium: página do produto; cabe em 1200 × 1200.
 * A foto original é guardada como veio (usada no compartilhamento e como reserva).
 */
export const IMAGE_SIZES = {
  thumb: { width: 600, height: 600, fit: 'outside', quality: 72 },
  medium: { width: 1200, height: 1200, fit: 'inside', quality: 80 },
} as const;

export type DerivedSize = keyof typeof IMAGE_SIZES;

export async function buildDerivedImages(data: Buffer) {
  // rotate() aplica a orientação EXIF (fotos de celular) antes de redimensionar.
  const source = sharp(data, { failOn: 'error' }).rotate();
  const out = {} as Record<DerivedSize, Buffer>;
  for (const [name, size] of Object.entries(IMAGE_SIZES) as [DerivedSize, (typeof IMAGE_SIZES)[DerivedSize]][]) {
    out[name] = await source
      .clone()
      .resize({ width: size.width, height: size.height, fit: size.fit, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toBuffer();
  }
  return out;
}

/** "products/<uuid>.jpg" → "products/<uuid>-thumb.webp". */
export function derivedPath(originalPath: string, size: DerivedSize) {
  return `${originalPath.replace(/\.[a-z0-9]+$/i, '')}-${size}.webp`;
}
