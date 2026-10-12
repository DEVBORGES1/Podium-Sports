import { useEffect } from 'react';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;

interface PageMeta {
  title?: string;
  description?: string;
  image?: string | null;
  /** Caminho canônico da página (ex.: /produto/chuteira-f50-messi). */
  path?: string;
}

const TAGS = [
  ['meta[name="description"]', 'name', 'description'],
  ['meta[property="og:title"]', 'property', 'og:title'],
  ['meta[name="twitter:title"]', 'name', 'twitter:title'],
  ['meta[property="og:description"]', 'property', 'og:description'],
  ['meta[name="twitter:description"]', 'name', 'twitter:description'],
  ['meta[property="og:url"]', 'property', 'og:url'],
  ['meta[property="og:image"]', 'property', 'og:image'],
  ['meta[name="twitter:image"]', 'name', 'twitter:image'],
] as const;
type TagKey = (typeof TAGS)[number][2];

function setMeta(key: TagKey, value: string) {
  const [selector, attr] = TAGS.find((t) => t[2] === key)!;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/** Valores do index.html, restaurados ao sair da página (ex.: produto → checkout). */
function snapshot() {
  const meta = Object.fromEntries(TAGS.map(([sel, , key]) => [key, document.head.querySelector(sel)?.getAttribute('content') ?? null]));
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? null;
  return { title: document.title, meta, canonical };
}

/**
 * Atualiza título, descrição e tags de compartilhamento da página atual.
 * O Google executa JavaScript e usa esses valores; apps de mensagem (WhatsApp)
 * leem apenas o HTML inicial, que traz o card padrão da loja.
 */
export function usePageMeta({ title, description, image, path }: PageMeta) {
  useEffect(() => {
    if (!title) return;
    const previous = snapshot();
    const fullTitle = title.includes('Podium Sports') ? title : `${title} · Podium Sports`;
    const url = `${SITE_URL}${path ?? window.location.pathname}`;
    const img = image || DEFAULT_IMAGE;
    document.title = fullTitle;
    setMeta('og:title', fullTitle);
    setMeta('twitter:title', fullTitle);
    setMeta('og:url', url);
    setMeta('og:image', img);
    setMeta('twitter:image', img);
    if (description) {
      const desc = description.length > 160 ? `${description.slice(0, 157)}…` : description;
      setMeta('description', desc);
      setMeta('og:description', desc);
      setMeta('twitter:description', desc);
    }
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = url;
    return () => {
      for (const [key, value] of Object.entries(previous.meta)) if (value !== null) setMeta(key as TagKey, value);
      if (canonical && previous.canonical) canonical.setAttribute('href', previous.canonical);
      document.title = previous.title;
    };
  }, [title, description, image, path]);
}

/** Dados estruturados (schema.org) inseridos na página, sem executar scripts. */
export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    if (!data) return;
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return () => el?.remove();
  }, [id, data]);
}

export const siteUrl = SITE_URL;
