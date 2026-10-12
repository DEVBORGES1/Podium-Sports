import { useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router';
import { CartDrawer } from '../components/store/CartDrawer';
import { SiteFooter } from '../components/store/SiteFooter';
import { SiteHeader } from '../components/store/SiteHeader';
import { TopBar } from '../components/store/TopBar';
import { WhatsAppFab } from '../components/store/WhatsAppFab';
import { ErrorState, LoadingState } from '../components/ui/States';
import { siteUrl, useJsonLd } from '../hooks/usePageMeta';
import { useCategories, useSettings } from '../hooks/useStoreData';
import '../styles/store.css';

export default function StoreLayout() {
  const settings = useSettings();
  const categories = useCategories();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  // Dados da loja para o Google (nome, contato, endereço e redes sociais).
  const storeJsonLd = useMemo(() => {
    const st = settings.data;
    if (!st) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'SportingGoodsStore',
      name: st.storeName,
      url: `${siteUrl}/`,
      image: `${siteUrl}/og-image.jpg`,
      ...(st.logoUrl ? { logo: st.logoUrl } : {}),
      telephone: `+${st.whatsappNumber}`,
      ...(st.email ? { email: st.email } : {}),
      address: {
        '@type': 'PostalAddress',
        ...(st.address ? { streetAddress: st.address } : {}),
        addressLocality: 'Videira',
        addressRegion: 'SC',
        addressCountry: 'BR',
      },
      priceRange: 'R$',
      sameAs: [st.instagramUrl, st.facebookUrl, st.tiktokUrl].filter(Boolean),
    };
  }, [settings.data]);
  useJsonLd('store-jsonld', storeJsonLd);

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
