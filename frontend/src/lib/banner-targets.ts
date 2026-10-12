import type { BannerPage, ButtonTarget } from '../types/admin';

/**
 * Rascunho do destino no formulário. Os campos de todos os tipos ficam guardados, então trocar de tipo
 * e voltar não perde o que já foi escolhido. "legacy" = endereço digitado à mão em banners antigos.
 */
export type TargetType = 'none' | 'legacy' | ButtonTarget['type'];
export interface TargetDraft {
  type: TargetType;
  productId: string;
  categoryId: string;
  page: BannerPage;
  url: string;
  whatsappMessage: string;
  legacyUrl: string;
}

export const EMPTY_TARGET: TargetDraft = { type: 'none', productId: '', categoryId: '', page: 'catalog', url: '', whatsappMessage: '', legacyUrl: '' };

/** Mesmo critério do servidor: somente https, com domínio, sem espaços nem usuário/senha. */
export function isHttpsUrl(value: string) {
  if (/\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function draftFromTarget(target: ButtonTarget | null, url: string | null): TargetDraft {
  if (!target) return url ? { ...EMPTY_TARGET, type: 'legacy', legacyUrl: url } : { ...EMPTY_TARGET };
  switch (target.type) {
    case 'product':
      return { ...EMPTY_TARGET, type: 'product', productId: target.productId };
    case 'category':
      return { ...EMPTY_TARGET, type: 'category', categoryId: target.categoryId };
    case 'page':
      return { ...EMPTY_TARGET, type: 'page', page: target.page };
    case 'external':
      return { ...EMPTY_TARGET, type: 'external', url: target.url };
    case 'whatsapp':
      return { ...EMPTY_TARGET, type: 'whatsapp', whatsappMessage: target.message ?? '' };
  }
}

/** Converte o rascunho no que a API recebe: destino estruturado ou (só para banners antigos) o link digitado. */
export function targetFromDraft(d: TargetDraft): { target: ButtonTarget | null; url: string | null } {
  switch (d.type) {
    case 'none':
      return { target: null, url: null };
    case 'legacy':
      return { target: null, url: d.legacyUrl || null };
    case 'product':
      return { target: d.productId ? { type: 'product', productId: d.productId } : null, url: null };
    case 'category':
      return { target: d.categoryId ? { type: 'category', categoryId: d.categoryId } : null, url: null };
    case 'page':
      return { target: { type: 'page', page: d.page }, url: null };
    case 'external':
      return { target: { type: 'external', url: d.url.trim() }, url: null };
    case 'whatsapp':
      return { target: { type: 'whatsapp', message: d.whatsappMessage.trim() || null }, url: null };
  }
}

/** Erro do destino para um botão com texto (null = ok). */
export function targetError(d: TargetDraft): string | null {
  switch (d.type) {
    case 'none':
      return 'Escolha o que acontece ao clicar.';
    case 'product':
      return d.productId ? null : 'Escolha o produto.';
    case 'category':
      return d.categoryId ? null : 'Escolha a categoria.';
    case 'external':
      return isHttpsUrl(d.url.trim()) ? null : 'Informe um endereço completo começando com https://';
    case 'whatsapp':
      return d.whatsappMessage.length > 300 ? 'A mensagem deve ter no máximo 300 caracteres.' : null;
    default:
      return null;
  }
}
