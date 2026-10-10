import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { CartDrawer } from '../components/store/CartDrawer';
import { SiteFooter } from '../components/store/SiteFooter';
import { SiteHeader } from '../components/store/SiteHeader';
import { TopBar } from '../components/store/TopBar';
import { WhatsAppFab } from '../components/store/WhatsAppFab';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useCategories, useSettings } from '../hooks/useStoreData';
import '../styles/store.css';

export default function StoreLayout() {
  const settings = useSettings();
  const categories = useCategories();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  if (settings.isPending) return <LoadingState label="Carregando a loja…" />;
  if (settings.isError) {
    return (
      <main className="wrap">
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} title="A loja está indisponível no momento" />
      </main>
    );
  }
  const s = settings.data;
  const cats = categories.data ?? [];

  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <TopBar messages={s.content.topbarMessages} />
      <SiteHeader categories={cats} logoUrl={s.logoUrl} storeName={s.storeName} />
      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter settings={s} categories={cats} />
      {/* No checkout e na confirmação o WhatsApp já é a ação principal da página. */}
      {!/^\/(checkout|pedido\/)/.test(pathname) && <WhatsAppFab number={s.whatsappNumber} greeting={s.whatsappGreeting} />}
      <CartDrawer note={s.content.cartNote} />
    </>
  );
}
