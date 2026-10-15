import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import RouteError from './components/ui/RouteError';
import { LoadingState } from './components/ui/States';
import StoreLayout from './layouts/StoreLayout';
import HomePage from './pages/store/HomePage';

// Páginas carregadas sob demanda (o painel não pesa no carregamento da loja).
const CatalogPage = lazy(() => import('./pages/store/CatalogPage'));
const ProductPage = lazy(() => import('./pages/store/ProductPage'));
const CheckoutPage = lazy(() => import('./pages/store/CheckoutPage'));
const OrderPage = lazy(() => import('./pages/store/OrderPage'));
const NotFoundPage = lazy(() => import('./pages/store/NotFoundPage'));

const AdminRoot = lazy(() => import('./routes/AdminRoot'));
const RequireAdmin = lazy(() => import('./routes/RequireAdmin').then((m) => ({ default: m.RequireAdmin })));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const SetPasswordPage = lazy(() => import('./pages/admin/SetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/admin/ProductsPage'));
const ProductFormPage = lazy(() => import('./pages/admin/ProductFormPage'));
const CategoriesPage = lazy(() => import('./pages/admin/CategoriesPage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const OrdersPage = lazy(() => import('./pages/admin/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/admin/OrderDetailPage'));
const BannersPage = lazy(() => import('./pages/admin/BannersPage'));
const BannerFormPage = lazy(() => import('./pages/admin/BannerFormPage'));
const PodiumPage = lazy(() => import('./pages/admin/PodiumPage'));
const PromotionsPage = lazy(() => import('./pages/admin/PromotionsPage'));
const PromotionFormPage = lazy(() => import('./pages/admin/PromotionFormPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));

const page = (el: React.ReactNode) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;

export const routes = [
  {
    path: '/',
    element: <StoreLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'produtos', element: page(<CatalogPage />) },
      { path: 'produto/:slug', element: page(<ProductPage />) },
      { path: 'checkout', element: page(<CheckoutPage />) },
      { path: 'pedido/:code', element: page(<OrderPage />) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
  {
    path: '/admin',
    element: page(<AdminRoot />),
    errorElement: <RouteError />,
    children: [
      { path: 'login', element: page(<LoginPage />) },
      { path: 'definir-senha', element: page(<SetPasswordPage />) },
      {
        element: page(<RequireAdmin />),
        children: [
          {
            element: page(<AdminLayout />),
            children: [
              { index: true, element: page(<DashboardPage />) },
              { path: 'orders', element: page(<OrdersPage />) },
              { path: 'orders/:id', element: page(<OrderDetailPage />) },
              { path: 'products', element: page(<ProductsPage />) },
              { path: 'products/new', element: page(<ProductFormPage />) },
              { path: 'products/:id', element: page(<ProductFormPage />) },
              { path: 'categories', element: page(<CategoriesPage />) },
              { path: 'inventory', element: page(<InventoryPage />) },
              { path: 'banners', element: page(<BannersPage />) },
              { path: 'banners/new', element: page(<BannerFormPage />) },
              { path: 'banners/:id', element: page(<BannerFormPage />) },
              { path: 'podium', element: page(<PodiumPage />) },
              { path: 'promotions', element: page(<PromotionsPage />) },
              { path: 'promotions/new', element: page(<PromotionFormPage />) },
              { path: 'promotions/:id', element: page(<PromotionFormPage />) },
              { path: 'settings', element: page(<SettingsPage />) },
              {
                element: page(<RequireAdmin role="SUPER_ADMIN" />),
                children: [
                  { path: 'users', element: page(<UsersPage />) },
                  { path: 'audit', element: page(<AuditPage />) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
