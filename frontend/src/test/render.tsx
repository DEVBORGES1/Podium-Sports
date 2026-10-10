import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { CartProvider } from '../contexts/CartContext';
import { ToastProvider } from '../contexts/ToastContext';
import StoreLayout from '../layouts/StoreLayout';
import CatalogPage from '../pages/store/CatalogPage';
import CheckoutPage from '../pages/store/CheckoutPage';
import HomePage from '../pages/store/HomePage';
import OrderPage from '../pages/store/OrderPage';
import ProductPage from '../pages/store/ProductPage';

/** Renderiza a loja real (layout + páginas) em memória, com a API simulada pelo MSW. */
export function renderStore(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <StoreLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'produtos', element: <CatalogPage /> },
          { path: 'produto/:slug', element: <ProductPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'pedido/:code', element: <OrderPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router };
}
