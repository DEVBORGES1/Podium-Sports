// Tipos das respostas da API (/api/v1). Valores monetários em centavos.

export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PROCESSING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type UserRole = 'ADMIN' | 'SUPER_ADMIN';
export type CategoryIcon = 'ball' | 'run' | 'jar' | 'shirt' | 'glove' | 'dumbbell' | 'shoe';
export type InfoIcon = 'whatsapp' | 'truck' | 'card' | 'shield' | 'medal' | 'trophy' | 'clock' | 'diamond';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: CategoryIcon;
  colorFrom: string;
  colorTo: string;
  imageUrl: string | null;
  sortOrder: number;
  showOnHome: boolean;
  /** Preenchida = subcategoria (dentro desta categoria principal). Ausente em respostas antigas da API. */
  parentId?: string | null;
  productCount?: number;
}

/** Marca com produtos à venda (filtro do catálogo). */
export interface Brand {
  name: string;
  count: number;
}

export interface ProductImage {
  id: string;
  url: string;
  /** Versões leves (WEBP): miniatura para listas e média para a página do produto. Caem na original se não existirem. */
  thumbUrl?: string;
  mediumUrl?: string;
  altText: string;
}

/** Opção do produto (ex.: tamanho 40) como a loja vê: só as ativas. */
export interface ProductVariant {
  id: string;
  label: string;
  available: boolean;
  maxQuantity: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string; icon: CategoryIcon; parent?: { id: string; name: string; slug: string } | null };
  priceCents: number;
  regularPriceCents: number;
  onSale: boolean;
  discountPercent: number;
  promotion: { name: string; endsAt: string } | null;
  imageUrl: string | null;
  thumbUrl?: string | null;
  images: ProductImage[];
  availability: Availability;
  maxQuantity: number;
  /** Nome da escolha (ex.: "Tamanho"); null/ausente = produto sem variações. */
  variantType?: string | null;
  variants?: ProductVariant[];
  isFeatured: boolean;
  createdAt: string;
}

export interface ProductDetail extends Product {
  related: Product[];
}

export interface Banner {
  id: string;
  kicker: string | null;
  title: string;
  highlight: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  icon: CategoryIcon | 'trophy' | null;
  colorFrom: string;
  colorTo: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  secondaryButtonLabel: string | null;
  secondaryButtonUrl: string | null;
  badgeTop: string | null;
  badgeMain: string | null;
  badgeBottom: string | null;
  footnote: string | null;
  priceOriginalCents: number | null;
  priceSaleCents: number | null;
  layout: BannerLayout;
  contentAlign: 'left' | 'right';
  overlay: number;
  /** Formato e escurecimento no celular, independentes do computador (banners antigos repetem layout/overlay). */
  mobileLayout: BannerLayout;
  mobileOverlay: number;
  imageFrame: BannerImageFrame | null;
  imageBg: string | null;
  /** Foto exclusiva do celular; null = o celular usa imageUrl. */
  mobileImageUrl: string | null;
  mobileImageBg: string | null;
  sortOrder: number;
}

/** "split": foto em painel ao lado do texto; "full": foto ocupando todo o banner. */
export type BannerLayout = 'split' | 'full';

/** Enquadramento da foto: posição em % (como object-position) e zoom ≥ 1. A imagem original não é alterada. */
export interface BannerFrame {
  mode: 'fill' | 'fit';
  x: number;
  y: number;
  zoom: number;
}

export interface BannerImageFrame {
  desktop: BannerFrame;
  /** null: o celular usa o mesmo ajuste do computador. */
  mobile: BannerFrame | null;
}

export interface InfoItem {
  icon: InfoIcon;
  title: string;
  text: string;
}

export interface StoreContent {
  topbarMessages: string[];
  benefits: InfoItem[];
  trustItems: InfoItem[];
  brandBanner: {
    enabled: boolean;
    kicker: string;
    title: string;
    highlight: string;
    text: string;
    buttonLabel: string;
    buttonUrl: string;
    brands: string[];
  };
  cta: { enabled: boolean; title: string; text: string; buttonLabel: string };
  home: { featuredTitle: string; showNewArrivals: boolean; showOnSale: boolean; showCategories: boolean; showCatalog: boolean };
  /** Pódio da página inicial: os produtos e a ordem vêm dos destaques (tela Pódio do painel). */
  podium: { enabled: boolean; title: string; text: string };
  footerAbout: string;
  serviceNotes: string[];
  cartNote: string;
  /** Somente no painel: mensagens de atualização ao cliente. Marcadores {nome}, {pedido} e {loja}. */
  customerMessages?: CustomerMessages;
}

export interface CustomerMessages {
  accepted: string;
  processing: string;
  readyPickup: string;
  readyDelivery: string;
  outForDelivery: string;
  completed: string;
  cancelled: string;
}

export interface StoreSettings {
  storeName: string;
  logoUrl: string | null;
  whatsappNumber: string;
  phoneDisplay: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  openingHours: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupInfo: string | null;
  deliveryInfo: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  whatsappGreeting: string;
  orderMessageIntro: string;
  orderMessageFooter: string | null;
  heroIntervalSeconds: number;
  content: StoreContent;
}

export type LineIssue = 'NOT_FOUND' | 'UNAVAILABLE' | 'VARIANT_REQUIRED' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'QUANTITY_LIMIT' | null;

export interface QuoteLine {
  productId: string;
  variantId?: string | null;
  /** Ex.: "Tamanho: 40". */
  variantLabel?: string | null;
  quantity: number;
  issue: LineIssue;
  available: boolean;
  name: string | null;
  slug?: string;
  imageUrl?: string | null;
  unitPriceCents?: number;
  regularUnitPriceCents?: number;
  subtotalCents?: number;
  maxQuantity?: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  canCheckout: boolean;
}

export interface Address {
  street: string;
  number: string;
  district: string;
  city: string;
  complement?: string | null;
}

export interface PublicOrder {
  code: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  customerName: string;
  fulfillment: Fulfillment;
  address: Address | null;
  notes: string | null;
  items: {
    productName: string;
    variantLabel?: string | null;
    quantity: number;
    unitPriceCents: number;
    originalUnitPriceCents: number;
    subtotalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  whatsappOpenedAt: string | null;
}

export interface CreateOrderInput {
  customer: { name: string; phone: string };
  fulfillment: Fulfillment;
  address?: Address | null;
  notes?: string | null;
  items: { productId: string; variantId?: string | null; quantity: number }[];
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
}
