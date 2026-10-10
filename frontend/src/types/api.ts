// Tipos das respostas da API (/api/v1). Valores monetários em centavos.

export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PROCESSING' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
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
  productCount?: number;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string; icon: CategoryIcon };
  priceCents: number;
  regularPriceCents: number;
  onSale: boolean;
  discountPercent: number;
  promotion: { name: string; endsAt: string } | null;
  imageUrl: string | null;
  images: ProductImage[];
  availability: Availability;
  maxQuantity: number;
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
  sortOrder: number;
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
  footerAbout: string;
  serviceNotes: string[];
  cartNote: string;
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

export type LineIssue = 'NOT_FOUND' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'QUANTITY_LIMIT' | null;

export interface QuoteLine {
  productId: string;
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
  items: { productName: string; quantity: number; unitPriceCents: number; originalUnitPriceCents: number; subtotalCents: number }[];
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
  items: { productId: string; quantity: number }[];
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
}
