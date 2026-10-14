/** Categorias principais seguidas das suas subcategorias (para listas de seleção do painel). */
export function categoryOptions<T extends { id: string; parentId?: string | null }>(list: T[]) {
  const roots = list.filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId));
  return roots.flatMap((root) => [{ category: root, depth: 0 }, ...list.filter((c) => c.parentId === root.id).map((c) => ({ category: c, depth: 1 }))]);
}
