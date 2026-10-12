// Tipos das respostas das rotas /admin. Valores monetários em centavos.
import type { Availability, Banner, CategoryIcon, Fulfillment, InfoItem, OrderStatus, PaymentStatus, Product, StoreContent, StoreSettings, UserRole } from './api';

export interface AdminProductImage {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  sizeBytes: number;
}

export interface AdminProduct extends Omit<Product, 'images'> {
  priceCents: number; // preço cheio
  salePriceCents: number | null;
  effectivePriceCents: number;
  categoryId: string;
  stockQuantity: number;
  minStock: number;
  isActive: boolean;
  sortOrder: number;
  legacyId: number | null;
  images: AdminProductImage[];
  updatedAt: string;
  orderCount?: number;
  canDelete?: boolean;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: CategoryIcon;
  colorFrom: string;
  colorTo: string;
  imageUrl: string | null;
  imagePath: string | null;
  sortOrder: number;
  showOnHome: boolean;
  isActive: boolean;
  productCount: number;
}

export interface InventoryRow {
  productId: string;
  name: string;
  slug: string;
  categoryName: string;
  isActive: boolean;
  stockQuantity: number;
  minStock: number;
  reservedInOpenOrders: number;
  status: Availability;
  lastMovementAt: string | null;
}

export type MovementType = 'INITIAL' | 'IN' | 'OUT' | 'ADJUSTMENT' | 'ORDER_RESERVATION' | 'ORDER_RELEASE';

export interface InventoryMovement {
  id: string;
  type: MovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user: { id: string; name: string } | null;
  order: { id: string; code: string } | null;
}

export interface AdminOrderRow {
  id: string;
  code: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  fulfillment: Fulfillment;
  itemCount: number;
  itemsPreview: { productName: string; quantity: number }[];
  totalCents: number;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: PaymentStatus;
  whatsappOpenedAt: string | null;
  updatedAt: string;
  allowedTransitions: OrderStatus[];
}

/** Mensagem de atualização registrada: só se sabe que o WhatsApp foi aberto, ou que alguém declarou ter enviado. */
export interface OrderMessageEntry {
  id: string;
  status: OrderStatus;
  channel: 'WHATSAPP_LINK';
  body: string;
  state: 'WHATSAPP_OPENED' | 'CONFIRMED_BY_STAFF';
  openCount: number;
  openedAt: string;
  lastOpenedAt: string;
  lastOpenedBy: { id: string; name: string } | null;
  confirmedAt: string | null;
  confirmedBy: { id: string; name: string } | null;
}

export interface AdminOrder {
  id: string;
  code: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  fulfillment: Fulfillment;
  address: { street: string | null; number: string | null; district: string | null; city: string | null; complement: string | null } | null;
  notes: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  whatsappOpenedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  paidAt: string | null;
  stockReleasedAt: string | null;
  updatedAt: string;
  allowedTransitions: OrderStatus[];
  customerMessage: { status: OrderStatus; text: string; whatsappUrl: string; alreadyOpened: boolean } | null;
  messages: OrderMessageEntry[];
  items: {
    id: string;
    productId: string | null;
    productSlug: string | null;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    originalUnitPriceCents: number;
    subtotalCents: number;
  }[];
  statusHistory: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    toStatusLabel: string;
    note: string | null;
    createdAt: string;
    user: { id: string; name: string } | null;
  }[];
  paymentHistory: { id: string; createdAt: string; user: { id: string; name: string } | null; from?: PaymentStatus; to?: PaymentStatus; note?: string | null }[];
}

export type BannerPage = 'home' | 'catalog' | 'offers' | 'new';

/** Destino de um botão do banner, escolhido no painel (o servidor monta o endereço). */
export type ButtonTarget =
  | { type: 'product'; productId: string }
  | { type: 'category'; categoryId: string }
  | { type: 'page'; page: BannerPage }
  | { type: 'external'; url: string }
  | { type: 'whatsapp'; message: string | null };

export type ButtonTargetIssue = 'PRODUCT_REMOVED' | 'PRODUCT_INACTIVE' | 'CATEGORY_REMOVED' | 'CATEGORY_INACTIVE' | 'WHATSAPP_MISSING' | 'LEGACY_LINK';

export interface ButtonInfo {
  description: string;
  issue: ButtonTargetIssue | null;
  url: string | null;
}

export interface AdminBanner extends Omit<Banner, 'buttonUrl' | 'secondaryButtonUrl'> {
  showKicker: boolean;
  showPrices: boolean;
  imagePath: string | null;
  /** Endereço salvo (gerado a partir do destino ou digitado nos banners antigos). */
  buttonUrl: string | null;
  buttonTarget: ButtonTarget | null;
  buttonInfo: ButtonInfo | null;
  secondaryButtonUrl: string | null;
  secondaryButtonTarget: ButtonTarget | null;
  secondaryButtonInfo: ButtonInfo | null;
  secondaryButtonEnabled: boolean;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  state: 'LIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';
  updatedAt: string;
}

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FIXED_PRICE';

export interface AdminPromotion {
  id: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  value: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  state: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';
  products: { id: string; name: string; slug: string; priceCents: number; promotionalPriceCents: number | null }[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminSettings extends StoreSettings {
  logoPath: string | null;
  pendingOrderTtlHours: number;
  timezone: string;
  updatedAt: string;
}

export type SettingsInput = Partial<
  Omit<AdminSettings, 'logoUrl' | 'timezone' | 'updatedAt' | 'content'> & { content: StoreContent }
>;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export interface DashboardSummary {
  period: { from: string; to: string; timezone: string };
  orders: {
    total: number;
    valid: number;
    today: number;
    pending: number;
    /** Aceitos ou em separação. */
    inProgress: number;
    ready: number;
    outForDelivery: number;
    completed: number;
    completedInPeriod: number;
    cancelled: number;
    expired: number;
    whatsappOpened: number;
  };
  revenue: { confirmedCents: number; paidOrders: number; averageTicketCents: number; registeredValueCents: number };
  products: { total: number; active: number; lowStock: number; outOfStock: number };
  lowStockProducts: { id: string; name: string; stockQuantity: number; minStock: number }[];
  recentOrders: { id: string; code: string; customerName: string; totalCents: number; status: OrderStatus; paymentStatus: PaymentStatus; fulfillment: Fulfillment; createdAt: string }[];
}

export interface SalesSeries {
  period: { from: string; to: string; timezone: string };
  items: { date: string; orders: number; registeredCents: number; paidCents: number }[];
}

export interface TopProducts {
  period: { from: string; to: string; timezone: string };
  criteria: string;
  items: { productId: string | null; name: string; quantity: number; valueCents: number; orders: number }[];
}

export type { InfoItem };
