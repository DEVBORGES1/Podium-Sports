import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { storeApi, type ProductQuery } from '../lib/store-api';

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: storeApi.settings, staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: storeApi.categories, staleTime: 5 * 60_000 });
export const useBanners = () => useQuery({ queryKey: ['banners'], queryFn: storeApi.banners, staleTime: 5 * 60_000 });
export const useProducts = (query: ProductQuery) =>
  useQuery({ queryKey: ['products', query], queryFn: () => storeApi.products(query), placeholderData: keepPreviousData, staleTime: 60_000 });
export const useProduct = (slug: string) => useQuery({ queryKey: ['product', slug], queryFn: () => storeApi.product(slug), staleTime: 60_000 });
