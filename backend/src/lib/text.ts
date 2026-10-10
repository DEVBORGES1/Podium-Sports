/** Remove acentos e normaliza para busca ("Tênis" -> "tenis"). */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(text: string): string {
  return normalizeSearch(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function buildProductSearchText(name: string, brand: string | null | undefined, categoryName: string) {
  return normalizeSearch([name, brand ?? '', categoryName].join(' ')).slice(0, 400);
}
