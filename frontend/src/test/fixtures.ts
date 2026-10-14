import type { Category, Product, PublicOrder, StoreSettings } from '../types/api';

export const settings: StoreSettings = {
  storeName: 'Podium Sports',
  logoUrl: null,
  whatsappNumber: '554998090818',
  phoneDisplay: '(49) 99809-0818',
  email: null,
  address: null,
  city: 'Videira, SC',
  openingHours: null,
  pickupEnabled: true,
  deliveryEnabled: true,
  pickupInfo: 'Retire na loja em Videira, SC.',
  deliveryInfo: 'Entrega em Videira e região.',
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  whatsappGreeting: 'Olá, Podium Sports! Vim pelo site.',
  orderMessageIntro: 'Olá, Podium Sports! Quero fazer este pedido:',
  orderMessageFooter: null,
  heroIntervalSeconds: 6,
  content: {
    topbarMessages: ['**PEDIDO PELO WHATSAPP** · rápido e fácil'],
    benefits: [{ icon: 'whatsapp', title: 'Pedido no WhatsApp', text: 'Atendimento direto' }],
    trustItems: [],
    brandBanner: { enabled: false, kicker: '', title: '', highlight: '', text: '', buttonLabel: '', buttonUrl: '/produtos', brands: [] },
    cta: { enabled: false, title: '', text: '', buttonLabel: '' },
    home: { featuredTitle: 'Destaques', showNewArrivals: false, showOnSale: false, showCategories: true, showCatalog: true },
    podium: { enabled: true, title: 'Pódio da semana', text: 'Os mais pedidos pelo WhatsApp.' },
    footerAbout: 'Loja de artigos esportivos.',
    serviceNotes: [],
    cartNote: 'Tamanho, cor e sabor a gente confirma no WhatsApp.',
  },
};

export const categories: Category[] = [
  { id: 'c1', name: 'Chuteiras', slug: 'chuteiras', description: null, icon: 'ball', colorFrom: '#2b6a3c', colorTo: '#0d2414', imageUrl: null, sortOrder: 0, showOnHome: true, productCount: 2 },
  { id: 'c2', name: 'Suplementos', slug: 'suplementos', description: null, icon: 'jar', colorFrom: '#7a4a10', colorTo: '#1c1206', imageUrl: null, sortOrder: 1, showOnHome: true, productCount: 1 },
];

export function product(over: Partial<Product> = {}): Product {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'chuteira-f50-messi',
    name: 'Chuteira F50 Messi',
    brand: 'Adidas',
    description: null,
    category: { id: 'c1', name: 'Chuteiras', slug: 'chuteiras', icon: 'ball' },
    priceCents: 39_990,
    regularPriceCents: 59_900,
    onSale: true,
    discountPercent: 33,
    promotion: null,
    imageUrl: null,
    images: [],
    availability: 'IN_STOCK',
    maxQuantity: 5,
    isFeatured: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

export const whey = product({
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'whey',
  name: '100% Whey Max Titanium 900g',
  brand: 'Max Titanium',
  category: { id: 'c2', name: 'Suplementos', slug: 'suplementos', icon: 'jar' },
  priceCents: 21_990,
  regularPriceCents: 21_990,
  onSale: false,
  discountPercent: 0,
});

export const order: PublicOrder = {
  code: 'PS-ABC234',
  status: 'PENDING',
  statusLabel: 'Aguardando atendimento',
  paymentStatus: 'UNPAID',
  createdAt: '2026-05-10T12:00:00Z',
  customerName: 'Maria & Cia',
  fulfillment: 'DELIVERY',
  address: { street: 'Rua A', number: '10', district: 'Centro', city: 'Videira', complement: 'Casa 2' },
  notes: 'Tamanho 42 #azul',
  items: [
    { productName: 'Chuteira F50 Messi', quantity: 2, unitPriceCents: 39_990, originalUnitPriceCents: 59_900, subtotalCents: 79_980 },
    { productName: 'Whey 100%', quantity: 1, unitPriceCents: 21_990, originalUnitPriceCents: 21_990, subtotalCents: 21_990 },
  ],
  subtotalCents: 141_790,
  discountCents: 39_820,
  totalCents: 101_970,
  whatsappOpenedAt: null,
};
