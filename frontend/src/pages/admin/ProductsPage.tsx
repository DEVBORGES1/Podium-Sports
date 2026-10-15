import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader, TableState, Tag } from '../../components/admin/ui';
import { CategoryGlyph, productGlyph } from '../../components/ui/Icons';
import { Pagination } from '../../components/ui/States';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import { categoryOptions } from '../../lib/categories';
import { brl } from '../../lib/format';
import { AVAILABILITY_LABEL } from '../../lib/labels';
import type { AdminCategory, AdminProduct } from '../../types/admin';
import type { Page } from '../../types/api';

export default function ProductsPage() {
  useDocumentTitle('Produtos');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const filters = {
    q,
    categoryId: params.get('categoryId') ?? '',
    status: params.get('status') ?? '',
    stock: params.get('stock') ?? '',
    sort: params.get('sort') ?? 'sortOrder',
    page: Number(params.get('page')) || 1,
    pageSize: 25,
  };
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items),
  });
  const products = useQuery({
    queryKey: ['admin', 'products', filters],
    queryFn: () => adminApi.get<Page<AdminProduct>>('/products', filters),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Produtos"
        description={products.data ? `${products.data.total} produto(s)` : undefined}
        actions={
          <Link to="/admin/products/new" className="btn btn-gold btn-sm">
            + Novo produto
          </Link>
        }
      />
      <div className="filters-bar">
        <div className="field grow">
          <label htmlFor="q">Buscar</label>
          <input id="q" className="input" type="search" placeholder="Nome, marca ou categoria" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cat">Categoria</label>
          <select id="cat" className="select" value={filters.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Todas</option>
            {categoryOptions(categories.data ?? []).map(({ category: c, depth }) => (
              <option key={c.id} value={c.id}>
                {depth ? '\u00a0\u00a0\u00a0↳ ' : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Publicação</label>
          <select id="status" className="select" value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="stock">Estoque</label>
          <select id="stock" className="select" value={filters.stock} onChange={(e) => set('stock', e.target.value)}>
            <option value="">Todos</option>
            <option value="low">Baixo</option>
            <option value="out">Esgotado</option>
            <option value="ok">Normal</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Ordenar</label>
          <select id="sort" className="select" value={filters.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="sortOrder">Ordem de exibição</option>
            <option value="name">Nome</option>
            <option value="price">Preço</option>
            <option value="stock">Estoque</option>
            <option value="updated">Atualização</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th className="num">Preço</th>
              <th className="num">Estoque</th>
              <th>Situação</th>
              <th className="num">Ordem</th>
            </tr>
          </thead>
          <tbody>
            {products.isPending || products.isError || products.data.items.length === 0 ? (
              <TableState
                colSpan={6}
                loading={products.isPending}
                error={products.error}
                empty="Nenhum produto encontrado."
                onRetry={() => products.refetch()}
              />
            ) : (
              products.data.items.map((p) => {
                const stock = AVAILABILITY_LABEL[p.availability];
                return (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/admin/products/${p.id}`)}>
                    <td>
                      <div className="cell-main">
                        <div className="thumb-sm">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <CategoryGlyph icon={productGlyph(p.category.icon, p.category.slug)} />}
                        </div>
                        <div>
                          <Link to={`/admin/products/${p.id}`} onClick={(e) => e.stopPropagation()}>
                            <b>{p.name}</b>
                          </Link>
                          <div className="muted">
                            {p.brand ?? '—'} {p.isFeatured && <Tag tone="gold">Destaque</Tag>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{p.category.name}</td>
                    <td className="num">
                      {p.effectivePriceCents < p.priceCents && (
                        <div className="muted">
                          <s>{brl(p.priceCents)}</s>
                        </div>
                      )}
                      {brl(p.effectivePriceCents)}
                    </td>
                    <td className="num">
                      {p.stockQuantity} <Tag tone={stock.tone}>{stock.label}</Tag>
                    </td>
                    <td>{p.isActive ? <Tag tone="ok">Publicado</Tag> : <Tag>Inativo</Tag>}</td>
                    <td className="num">{p.sortOrder}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={(p) => set('page', String(p))} />}
    </>
  );
}
