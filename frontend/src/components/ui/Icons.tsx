import type { SVGProps } from 'react';
import type { CategoryIcon, InfoIcon } from '../../types/api';

type P = SVGProps<SVGSVGElement>;
const base = (sw = 1.4): P => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw, 'aria-hidden': true, focusable: false });

/** Ícones de categoria do site original. */
const CATEGORY_PATHS: Record<CategoryIcon, React.ReactNode> = {
  shoe: (
    <>
      <path d="M2 15l1-6 4 1c1 2 3 3 6 3l7 1c1.5.3 2 1.2 2 2.5V18H2z" />
      <path d="M2 18h20M8 10l1 3M11 11l1 2" />
    </>
  ),
  jar: (
    <>
      <rect x="6" y="3" width="12" height="4" rx="1" />
      <path d="M5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M5 11h14M5 17h14" />
    </>
  ),
  shirt: <path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c0 2-2 3-4 3S8 5 8 3z" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 5h-5L8 10zM12 3v4M16 10l4.5-1.5M14.5 15l2.5 4M9.5 15L7 19M8 10L3.5 8.5" />
    </>
  ),
  glove: <path d="M7 21v-4l-3-4 2-2 2 2V5a1.5 1.5 0 0 1 3 0v5V3.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v7c0 4-2 6-3 7v2z" />,
  dumbbell: <path d="M6 7v10M3.5 9v6M18 7v10M20.5 9v6M6 12h12" />,
  run: (
    <>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M8 21l3-6 3 2v5M6 12l3-4 4 1 3 3 3-1M11 15l2-5" />
    </>
  ),
};

export function CategoryGlyph({ icon, strokeWidth = 1.4, ...rest }: { icon: CategoryIcon; strokeWidth?: number } & Omit<P, 'strokeWidth'>) {
  return (
    <svg {...base(strokeWidth)} {...rest}>
      {CATEGORY_PATHS[icon] ?? CATEGORY_PATHS.dumbbell}
    </svg>
  );
}

/** Miniatura do produto sem foto: chuteiras e tênis usam o tênis, as demais o ícone da categoria. */
export function productGlyph(icon: CategoryIcon, categorySlug?: string): CategoryIcon {
  if (categorySlug === 'chuteiras' || categorySlug === 'tenis' || icon === 'run') return 'shoe';
  return icon;
}

const INFO_PATHS: Record<InfoIcon, React.ReactNode> = {
  whatsapp: <path d="M4 20l1.5-4A8 8 0 1 1 8 18.5L4 20z" />,
  truck: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 4h12v5a6 6 0 0 1-12 0z" />
      <path d="M9 20h6M12 15v5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  diamond: (
    <>
      <path d="M20 12l-8 8-8-8 8-8z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};

export function InfoGlyph({ icon, ...rest }: { icon: InfoIcon } & P) {
  return (
    <svg {...base(1.8)} {...rest}>
      {INFO_PATHS[icon] ?? INFO_PATHS.shield}
    </svg>
  );
}

export const BagIcon = (p: P) => (
  <svg width="24" height="24" {...base(2)} {...p}>
    <path d="M6 7h12l-1 13H7L6 7z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg width="18" height="18" {...base(2)} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);
export const MenuIcon = (p: P) => (
  <svg width="24" height="24" {...base(2)} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const ChevronLeft = (p: P) => (
  <svg width="22" height="22" {...base(2.4)} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const ChevronRight = (p: P) => (
  <svg width="22" height="22" {...base(2.4)} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const WhatsAppLogo = (p: P) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden focusable={false} {...p}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
  </svg>
);
export const InstagramIcon = (p: P) => (
  <svg width="16" height="16" {...base(2)} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
  </svg>
);
export const FacebookIcon = (p: P) => (
  <svg width="16" height="16" {...base(2)} {...p}>
    <path d="M15 3h-3a4 4 0 0 0-4 4v3H5v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
export const TikTokIcon = (p: P) => (
  <svg width="16" height="16" {...base(2)} {...p}>
    <path d="M14 3v11a4 4 0 1 1-4-4M14 3c0 3 2 5 5 5" />
  </svg>
);
