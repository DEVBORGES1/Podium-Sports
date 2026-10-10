-- ============================================================================
-- Podium Sports — instalação completa do banco no Supabase
-- Gerado por backend/scripts/build-supabase-sql.sh (não edite à mão).
--
-- Como usar: Supabase → SQL Editor → New query → cole TODO o conteúdo → Run.
-- Roda em uma única transação: se algo falhar, nada é gravado.
-- Execute UMA vez, em um projeto novo.
-- ============================================================================

BEGIN;

-- Registro de migrations do Prisma (o deploy da API só aplicará migrations futuras)
CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Migration 20261010164154_init
-- ---------------------------------------------------------------------------
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL', 'IN', 'OUT', 'ADJUSTMENT', 'ORDER_RESERVATION', 'ORDER_RELEASE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(30) NOT NULL DEFAULT 'dumbbell',
    "color_from" VARCHAR(7) NOT NULL DEFAULT '#44464d',
    "color_to" VARCHAR(7) NOT NULL DEFAULT '#121214',
    "image_path" VARCHAR(300),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "show_on_home" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "legacy_id" INTEGER,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "brand" VARCHAR(80),
    "description" VARCHAR(5000),
    "search_text" VARCHAR(400) NOT NULL DEFAULT '',
    "price_cents" INTEGER NOT NULL,
    "sale_price_cents" INTEGER,
    "category_id" UUID NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "storage_path" VARCHAR(300) NOT NULL,
    "alt_text" VARCHAR(200),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "order_id" UUID,
    "profile_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "kicker" VARCHAR(80),
    "title" VARCHAR(80) NOT NULL,
    "highlight" VARCHAR(80),
    "subtitle" VARCHAR(300),
    "image_path" VARCHAR(300),
    "icon" VARCHAR(30),
    "color_from" VARCHAR(7) NOT NULL DEFAULT '#2a2a2e',
    "color_to" VARCHAR(7) NOT NULL DEFAULT '#0b0b0c',
    "button_label" VARCHAR(40),
    "button_url" VARCHAR(300),
    "secondary_button_label" VARCHAR(40),
    "secondary_button_url" VARCHAR(300),
    "badge_top" VARCHAR(20),
    "badge_main" VARCHAR(12),
    "badge_bottom" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "discount_type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "promotion_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotion_id","product_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "idempotency_key" VARCHAR(80) NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "fulfillment" "FulfillmentType" NOT NULL,
    "address_street" VARCHAR(160),
    "address_number" VARCHAR(20),
    "address_district" VARCHAR(100),
    "address_city" VARCHAR(100),
    "address_complement" VARCHAR(160),
    "notes" VARCHAR(500),
    "subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "whatsapp_opened_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(300),
    "paid_at" TIMESTAMPTZ(3),
    "stock_released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" VARCHAR(160) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "original_unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "note" VARCHAR(300),
    "profile_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_name" VARCHAR(80) NOT NULL,
    "logo_path" VARCHAR(300),
    "whatsapp_number" VARCHAR(15) NOT NULL,
    "phone_display" VARCHAR(30),
    "email" VARCHAR(254),
    "address" VARCHAR(200),
    "city" VARCHAR(100),
    "opening_hours" VARCHAR(300),
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pickup_info" VARCHAR(300),
    "delivery_info" VARCHAR(300),
    "instagram_url" VARCHAR(300),
    "facebook_url" VARCHAR(300),
    "tiktok_url" VARCHAR(300),
    "whatsapp_greeting" VARCHAR(300) NOT NULL,
    "order_message_intro" VARCHAR(300) NOT NULL,
    "order_message_footer" VARCHAR(300),
    "hero_interval_seconds" INTEGER NOT NULL DEFAULT 6,
    "pending_order_ttl_hours" INTEGER NOT NULL DEFAULT 48,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "content" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "profile_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(80),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "profiles"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_legacy_id_key" ON "products"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_is_active_is_featured_sort_order_idx" ON "products"("is_active", "is_featured", "sort_order");

-- CreateIndex
CREATE INDEX "products_is_active_created_at_idx" ON "products"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_created_at_idx" ON "inventory_movements"("product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "banners_is_active_sort_order_idx" ON "banners"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "promotions_is_active_starts_at_ends_at_idx" ON "promotions"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "promotion_products_product_id_idx" ON "promotion_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_payment_status_paid_at_idx" ON "orders"("payment_status", "paid_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, 'f63c354831e22d9ade73e3358faf8381bd2c273d9230bb6b4633e996c5fc1f4a', now(), '20261010164154_init', 1);

-- ---------------------------------------------------------------------------
-- Migration 20261010170001_constraints_rls_storage
-- ---------------------------------------------------------------------------
-- Regras de integridade que o Prisma não expressa no schema,
-- bloqueio do acesso direto pela Data API do Supabase (RLS)
-- e criação do bucket do Supabase Storage.

-- ============ Integridade ============
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_positive" CHECK ("price_cents" > 0),
  ADD CONSTRAINT "products_sale_price_valid" CHECK ("sale_price_cents" IS NULL OR ("sale_price_cents" > 0 AND "sale_price_cents" < "price_cents")),
  ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock_quantity" >= 0),
  ADD CONSTRAINT "products_min_stock_non_negative" CHECK ("min_stock" >= 0);

-- Apenas uma imagem principal por produto
CREATE UNIQUE INDEX "product_images_one_primary" ON "product_images"("product_id") WHERE "is_primary";

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_colors_hex" CHECK ("color_from" ~ '^#[0-9a-fA-F]{6}$' AND "color_to" ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_colors_hex" CHECK ("color_from" ~ '^#[0-9a-fA-F]{6}$' AND "color_to" ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT "banners_period_valid" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_non_zero" CHECK ("quantity" <> 0),
  ADD CONSTRAINT "inventory_movements_balance_non_negative" CHECK ("balance_before" >= 0 AND "balance_after" >= 0),
  ADD CONSTRAINT "inventory_movements_balance_consistent" CHECK ("balance_after" = "balance_before" + "quantity");

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_period_valid" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "promotions_value_valid" CHECK (
    "value" > 0 AND ("discount_type" <> 'PERCENTAGE' OR "value" BETWEEN 1 AND 90)
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_valid" CHECK (
    "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "total_cents" >= 0
    AND "total_cents" = "subtotal_cents" - "discount_cents"
  ),
  ADD CONSTRAINT "orders_delivery_has_address" CHECK ("fulfillment" <> 'DELIVERY' OR "address_street" IS NOT NULL),
  ADD CONSTRAINT "orders_paid_has_date" CHECK ("payment_status" <> 'PAID' OR "paid_at" IS NOT NULL);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_prices_valid" CHECK (
    "unit_price_cents" >= 0 AND "original_unit_price_cents" >= "unit_price_cents"
    AND "subtotal_cents" = "unit_price_cents" * "quantity"
  );

ALTER TABLE "store_settings"
  ADD CONSTRAINT "store_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "store_settings_whatsapp_digits" CHECK ("whatsapp_number" ~ '^[0-9]{10,15}$'),
  ADD CONSTRAINT "store_settings_hero_interval" CHECK ("hero_interval_seconds" BETWEEN 3 AND 30),
  ADD CONSTRAINT "store_settings_ttl" CHECK ("pending_order_ttl_hours" BETWEEN 1 AND 720);

-- Expiração de pedidos pendentes e relatórios
CREATE INDEX "orders_pending_created_at" ON "orders"("created_at") WHERE "status" = 'PENDING';

-- ============ RLS / privilégios ============
-- Toda leitura e escrita passa pela API (que se conecta com um papel que ignora RLS).
-- As chaves públicas do Supabase (papéis anon/authenticated) não acessam nenhuma tabela:
-- RLS ativada sem políticas = acesso negado; privilégios também são revogados (defesa em profundidade).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles', 'categories', 'products', 'product_images', 'inventory_movements',
    'banners', 'promotions', 'promotion_products', 'orders', 'order_items',
    'order_status_history', 'store_settings', 'audit_logs', '_prisma_migrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============ Supabase Storage ============
-- Bucket público somente para leitura das imagens. Não há políticas de INSERT/UPDATE/DELETE
-- em storage.objects para anon/authenticated: apenas o backend (chave de serviço) grava.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('store-media', 'store-media', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, '94b20860163e6aed78aa3ec98e0ae91cdaf9a88fb5242559510a5097fab08958', now(), '20261010170001_constraints_rls_storage', 1);

-- ---------------------------------------------------------------------------
-- Dados iniciais (catálogo, categorias, banners e configurações do site original)
-- Estoque provisório: 10 unidades por produto — ajuste no painel.
-- ---------------------------------------------------------------------------
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('2e320c57-b1a7-4e67-913d-4b6a7f920acf', 'Podium Sports · Videira, SC', 'Supere', 'seus limites', 'Chuteiras, tênis, suplementos e tudo pro seu treino. Monte seu pedido aqui e finalize direto pelo WhatsApp.', NULL, 'trophy', '#2a2a2e', '#0b0b0c', 'Ver produtos →', '/produtos', 'Ofertas', '/produtos?ofertas=1', NULL, NULL, NULL, 0, true, NULL, NULL, '2026-10-10 18:18:27.587+00', '2026-10-10 18:18:27.587+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('05a96914-f14c-455f-b019-09018972c238', 'Oferta', 'Chuteira', 'F50 Messi', 'De R$ 599,00 por R$ 399,90. Adicione na sacola e confirme o tamanho pelo WhatsApp.', NULL, 'shoe', '#1d4a2c', '#08140c', 'Quero a minha →', '/produto/chuteira-f50-messi', 'Ver chuteiras', '/produtos?categoria=chuteiras', 'Desconto', '-33%', 'R$ 399,90', 1, true, NULL, NULL, '2026-10-10 18:18:27.587+00', '2026-10-10 18:18:27.587+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('4880210d-e851-4060-883b-886288589e2e', 'Suplementação', 'Mais força', 'no seu treino', 'Whey, creatina, pré-treino e hipercalórico de marcas como Max Titanium e Nutrata.', NULL, 'jar', '#5a3608', '#140c03', 'Ver suplementos →', '/produtos?categoria=suplementos', NULL, NULL, 'Creatina', 'R$59', 'a partir de', 2, true, NULL, NULL, '2026-10-10 18:18:27.587+00', '2026-10-10 18:18:27.587+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('665baa9c-6586-401a-816f-30cb939505a9', 'Do futsal ao campo', 'Monte seu', 'kit completo', 'Chuteira, meião, caneleira, luva de goleiro e tudo pra entrar em campo.', NULL, 'ball', '#123f4a', '#05151a', 'Ver futebol →', '/produtos?categoria=futebol', 'Goleiro', '/produtos?categoria=goleiro', 'Luvas', 'R$99', 'a partir de', 3, true, NULL, NULL, '2026-10-10 18:18:27.587+00', '2026-10-10 18:18:27.587+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('3aaace4c-1efc-427d-b748-4ed70ff2dee8', 'Chuteiras', 'chuteiras', NULL, 'ball', '#2b6a3c', '#0d2414', NULL, 0, true, true, '2026-10-10 18:18:27.137+00', '2026-10-10 18:18:27.137+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('94930df2-db99-4663-a870-7717a2ab3d30', 'Tênis', 'tenis', NULL, 'run', '#3a3a44', '#111114', NULL, 1, true, true, '2026-10-10 18:18:27.144+00', '2026-10-10 18:18:27.144+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('617928e3-bb7a-44f1-9857-e1bd8693f8c4', 'Suplementos', 'suplementos', NULL, 'jar', '#7a4a10', '#1c1206', NULL, 2, true, true, '2026-10-10 18:18:27.147+00', '2026-10-10 18:18:27.147+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('4db6ad21-775d-44c1-bceb-058f81b67157', 'Roupas', 'roupas', NULL, 'shirt', '#3b3360', '#120f1f', NULL, 3, true, false, '2026-10-10 18:18:27.151+00', '2026-10-10 18:18:27.151+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('38126fa7-c271-4ed0-a183-65856af06a33', 'Futebol', 'futebol', NULL, 'ball', '#1c5b54', '#081a18', NULL, 4, true, false, '2026-10-10 18:18:27.156+00', '2026-10-10 18:18:27.156+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('255ae7a5-3d9f-4bea-b7ba-86d84113ccd4', 'Goleiro', 'goleiro', NULL, 'glove', '#6b1d2c', '#1d080c', NULL, 5, true, false, '2026-10-10 18:18:27.159+00', '2026-10-10 18:18:27.159+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 'Acessórios', 'acessorios', 'Treino e acessórios', 'dumbbell', '#44464d', '#121214', NULL, 6, true, true, '2026-10-10 18:18:27.163+00', '2026-10-10 18:18:27.163+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7661d612-4b12-4f19-9c41-0eb2b93588b0', 1, 'Umbro Pro 5 Shark', 'umbro-pro-5-shark', 'Umbro', NULL, 'umbro pro 5 shark umbro chuteiras', 69990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, true, 1, '2026-10-10 18:18:27.177+00', '2026-10-10 18:18:27.177+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5ba55a3e-151a-42c1-a45c-25ffdad58e2f', 2, 'Umbro Pro 5 Bump', 'umbro-pro-5-bump', 'Umbro', NULL, 'umbro pro 5 bump umbro chuteiras', 64990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 101, '2026-10-10 18:18:27.187+00', '2026-10-10 18:18:27.187+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('37357271-2fe7-4a7f-ab0a-84b0ec85e6ef', 3, 'Umbro Attack Campo', 'umbro-attack-campo', 'Umbro', NULL, 'umbro attack campo umbro chuteiras', 27990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 102, '2026-10-10 18:18:27.194+00', '2026-10-10 18:18:27.194+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('93da8dab-b178-40e8-a50f-d9613302d5ed', 4, 'Joma Top-Flex', 'joma-top-flex', 'Joma', NULL, 'joma top-flex joma chuteiras', 74990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 103, '2026-10-10 18:18:27.201+00', '2026-10-10 18:18:27.201+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('db232475-25e1-4fd2-b4fe-aa2e53994329', 5, 'Joma Top-Flex ACBF', 'joma-top-flex-acbf', 'Joma', NULL, 'joma top-flex acbf joma chuteiras', 67990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 104, '2026-10-10 18:18:27.208+00', '2026-10-10 18:18:27.208+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('686e6e49-b236-4cc2-9b50-60b1230d5618', 6, 'Joma Top-Flex', 'joma-top-flex-2', 'Joma', NULL, 'joma top-flex joma chuteiras', 64990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 105, '2026-10-10 18:18:27.215+00', '2026-10-10 18:18:27.215+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bbfa7a70-33b5-4dd3-bf39-a9693264c3fb', 7, 'Chuteira Futsal Nike Tiempo', 'chuteira-futsal-nike-tiempo', 'Nike', NULL, 'chuteira futsal nike tiempo nike chuteiras', 69990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 106, '2026-10-10 18:18:27.221+00', '2026-10-10 18:18:27.221+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3a82d683-878f-4f1b-b30e-abafa673435c', 8, 'Chuteira Futsal Nike Zoom', 'chuteira-futsal-nike-zoom', 'Nike', NULL, 'chuteira futsal nike zoom nike chuteiras', 69990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 107, '2026-10-10 18:18:27.229+00', '2026-10-10 18:18:27.229+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3260f588-a12d-4424-81f2-1f5adf8bf979', 9, 'Chuteira Society Nike', 'chuteira-society-nike', 'Nike', NULL, 'chuteira society nike nike chuteiras', 29990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 108, '2026-10-10 18:18:27.236+00', '2026-10-10 18:18:27.236+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5ae26f9e-c9e5-4f0a-b6c6-65ab69d873d9', 10, 'Chuteira F50 Messi', 'chuteira-f50-messi', NULL, NULL, 'chuteira f50 messi chuteiras', 59900, 39990, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, true, 0, '2026-10-10 18:18:27.243+00', '2026-10-10 18:18:27.243+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('cfdf9775-1eb9-4204-a927-91ab97668aec', 11, 'Chuteira Futsal Penalty', 'chuteira-futsal-penalty', 'Penalty', NULL, 'chuteira futsal penalty penalty chuteiras', 36990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 110, '2026-10-10 18:18:27.251+00', '2026-10-10 18:18:27.251+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('879cfc3a-1bdf-4d00-b4ed-e6b2e57b4099', 12, 'Chuteira Society Infantil Penalty', 'chuteira-society-infantil-penalty', 'Penalty', NULL, 'chuteira society infantil penalty penalty chuteiras', 14990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 111, '2026-10-10 18:18:27.258+00', '2026-10-10 18:18:27.258+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('69f96866-1932-4f26-9894-b5c1d9c7e7c0', 13, 'Chuteira Campo Líder Infantil', 'chuteira-campo-lider-infantil', 'Líder', NULL, 'chuteira campo lider infantil lider chuteiras', 13990, NULL, '3aaace4c-1efc-427d-b748-4ed70ff2dee8', 10, 2, true, false, 112, '2026-10-10 18:18:27.266+00', '2026-10-10 18:18:27.266+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7c62d679-b71b-4c79-a620-de67fcbf1f82', 14, 'Nike Quest 6', 'nike-quest-6', 'Nike', NULL, 'nike quest 6 nike tenis', 59990, NULL, '94930df2-db99-4663-a870-7717a2ab3d30', 10, 2, true, true, 3, '2026-10-10 18:18:27.274+00', '2026-10-10 18:18:27.274+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7da2b168-e3c6-4745-9698-5b8bcbfd6655', 15, 'Adidas Duramos SL 2', 'adidas-duramos-sl-2', 'Adidas', NULL, 'adidas duramos sl 2 adidas tenis', 49990, NULL, '94930df2-db99-4663-a870-7717a2ab3d30', 10, 2, true, false, 114, '2026-10-10 18:18:27.281+00', '2026-10-10 18:18:27.281+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a71298a4-dee8-418a-badf-57d538d3369e', 16, 'Adidas Latin Run 3.0', 'adidas-latin-run-3-0', 'Adidas', NULL, 'adidas latin run 3.0 adidas tenis', 44990, NULL, '94930df2-db99-4663-a870-7717a2ab3d30', 10, 2, true, false, 115, '2026-10-10 18:18:27.287+00', '2026-10-10 18:18:27.287+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9d9e97d3-8327-4043-95df-76bf09437557', 17, 'Nike Revolution 8', 'nike-revolution-8', 'Nike', NULL, 'nike revolution 8 nike tenis', 39990, NULL, '94930df2-db99-4663-a870-7717a2ab3d30', 10, 2, true, false, 116, '2026-10-10 18:18:27.294+00', '2026-10-10 18:18:27.294+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c5f15059-093c-4a85-b543-0e472b6b68be', 18, 'Nike Run Defy', 'nike-run-defy', 'Nike', NULL, 'nike run defy nike tenis', 34990, NULL, '94930df2-db99-4663-a870-7717a2ab3d30', 10, 2, true, false, 117, '2026-10-10 18:18:27.3+00', '2026-10-10 18:18:27.3+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('493a5d6f-0f88-4261-b7ba-bf7406d2597e', 19, '100% Whey Max Titanium 900g', '100-whey-max-titanium-900g', 'Max Titanium', NULL, '100% whey max titanium 900g max titanium suplementos', 21990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, true, 2, '2026-10-10 18:18:27.306+00', '2026-10-10 18:18:27.306+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7d5a7e67-df6f-4d5c-b345-3937c6c116be', 20, 'Whey Refil 100%', 'whey-refil-100', NULL, NULL, 'whey refil 100% suplementos', 18990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 119, '2026-10-10 18:18:27.311+00', '2026-10-10 18:18:27.311+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c98214df-e3d0-4d55-8dfe-e41adc613f33', 21, 'Whey Refil W100 Nutrata 900g', 'whey-refil-w100-nutrata-900g', 'Nutrata', NULL, 'whey refil w100 nutrata 900g nutrata suplementos', 16990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 120, '2026-10-10 18:18:27.316+00', '2026-10-10 18:18:27.316+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3f9b835b-04dc-4073-874a-8b1fe16bdce9', 22, 'Pré-treino Hórus Elite 300g', 'pre-treino-horus-elite-300g', NULL, NULL, 'pre-treino horus elite 300g suplementos', 13990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 121, '2026-10-10 18:18:27.329+00', '2026-10-10 18:18:27.329+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6544fbf0-48c5-414d-a477-5dbb24732b36', 23, 'Pré-treino Night Train 300g', 'pre-treino-night-train-300g', NULL, NULL, 'pre-treino night train 300g suplementos', 11990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 122, '2026-10-10 18:18:27.334+00', '2026-10-10 18:18:27.334+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e5c44bdb-96da-4ff5-810f-3bca6e47838e', 24, 'Pré-treino Horus 7Belo 300g', 'pre-treino-horus-7belo-300g', NULL, NULL, 'pre-treino horus 7belo 300g suplementos', 9990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 123, '2026-10-10 18:18:27.34+00', '2026-10-10 18:18:27.34+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('290b6c27-3ac5-4a07-9fc3-3cd10d5df839', 25, 'Mass Titanium 17500', 'mass-titanium-17500', NULL, NULL, 'mass titanium 17500 suplementos', 12990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, true, 4, '2026-10-10 18:18:27.345+00', '2026-10-10 18:18:27.345+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9e627279-e0d2-4040-ba68-1d309aa01ce7', 26, 'Massa Nitro Probiótica', 'massa-nitro-probiotica', NULL, NULL, 'massa nitro probiotica suplementos', 11990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 125, '2026-10-10 18:18:27.35+00', '2026-10-10 18:18:27.35+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('30261581-d212-490c-8476-210ab68ed33f', 27, 'Creatina Monohidratada 300g Hardcore', 'creatina-monohidratada-300g-hardcore', NULL, NULL, 'creatina monohidratada 300g hardcore suplementos', 7990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 126, '2026-10-10 18:18:27.355+00', '2026-10-10 18:18:27.355+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('59a85c86-6212-42ed-b118-55c102370673', 28, 'Creatina Monohidratada 300g Max', 'creatina-monohidratada-300g-max', NULL, NULL, 'creatina monohidratada 300g max suplementos', 6990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 127, '2026-10-10 18:18:27.359+00', '2026-10-10 18:18:27.359+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('15c81f44-f7e3-494c-8689-ee2eadb86d53', 29, 'Creatina Monohidratada 300g Nutrata', 'creatina-monohidratada-300g-nutrata', 'Nutrata', NULL, 'creatina monohidratada 300g nutrata nutrata suplementos', 5990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 128, '2026-10-10 18:18:27.364+00', '2026-10-10 18:18:27.364+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9f54ef6d-41ae-441d-b9b2-343eef741ab7', 30, 'Multi Max Complexo Vitamínico 90 cáps', 'multi-max-complexo-vitaminico-90-caps', NULL, NULL, 'multi max complexo vitaminico 90 caps suplementos', 6990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 129, '2026-10-10 18:18:27.369+00', '2026-10-10 18:18:27.369+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6ad91743-e615-4c18-9354-199d18bc8413', 31, 'Ômega 3 Nutrata 60 cáps', 'omega-3-nutrata-60-caps', 'Nutrata', NULL, 'omega 3 nutrata 60 caps nutrata suplementos', 4990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 130, '2026-10-10 18:18:27.373+00', '2026-10-10 18:18:27.373+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d5b62a5c-1951-426b-9176-27acc93b7608', 32, 'Fire Black Max Titanium 60 cáps', 'fire-black-max-titanium-60-caps', 'Max Titanium', NULL, 'fire black max titanium 60 caps max titanium suplementos', 4990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 131, '2026-10-10 18:18:27.378+00', '2026-10-10 18:18:27.378+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c62acd17-fab2-4ae2-9a47-afb101b18e4f', 33, 'Fire White Max Titanium', 'fire-white-max-titanium', 'Max Titanium', NULL, 'fire white max titanium max titanium suplementos', 3990, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 132, '2026-10-10 18:18:27.384+00', '2026-10-10 18:18:27.384+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f4314383-e2bc-4bc2-b709-4ab156cb104e', 34, 'Proto Bar Havana (unidade)', 'proto-bar-havana-unidade', NULL, NULL, 'proto bar havana (unidade) suplementos', 1600, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 133, '2026-10-10 18:18:27.39+00', '2026-10-10 18:18:27.39+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bd7dd382-152c-4a4f-8267-8c25c412adfb', 35, 'Barra Protein Crisp (unidade)', 'barra-protein-crisp-unidade', NULL, NULL, 'barra protein crisp (unidade) suplementos', 1100, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 134, '2026-10-10 18:18:27.395+00', '2026-10-10 18:18:27.395+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('14881117-fa22-4d60-8d7c-7046ad50203f', 36, 'Whey Grego Bar (unidade)', 'whey-grego-bar-unidade', NULL, NULL, 'whey grego bar (unidade) suplementos', 700, NULL, '617928e3-bb7a-44f1-9857-e1bd8693f8c4', 10, 2, true, false, 135, '2026-10-10 18:18:27.399+00', '2026-10-10 18:18:27.399+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4fbbc49b-c37f-46e9-8ec9-7a3552d3f2c7', 37, 'Jaqueta Feminina Poker', 'jaqueta-feminina-poker', 'Poker', NULL, 'jaqueta feminina poker poker roupas', 14990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 136, '2026-10-10 18:18:27.404+00', '2026-10-10 18:18:27.404+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a051fc24-d842-496c-9e7c-2da8904f78b3', 38, 'Corta Vento Feminino', 'corta-vento-feminino', NULL, NULL, 'corta vento feminino roupas', 10990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 137, '2026-10-10 18:18:27.409+00', '2026-10-10 18:18:27.409+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('07466be7-3049-4781-8116-8803348bf62c', 39, 'Corta Vento Masculino', 'corta-vento-masculino', NULL, NULL, 'corta vento masculino roupas', 9990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 138, '2026-10-10 18:18:27.414+00', '2026-10-10 18:18:27.414+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f2563adb-6f8d-40fb-9b1b-5b17b38ba576', 40, 'Regata Poliamida Feminina', 'regata-poliamida-feminina', NULL, NULL, 'regata poliamida feminina roupas', 9990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 139, '2026-10-10 18:18:27.418+00', '2026-10-10 18:18:27.418+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b288b908-2ef9-43a5-9035-6a4fac23091d', 41, 'Camisa Podium', 'camisa-podium', 'Podium', NULL, 'camisa podium podium roupas', 6990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 140, '2026-10-10 18:18:27.423+00', '2026-10-10 18:18:27.423+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('eb52d311-f75f-4e2d-9e56-cf8c557af3e9', 42, 'Camisa Esportiva Feminina', 'camisa-esportiva-feminina', NULL, NULL, 'camisa esportiva feminina roupas', 5990, NULL, '4db6ad21-775d-44c1-bceb-058f81b67157', 10, 2, true, false, 141, '2026-10-10 18:18:27.429+00', '2026-10-10 18:18:27.429+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0358649b-d2d3-4d6b-913f-2e13b86dac5f', 43, 'Meia Antiderrapante (preta ou branca)', 'meia-antiderrapante-preta-ou-branca', NULL, NULL, 'meia antiderrapante (preta ou branca) futebol', 5990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 142, '2026-10-10 18:18:27.434+00', '2026-10-10 18:18:27.434+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bb824d90-5323-488d-b2d5-cbec87dc8802', 44, 'Meia Antiderrapante', 'meia-antiderrapante', NULL, NULL, 'meia antiderrapante futebol', 4990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 143, '2026-10-10 18:18:27.441+00', '2026-10-10 18:18:27.441+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3cdfc151-b716-4d8f-b18b-cde689bb9d62', 45, 'Meião sem Pé', 'meiao-sem-pe', NULL, NULL, 'meiao sem pe futebol', 3990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 144, '2026-10-10 18:18:27.446+00', '2026-10-10 18:18:27.446+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('aec76b7b-aa05-4c99-a3b2-5e1623bc3ba0', 46, 'Meião Penalty', 'meiao-penalty', 'Penalty', NULL, 'meiao penalty penalty futebol', 2990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 145, '2026-10-10 18:18:27.452+00', '2026-10-10 18:18:27.452+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bf40c683-1d94-453f-a1b3-32d3140ae7bd', 47, 'Meia Futebol Training Infantil', 'meia-futebol-training-infantil', NULL, NULL, 'meia futebol training infantil futebol', 2990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 146, '2026-10-10 18:18:27.457+00', '2026-10-10 18:18:27.457+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1f7d3d9c-a8b4-4dd1-b8a8-858c86437cbc', 48, 'Suporte de Caneleira', 'suporte-de-caneleira', NULL, NULL, 'suporte de caneleira futebol', 3490, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 147, '2026-10-10 18:18:27.463+00', '2026-10-10 18:18:27.463+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d76cd8de-7940-4e52-8d17-a7b4980fc5fc', 49, 'Canelito Multi Esportivo', 'canelito-multi-esportivo', NULL, NULL, 'canelito multi esportivo futebol', 2990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 148, '2026-10-10 18:18:27.469+00', '2026-10-10 18:18:27.469+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0508bcf3-aa73-418d-bfde-96fdb66484c5', 50, 'Bomba de Inflar', 'bomba-de-inflar', NULL, NULL, 'bomba de inflar futebol', 3990, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 149, '2026-10-10 18:18:27.474+00', '2026-10-10 18:18:27.474+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5ed69f27-8dd4-45db-aca2-88e593a464da', 51, 'Cartão Oficial para Juiz', 'cartao-oficial-para-juiz', NULL, NULL, 'cartao oficial para juiz futebol', 2000, NULL, '38126fa7-c271-4ed0-a183-65856af06a33', 10, 2, true, false, 150, '2026-10-10 18:18:27.48+00', '2026-10-10 18:18:27.48+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3a1fcec3-4fc4-44a5-aed0-584ebc4007ee', 52, 'Luva Profissional Basic', 'luva-profissional-basic', NULL, NULL, 'luva profissional basic goleiro', 19990, NULL, '255ae7a5-3d9f-4bea-b7ba-86d84113ccd4', 10, 2, true, false, 151, '2026-10-10 18:18:27.486+00', '2026-10-10 18:18:27.486+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3e9a2ce7-de38-4e8b-bf91-beca2de1a8bb', 53, 'Luva Training', 'luva-training', NULL, NULL, 'luva training goleiro', 11990, NULL, '255ae7a5-3d9f-4bea-b7ba-86d84113ccd4', 10, 2, true, false, 152, '2026-10-10 18:18:27.492+00', '2026-10-10 18:18:27.492+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6977db7e-04dc-4262-8c99-30387793465d', 54, 'Luva Training Infantil', 'luva-training-infantil', NULL, NULL, 'luva training infantil goleiro', 9990, NULL, '255ae7a5-3d9f-4bea-b7ba-86d84113ccd4', 10, 2, true, false, 153, '2026-10-10 18:18:27.499+00', '2026-10-10 18:18:27.499+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3dd02456-4ee3-467b-886d-d80a08d6e972', 55, 'Joelheira Profissional', 'joelheira-profissional', NULL, NULL, 'joelheira profissional acessorios', 12990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 154, '2026-10-10 18:18:27.505+00', '2026-10-10 18:18:27.505+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('33920f35-bf54-4af5-a26a-cafc295ad4bc', 56, 'Joelheira Profissional Infantil', 'joelheira-profissional-infantil', NULL, NULL, 'joelheira profissional infantil acessorios', 8990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 155, '2026-10-10 18:18:27.512+00', '2026-10-10 18:18:27.512+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5b7bcc7d-9c8d-471f-9fed-12d6f7f881bf', 57, 'Kit 3 Mini Band Poker', 'kit-3-mini-band-poker', 'Poker', NULL, 'kit 3 mini band poker poker acessorios', 5990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 156, '2026-10-10 18:18:27.518+00', '2026-10-10 18:18:27.518+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('faa14977-082c-40fd-b848-2b59fa25d44d', 58, 'Braçadeira Porta Celular', 'bracadeira-porta-celular', NULL, NULL, 'bracadeira porta celular acessorios', 5990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 157, '2026-10-10 18:18:27.525+00', '2026-10-10 18:18:27.525+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4c1677a1-c58d-4964-b004-f4c9de0b97a5', 59, 'Hand Grip Poker', 'hand-grip-poker', 'Poker', NULL, 'hand grip poker poker acessorios', 5000, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 158, '2026-10-10 18:18:27.534+00', '2026-10-10 18:18:27.534+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('250d3a14-56dd-4187-8b29-8a03b9330e2e', 60, 'Galão Max Titanium 2,2L', 'galao-max-titanium-2-2l', 'Max Titanium', NULL, 'galao max titanium 2,2l max titanium acessorios', 4990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 159, '2026-10-10 18:18:27.54+00', '2026-10-10 18:18:27.54+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3bb7b09b-3f1e-4f0c-b4b5-59c80e92cef0', 61, 'Straps Musculação Poker', 'straps-musculacao-poker', 'Poker', NULL, 'straps musculacao poker poker acessorios', 3990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 160, '2026-10-10 18:18:27.547+00', '2026-10-10 18:18:27.547+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ffc09da8-96b5-4218-adb5-4329c7fa238e', 62, 'Munhequeira Ajustável', 'munhequeira-ajustavel', NULL, NULL, 'munhequeira ajustavel acessorios', 3990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 161, '2026-10-10 18:18:27.553+00', '2026-10-10 18:18:27.553+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b8b2d97b-cb2c-4c7e-877d-986d9691f7e9', 63, 'Munhequeira Neoprene', 'munhequeira-neoprene', NULL, NULL, 'munhequeira neoprene acessorios', 3490, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 162, '2026-10-10 18:18:27.559+00', '2026-10-10 18:18:27.559+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7ddc0a05-e9bd-4c60-8013-db4995a33f8e', 64, 'Manguito Esportivo', 'manguito-esportivo', NULL, NULL, 'manguito esportivo acessorios', 2990, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 163, '2026-10-10 18:18:27.566+00', '2026-10-10 18:18:27.566+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('59696039-1323-4d43-92ff-cc37970d5a16', 65, 'Corda de Pular Poker', 'corda-de-pular-poker', 'Poker', NULL, 'corda de pular poker poker acessorios', 2900, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 164, '2026-10-10 18:18:27.574+00', '2026-10-10 18:18:27.574+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('75ecf7dc-8304-4568-ad84-dc5daf041d00', 66, 'Protetor Bucal Simples', 'protetor-bucal-simples', NULL, NULL, 'protetor bucal simples acessorios', 1490, NULL, '7a767278-bbb3-4158-8b3c-aa4d7731a7f6', 10, 2, true, false, 165, '2026-10-10 18:18:27.58+00', '2026-10-10 18:18:27.58+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('21732d7e-e2ad-491c-b5dc-703b6d9c25ad', '7661d612-4b12-4f19-9c41-0eb2b93588b0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.18+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('45c401ae-3e83-4c83-8d05-b2f5fec0adf9', '5ba55a3e-151a-42c1-a45c-25ffdad58e2f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.189+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3b8f1fd5-2a8b-44ba-8f22-0d68c8d2f66b', '37357271-2fe7-4a7f-ab0a-84b0ec85e6ef', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.196+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5b943a16-e0cd-436f-ba60-b38fb4b2f70d', '93da8dab-b178-40e8-a50f-d9613302d5ed', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.203+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2b05a0d4-0dc2-4728-858d-143f77505c96', 'db232475-25e1-4fd2-b4fe-aa2e53994329', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.21+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5c286d7b-6289-4003-8620-79e74b10c9a1', '686e6e49-b236-4cc2-9b50-60b1230d5618', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.216+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e24cc4fc-031b-42bd-abde-bb5e9ed45076', 'bbfa7a70-33b5-4dd3-bf39-a9693264c3fb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.223+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0ede8a26-9dae-4541-9de9-d2681d2a18e3', '3a82d683-878f-4f1b-b30e-abafa673435c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.23+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0df40f1c-6af7-43a6-8281-a824728f7c3a', '3260f588-a12d-4424-81f2-1f5adf8bf979', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.238+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4363109c-4a1f-483e-ac5b-79c4ddc02b32', '5ae26f9e-c9e5-4f0a-b6c6-65ab69d873d9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.245+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bd5a1a7b-aafd-49fd-b552-374a49918330', 'cfdf9775-1eb9-4204-a927-91ab97668aec', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.253+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('701a799a-6153-4f43-a163-d331d9afd0eb', '879cfc3a-1bdf-4d00-b4ed-e6b2e57b4099', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.26+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a4ee8b7f-30ae-4f56-aec6-80ebe63f7169', '69f96866-1932-4f26-9894-b5c1d9c7e7c0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.267+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('782bca58-eb62-4595-b2bb-b79d6615b871', '7c62d679-b71b-4c79-a620-de67fcbf1f82', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.276+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5012321f-9c04-4b24-bb00-69b584ed2081', '7da2b168-e3c6-4745-9698-5b8bcbfd6655', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.282+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f0096d94-fcc9-4784-a4ec-3f3581d7fc55', 'a71298a4-dee8-418a-badf-57d538d3369e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.289+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1ab21e05-6a25-475e-acb6-e3f68157ce8a', '9d9e97d3-8327-4043-95df-76bf09437557', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.295+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('876c0e45-aded-4888-8d32-481eea2aad75', 'c5f15059-093c-4a85-b543-0e472b6b68be', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.302+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8f390d94-ce65-496e-8811-ea0bcebe0e0e', '493a5d6f-0f88-4261-b7ba-bf7406d2597e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.307+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e2bc38de-9bc7-44a9-bc38-cdf646e2996b', '7d5a7e67-df6f-4d5c-b345-3937c6c116be', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.312+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c84689c7-f3c9-40ac-bccb-75526ece37db', 'c98214df-e3d0-4d55-8dfe-e41adc613f33', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.324+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('de9c8f5b-ac66-4e05-a760-795f837f6cb0', '3f9b835b-04dc-4073-874a-8b1fe16bdce9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.33+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9e99bb3c-76c0-48e8-9b6f-c5bafa62f80d', '6544fbf0-48c5-414d-a477-5dbb24732b36', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.336+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0930e17f-a5ae-4ad8-b6af-cfcb225bbc87', 'e5c44bdb-96da-4ff5-810f-3bca6e47838e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.342+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('54754c78-e218-440d-acc2-d8a92c13b0d6', '290b6c27-3ac5-4a07-9fc3-3cd10d5df839', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.347+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0ed2e02d-8241-41e5-ad61-83190304ae1d', '9e627279-e0d2-4040-ba68-1d309aa01ce7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.351+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c933ecae-19a1-44a6-983e-c8701b3b601d', '30261581-d212-490c-8476-210ab68ed33f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.356+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('581acbca-4d5e-47cc-b965-6b1eff24b568', '59a85c86-6212-42ed-b118-55c102370673', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.361+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e732e827-d22a-4ccb-b5fb-4b1b3366a4ad', '15c81f44-f7e3-494c-8689-ee2eadb86d53', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.365+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('fd3e3c67-5f05-405c-8cb7-ae45a6a8321c', '9f54ef6d-41ae-441d-b9b2-343eef741ab7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.37+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8d30dbd7-9bb7-419d-92d4-b7d3dceee9a5', '6ad91743-e615-4c18-9354-199d18bc8413', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.374+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('33a83fe3-fc96-479e-ab26-00ec1d495d6e', 'd5b62a5c-1951-426b-9176-27acc93b7608', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.379+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('745df4d9-d128-4d0c-b268-6386d7a3b14e', 'c62acd17-fab2-4ae2-9a47-afb101b18e4f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.386+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6557f87e-f771-480e-8b2d-7d0b9cbdb064', 'f4314383-e2bc-4bc2-b709-4ab156cb104e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.391+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2c424304-d30b-45c3-b30f-27e056d22294', 'bd7dd382-152c-4a4f-8267-8c25c412adfb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.396+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('85098d1e-7600-454a-97a1-a0ddb8ffd305', '14881117-fa22-4d60-8d7c-7046ad50203f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.401+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6c7173df-cd3c-4098-923f-721ebea3826c', '4fbbc49b-c37f-46e9-8ec9-7a3552d3f2c7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.405+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8300451c-5fc8-4691-8193-1b0d0d885fa6', 'a051fc24-d842-496c-9e7c-2da8904f78b3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.411+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('86ead424-c140-42b2-9d7a-3573f947d211', '07466be7-3049-4781-8116-8803348bf62c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.415+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d5a78cea-ffe9-499c-a687-f41f437ad8ad', 'f2563adb-6f8d-40fb-9b1b-5b17b38ba576', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.42+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d3d99bdf-0b3c-4fbf-90d4-f5102869bc4f', 'b288b908-2ef9-43a5-9035-6a4fac23091d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.425+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3f572aa9-2ead-44d4-a2ed-341fc08a5819', 'eb52d311-f75f-4e2d-9e56-cf8c557af3e9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.43+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bfb328c8-a069-4f57-a8ae-fa485aebe735', '0358649b-d2d3-4d6b-913f-2e13b86dac5f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.436+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7856638a-47b8-49a8-80ea-db72faf958c0', 'bb824d90-5323-488d-b2d5-cbec87dc8802', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.442+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('971faaf7-91c3-49b4-b4e6-e56068c33641', '3cdfc151-b716-4d8f-b18b-cde689bb9d62', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.448+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2e212a70-71bc-4d0d-904a-bb49aa65a162', 'aec76b7b-aa05-4c99-a3b2-5e1623bc3ba0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.453+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2fce89c2-e693-4605-ba95-ef1f1257ff27', 'bf40c683-1d94-453f-a1b3-32d3140ae7bd', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.459+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ac905e38-1a3d-4097-a808-aa6d2e4066c5', '1f7d3d9c-a8b4-4dd1-b8a8-858c86437cbc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.464+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('026d411a-e89c-46b8-9826-bd6fab9cd266', 'd76cd8de-7940-4e52-8d17-a7b4980fc5fc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.47+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a8f6b2cb-95ad-4238-a520-6d572cb836fe', '0508bcf3-aa73-418d-bfde-96fdb66484c5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.475+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('71829d38-a53d-4e8d-bcb7-e06a7df3103d', '5ed69f27-8dd4-45db-aca2-88e593a464da', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.482+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4de226dd-98a8-4579-be1c-f2fdcf8881e2', '3a1fcec3-4fc4-44a5-aed0-584ebc4007ee', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.487+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('38b76028-81fe-4ec0-92f4-83b0142d26b1', '3e9a2ce7-de38-4e8b-bf91-beca2de1a8bb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.494+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1fd6751d-b6c7-4ac0-9d07-44295a8fa819', '6977db7e-04dc-4262-8c99-30387793465d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.5+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a995245f-0b5d-4e61-a324-2f549644efea', '3dd02456-4ee3-467b-886d-d80a08d6e972', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.507+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2d889882-250d-4314-a7bb-76cea095654f', '33920f35-bf54-4af5-a26a-cafc295ad4bc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.514+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('44342a62-6a59-4f2f-aba3-10d95c56c417', '5b7bcc7d-9c8d-471f-9fed-12d6f7f881bf', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.52+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d8c66c02-137c-46ba-8c28-d2ad8fb782e1', 'faa14977-082c-40fd-b848-2b59fa25d44d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.529+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ed3975a6-1c38-4fef-bb5b-20ec76f33bd4', '4c1677a1-c58d-4964-b004-f4c9de0b97a5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.536+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('494229cc-dabf-4628-aa13-e53513d43253', '250d3a14-56dd-4187-8b29-8a03b9330e2e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.543+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f7ae76f2-88ea-4fb8-aff9-ad43f1de50f9', '3bb7b09b-3f1e-4f0c-b4b5-59c80e92cef0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.549+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('cc35bd0f-b22d-4389-ae88-05db53e5d26f', 'ffc09da8-96b5-4218-adb5-4329c7fa238e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.555+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2cbed512-fb39-454d-855c-9c0059fc0c12', 'b8b2d97b-cb2c-4c7e-877d-986d9691f7e9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.561+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('562539ae-9db5-4c0f-bc71-5c9371943271', '7ddc0a05-e9bd-4c60-8013-db4995a33f8e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.569+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('28389067-9b9a-4514-a08e-baf757afd4f9', '59696039-1323-4d43-92ff-cc37970d5a16', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.576+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('12efe7a4-9800-43e4-af1a-6f0ab5977305', '75ecf7dc-8304-4568-ad84-dc5daf041d00', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:18:27.582+00');
INSERT INTO public.store_settings (id, store_name, logo_path, whatsapp_number, phone_display, email, address, city, opening_hours, pickup_enabled, delivery_enabled, pickup_info, delivery_info, instagram_url, facebook_url, tiktok_url, whatsapp_greeting, order_message_intro, order_message_footer, hero_interval_seconds, pending_order_ttl_hours, timezone, content, updated_at) VALUES (1, 'Podium Sports', NULL, '554998090818', '(49) 99809-0818', NULL, NULL, 'Videira, SC', NULL, true, true, 'Retire na loja em Videira, SC.', 'Entrega em Videira e região — taxa combinada pelo WhatsApp.', NULL, NULL, NULL, 'Olá, Podium Sports! Vim pelo site.', 'Olá, Podium Sports! Quero fazer este pedido:', NULL, 6, 48, 'America/Sao_Paulo', '{"cta": {"text": "Chama a gente no WhatsApp que a gente te ajuda a escolher.", "title": "Dúvida no tamanho ou sabor?", "enabled": true, "buttonLabel": "Falar no WhatsApp →"}, "home": {"showOnSale": true, "showCatalog": true, "featuredTitle": "Destaques", "showCategories": true, "showNewArrivals": true}, "benefits": [{"icon": "whatsapp", "text": "Atendimento direto", "title": "Pedido no WhatsApp"}, {"icon": "truck", "text": "Videira e região", "title": "Retirada ou entrega"}, {"icon": "card", "text": "Combinado na conversa", "title": "Pix ou cartão"}, {"icon": "shield", "text": "Marcas de confiança", "title": "Produtos originais"}], "cartNote": "Tamanho, cor e sabor a gente confirma no WhatsApp.", "trustItems": [{"icon": "medal", "text": "Produtos selecionados", "title": "Qualidade"}, {"icon": "trophy", "text": "Aqui em Videira", "title": "Loja local"}, {"icon": "clock", "text": "Atendimento pelo Zap", "title": "Resposta rápida"}, {"icon": "diamond", "text": "Tudo em um só lugar", "title": "Do futsal à academia"}], "brandBanner": {"text": "Chuteiras de futsal, society e campo das marcas que você confia.", "title": "Entra em campo.", "brands": ["Nike", "Adidas", "Umbro", "Joma", "Penalty", "Poker"], "kicker": "Feito pra campeões", "enabled": true, "buttonUrl": "/produtos?categoria=chuteiras", "highlight": "Sobe no pódio.", "buttonLabel": "Ver chuteiras →"}, "footerAbout": "Loja de artigos esportivos, suplementação, tênis e moda fitness em Videira, SC.", "serviceNotes": ["Como comprar: monte a sacola e envie pelo WhatsApp", "Trocas: combine com a loja"], "topbarMessages": ["**PEDIDO PELO WHATSAPP** · rápido e fácil", "🏆 Artigos esportivos, suplementos, tênis e moda fitness"]}', '2026-10-10 18:18:27.12+00');

COMMIT;
