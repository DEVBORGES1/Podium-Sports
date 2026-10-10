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
\restrict 82eGSfShrniUtcF3LHZxv9Ey3ZkhB7pRx3iTLyswyBDaT7kPtd79u2Z7rYAFRTC
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('30b83f26-fb45-4ffb-a32d-eecf3c3fbb44', 'Podium Sports · Videira, SC', 'Supere', 'seus limites', 'Chuteiras, tênis, suplementos e tudo pro seu treino. Monte seu pedido aqui e finalize direto pelo WhatsApp.', NULL, 'trophy', '#2a2a2e', '#0b0b0c', 'Ver produtos →', '/produtos', 'Ofertas', '/produtos?ofertas=1', NULL, NULL, NULL, 0, true, NULL, NULL, '2026-10-10 18:14:20.359+00', '2026-10-10 18:14:20.359+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('abddbeac-39cd-4dfb-b26b-2a7c75542f45', 'Oferta', 'Chuteira', 'F50 Messi', 'De R$ 599,00 por R$ 399,90. Adicione na sacola e confirme o tamanho pelo WhatsApp.', NULL, 'shoe', '#1d4a2c', '#08140c', 'Quero a minha →', '/produto/chuteira-f50-messi', 'Ver chuteiras', '/produtos?categoria=chuteiras', 'Desconto', '-33%', 'R$ 399,90', 1, true, NULL, NULL, '2026-10-10 18:14:20.359+00', '2026-10-10 18:14:20.359+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('337b6881-b99f-45c4-a3a8-ebf685093cb0', 'Suplementação', 'Mais força', 'no seu treino', 'Whey, creatina, pré-treino e hipercalórico de marcas como Max Titanium e Nutrata.', NULL, 'jar', '#5a3608', '#140c03', 'Ver suplementos →', '/produtos?categoria=suplementos', NULL, NULL, 'Creatina', 'R$59', 'a partir de', 2, true, NULL, NULL, '2026-10-10 18:14:20.359+00', '2026-10-10 18:14:20.359+00');
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at) VALUES ('9c644713-fa79-44cd-ac12-72f3279107ce', 'Do futsal ao campo', 'Monte seu', 'kit completo', 'Chuteira, meião, caneleira, luva de goleiro e tudo pra entrar em campo.', NULL, 'ball', '#123f4a', '#05151a', 'Ver futebol →', '/produtos?categoria=futebol', 'Goleiro', '/produtos?categoria=goleiro', 'Luvas', 'R$99', 'a partir de', 3, true, NULL, NULL, '2026-10-10 18:14:20.359+00', '2026-10-10 18:14:20.359+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('d48396fa-49ee-4fce-b158-ea1201e58556', 'Chuteiras', 'chuteiras', NULL, 'ball', '#2b6a3c', '#0d2414', NULL, 0, true, true, '2026-10-10 18:14:19.938+00', '2026-10-10 18:14:19.938+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('80feebbe-4648-4c93-bf53-431baa2f09af', 'Tênis', 'tenis', NULL, 'run', '#3a3a44', '#111114', NULL, 1, true, true, '2026-10-10 18:14:19.945+00', '2026-10-10 18:14:19.945+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('7de0a197-9625-4de1-8f55-b834f81c2d21', 'Suplementos', 'suplementos', NULL, 'jar', '#7a4a10', '#1c1206', NULL, 2, true, true, '2026-10-10 18:14:19.948+00', '2026-10-10 18:14:19.948+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('86ec76e7-a654-4291-96e8-23fbeeec6104', 'Roupas', 'roupas', NULL, 'shirt', '#3b3360', '#120f1f', NULL, 3, true, false, '2026-10-10 18:14:19.951+00', '2026-10-10 18:14:19.951+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('a329af1e-7631-4593-bfe1-b159049d2923', 'Futebol', 'futebol', NULL, 'ball', '#1c5b54', '#081a18', NULL, 4, true, false, '2026-10-10 18:14:19.955+00', '2026-10-10 18:14:19.955+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('33408dd0-0663-4b3a-b2d7-95ca63d3401d', 'Goleiro', 'goleiro', NULL, 'glove', '#6b1d2c', '#1d080c', NULL, 5, true, false, '2026-10-10 18:14:19.957+00', '2026-10-10 18:14:19.957+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('06c408a0-fd38-45b2-ae9b-e58eec4f1411', 'Acessórios', 'acessorios', 'Treino e acessórios', 'dumbbell', '#44464d', '#121214', NULL, 6, true, true, '2026-10-10 18:14:19.96+00', '2026-10-10 18:14:19.96+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('aec434e0-1f97-4021-9945-3b996d214ca4', 1, 'Umbro Pro 5 Shark', 'umbro-pro-5-shark', 'Umbro', NULL, 'umbro pro 5 shark umbro chuteiras', 69990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, true, 1, '2026-10-10 18:14:19.97+00', '2026-10-10 18:14:19.97+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a07c68ca-36aa-44b4-8a19-5a75e65989f5', 2, 'Umbro Pro 5 Bump', 'umbro-pro-5-bump', 'Umbro', NULL, 'umbro pro 5 bump umbro chuteiras', 64990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 101, '2026-10-10 18:14:19.983+00', '2026-10-10 18:14:19.983+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('39d58201-8c89-40a0-a96d-e177165699ea', 3, 'Umbro Attack Campo', 'umbro-attack-campo', 'Umbro', NULL, 'umbro attack campo umbro chuteiras', 27990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 102, '2026-10-10 18:14:19.991+00', '2026-10-10 18:14:19.991+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7cd0156b-eb91-470d-9a5e-fb5740ac6e0a', 4, 'Joma Top-Flex', 'joma-top-flex', 'Joma', NULL, 'joma top-flex joma chuteiras', 74990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 103, '2026-10-10 18:14:20.001+00', '2026-10-10 18:14:20.001+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3dfc1e71-7c11-4e9e-a5de-9dafcad89d2c', 5, 'Joma Top-Flex ACBF', 'joma-top-flex-acbf', 'Joma', NULL, 'joma top-flex acbf joma chuteiras', 67990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 104, '2026-10-10 18:14:20.009+00', '2026-10-10 18:14:20.009+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4b8ed2d1-f171-4970-b357-cc29f96d9021', 6, 'Joma Top-Flex', 'joma-top-flex-2', 'Joma', NULL, 'joma top-flex joma chuteiras', 64990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 105, '2026-10-10 18:14:20.016+00', '2026-10-10 18:14:20.016+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('af58c5b9-e01b-4114-a2d5-5efc685e0e8b', 7, 'Chuteira Futsal Nike Tiempo', 'chuteira-futsal-nike-tiempo', 'Nike', NULL, 'chuteira futsal nike tiempo nike chuteiras', 69990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 106, '2026-10-10 18:14:20.029+00', '2026-10-10 18:14:20.029+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('22f17c84-9174-4964-864c-8b524a63f1eb', 8, 'Chuteira Futsal Nike Zoom', 'chuteira-futsal-nike-zoom', 'Nike', NULL, 'chuteira futsal nike zoom nike chuteiras', 69990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 107, '2026-10-10 18:14:20.037+00', '2026-10-10 18:14:20.037+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('63e3d3a2-f3bf-421c-a308-470c563bbcbf', 9, 'Chuteira Society Nike', 'chuteira-society-nike', 'Nike', NULL, 'chuteira society nike nike chuteiras', 29990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 108, '2026-10-10 18:14:20.043+00', '2026-10-10 18:14:20.043+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3d7353c1-6d19-4253-8655-a4ffccaa62cc', 10, 'Chuteira F50 Messi', 'chuteira-f50-messi', NULL, NULL, 'chuteira f50 messi chuteiras', 59900, 39990, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, true, 0, '2026-10-10 18:14:20.049+00', '2026-10-10 18:14:20.049+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8c1834ec-8f58-4494-bfb2-44e3535bab0a', 11, 'Chuteira Futsal Penalty', 'chuteira-futsal-penalty', 'Penalty', NULL, 'chuteira futsal penalty penalty chuteiras', 36990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 110, '2026-10-10 18:14:20.055+00', '2026-10-10 18:14:20.055+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('112295e3-1b42-42bd-b4a5-bc599834f6c3', 12, 'Chuteira Society Infantil Penalty', 'chuteira-society-infantil-penalty', 'Penalty', NULL, 'chuteira society infantil penalty penalty chuteiras', 14990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 111, '2026-10-10 18:14:20.06+00', '2026-10-10 18:14:20.06+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('12182a5a-381c-44c1-adc2-e97bd446f132', 13, 'Chuteira Campo Líder Infantil', 'chuteira-campo-lider-infantil', 'Líder', NULL, 'chuteira campo lider infantil lider chuteiras', 13990, NULL, 'd48396fa-49ee-4fce-b158-ea1201e58556', 10, 2, true, false, 112, '2026-10-10 18:14:20.066+00', '2026-10-10 18:14:20.066+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bfa2f308-8740-4806-a1ea-0d3531d962ed', 14, 'Nike Quest 6', 'nike-quest-6', 'Nike', NULL, 'nike quest 6 nike tenis', 59990, NULL, '80feebbe-4648-4c93-bf53-431baa2f09af', 10, 2, true, true, 3, '2026-10-10 18:14:20.073+00', '2026-10-10 18:14:20.073+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('14b76107-f0d9-40dc-890a-ff5c59f01024', 15, 'Adidas Duramos SL 2', 'adidas-duramos-sl-2', 'Adidas', NULL, 'adidas duramos sl 2 adidas tenis', 49990, NULL, '80feebbe-4648-4c93-bf53-431baa2f09af', 10, 2, true, false, 114, '2026-10-10 18:14:20.08+00', '2026-10-10 18:14:20.08+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f29c8d7c-9110-4531-be7a-13aff3c6b982', 16, 'Adidas Latin Run 3.0', 'adidas-latin-run-3-0', 'Adidas', NULL, 'adidas latin run 3.0 adidas tenis', 44990, NULL, '80feebbe-4648-4c93-bf53-431baa2f09af', 10, 2, true, false, 115, '2026-10-10 18:14:20.085+00', '2026-10-10 18:14:20.085+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8babf7cf-d1c5-4a63-afcd-a865f14f97dc', 17, 'Nike Revolution 8', 'nike-revolution-8', 'Nike', NULL, 'nike revolution 8 nike tenis', 39990, NULL, '80feebbe-4648-4c93-bf53-431baa2f09af', 10, 2, true, false, 116, '2026-10-10 18:14:20.091+00', '2026-10-10 18:14:20.091+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4bb59fa5-35f4-42c4-922e-bd6591127fab', 18, 'Nike Run Defy', 'nike-run-defy', 'Nike', NULL, 'nike run defy nike tenis', 34990, NULL, '80feebbe-4648-4c93-bf53-431baa2f09af', 10, 2, true, false, 117, '2026-10-10 18:14:20.097+00', '2026-10-10 18:14:20.097+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b4b33e40-5556-4435-be4c-9af76a8de610', 19, '100% Whey Max Titanium 900g', '100-whey-max-titanium-900g', 'Max Titanium', NULL, '100% whey max titanium 900g max titanium suplementos', 21990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, true, 2, '2026-10-10 18:14:20.105+00', '2026-10-10 18:14:20.105+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5b651dde-752a-4a10-8f14-b87a8fe62fb0', 20, 'Whey Refil 100%', 'whey-refil-100', NULL, NULL, 'whey refil 100% suplementos', 18990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 119, '2026-10-10 18:14:20.11+00', '2026-10-10 18:14:20.11+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f523091f-8b27-4edf-8564-4862c3617b65', 21, 'Whey Refil W100 Nutrata 900g', 'whey-refil-w100-nutrata-900g', 'Nutrata', NULL, 'whey refil w100 nutrata 900g nutrata suplementos', 16990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 120, '2026-10-10 18:14:20.115+00', '2026-10-10 18:14:20.115+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('cabf405d-a55a-4abe-83b0-66e7ec7bd71b', 22, 'Pré-treino Hórus Elite 300g', 'pre-treino-horus-elite-300g', NULL, NULL, 'pre-treino horus elite 300g suplementos', 13990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 121, '2026-10-10 18:14:20.12+00', '2026-10-10 18:14:20.12+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9bceb2cc-1ec3-4daf-8295-b44a410ed59e', 23, 'Pré-treino Night Train 300g', 'pre-treino-night-train-300g', NULL, NULL, 'pre-treino night train 300g suplementos', 11990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 122, '2026-10-10 18:14:20.125+00', '2026-10-10 18:14:20.125+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a0f9e294-3023-413e-a9c2-285b9c492365', 24, 'Pré-treino Horus 7Belo 300g', 'pre-treino-horus-7belo-300g', NULL, NULL, 'pre-treino horus 7belo 300g suplementos', 9990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 123, '2026-10-10 18:14:20.129+00', '2026-10-10 18:14:20.129+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('df8ff93e-4cf0-4233-8c9f-8b8b7758e928', 25, 'Mass Titanium 17500', 'mass-titanium-17500', NULL, NULL, 'mass titanium 17500 suplementos', 12990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, true, 4, '2026-10-10 18:14:20.136+00', '2026-10-10 18:14:20.136+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4376a5c9-2203-4f94-94c2-d9f00d2708ed', 26, 'Massa Nitro Probiótica', 'massa-nitro-probiotica', NULL, NULL, 'massa nitro probiotica suplementos', 11990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 125, '2026-10-10 18:14:20.141+00', '2026-10-10 18:14:20.141+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4e2444fb-3767-419a-8009-ff697fce79fc', 27, 'Creatina Monohidratada 300g Hardcore', 'creatina-monohidratada-300g-hardcore', NULL, NULL, 'creatina monohidratada 300g hardcore suplementos', 7990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 126, '2026-10-10 18:14:20.147+00', '2026-10-10 18:14:20.147+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('84a2b649-813c-4600-bad2-f41ef2987e1b', 28, 'Creatina Monohidratada 300g Max', 'creatina-monohidratada-300g-max', NULL, NULL, 'creatina monohidratada 300g max suplementos', 6990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 127, '2026-10-10 18:14:20.153+00', '2026-10-10 18:14:20.153+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a136853d-98d2-4d13-a44e-4b2c4ce02b14', 29, 'Creatina Monohidratada 300g Nutrata', 'creatina-monohidratada-300g-nutrata', 'Nutrata', NULL, 'creatina monohidratada 300g nutrata nutrata suplementos', 5990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 128, '2026-10-10 18:14:20.161+00', '2026-10-10 18:14:20.161+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c08203ad-1402-417c-b99a-77f14129e7a3', 30, 'Multi Max Complexo Vitamínico 90 cáps', 'multi-max-complexo-vitaminico-90-caps', NULL, NULL, 'multi max complexo vitaminico 90 caps suplementos', 6990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 129, '2026-10-10 18:14:20.167+00', '2026-10-10 18:14:20.167+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3af8b819-8703-48e5-b402-ec162d134a09', 31, 'Ômega 3 Nutrata 60 cáps', 'omega-3-nutrata-60-caps', 'Nutrata', NULL, 'omega 3 nutrata 60 caps nutrata suplementos', 4990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 130, '2026-10-10 18:14:20.177+00', '2026-10-10 18:14:20.177+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3c4ee1c5-135c-43fd-8e95-c4e93d12e246', 32, 'Fire Black Max Titanium 60 cáps', 'fire-black-max-titanium-60-caps', 'Max Titanium', NULL, 'fire black max titanium 60 caps max titanium suplementos', 4990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 131, '2026-10-10 18:14:20.182+00', '2026-10-10 18:14:20.182+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f3832830-758d-4ced-bdcf-c3335b8cc3fe', 33, 'Fire White Max Titanium', 'fire-white-max-titanium', 'Max Titanium', NULL, 'fire white max titanium max titanium suplementos', 3990, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 132, '2026-10-10 18:14:20.188+00', '2026-10-10 18:14:20.188+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7a09df36-7faf-4d6c-8a3c-e558b04ab5e8', 34, 'Proto Bar Havana (unidade)', 'proto-bar-havana-unidade', NULL, NULL, 'proto bar havana (unidade) suplementos', 1600, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 133, '2026-10-10 18:14:20.192+00', '2026-10-10 18:14:20.192+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bfd92736-6baf-4f3c-91f0-dc34483860b8', 35, 'Barra Protein Crisp (unidade)', 'barra-protein-crisp-unidade', NULL, NULL, 'barra protein crisp (unidade) suplementos', 1100, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 134, '2026-10-10 18:14:20.197+00', '2026-10-10 18:14:20.197+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a2aba8c0-08b3-4a4a-ad37-c39b3356aca9', 36, 'Whey Grego Bar (unidade)', 'whey-grego-bar-unidade', NULL, NULL, 'whey grego bar (unidade) suplementos', 700, NULL, '7de0a197-9625-4de1-8f55-b834f81c2d21', 10, 2, true, false, 135, '2026-10-10 18:14:20.203+00', '2026-10-10 18:14:20.203+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ca4c4c37-6754-43de-891b-321d976b1a5a', 37, 'Jaqueta Feminina Poker', 'jaqueta-feminina-poker', 'Poker', NULL, 'jaqueta feminina poker poker roupas', 14990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 136, '2026-10-10 18:14:20.21+00', '2026-10-10 18:14:20.21+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('388cd785-107d-4566-a86a-653048661c3b', 38, 'Corta Vento Feminino', 'corta-vento-feminino', NULL, NULL, 'corta vento feminino roupas', 10990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 137, '2026-10-10 18:14:20.217+00', '2026-10-10 18:14:20.217+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8d6f5924-ba58-4c5a-a1b1-ce568dd798d1', 39, 'Corta Vento Masculino', 'corta-vento-masculino', NULL, NULL, 'corta vento masculino roupas', 9990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 138, '2026-10-10 18:14:20.222+00', '2026-10-10 18:14:20.222+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('df2556d7-5d0b-4681-8ad6-1f231487d449', 40, 'Regata Poliamida Feminina', 'regata-poliamida-feminina', NULL, NULL, 'regata poliamida feminina roupas', 9990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 139, '2026-10-10 18:14:20.227+00', '2026-10-10 18:14:20.227+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4fda190f-0991-4120-bd4e-01debff1ae97', 41, 'Camisa Podium', 'camisa-podium', 'Podium', NULL, 'camisa podium podium roupas', 6990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 140, '2026-10-10 18:14:20.232+00', '2026-10-10 18:14:20.232+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f77d26f4-76e3-4950-963a-abfeb31766b7', 42, 'Camisa Esportiva Feminina', 'camisa-esportiva-feminina', NULL, NULL, 'camisa esportiva feminina roupas', 5990, NULL, '86ec76e7-a654-4291-96e8-23fbeeec6104', 10, 2, true, false, 141, '2026-10-10 18:14:20.237+00', '2026-10-10 18:14:20.237+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f066a3f9-e05b-4c88-969e-6a5a0a88dc10', 43, 'Meia Antiderrapante (preta ou branca)', 'meia-antiderrapante-preta-ou-branca', NULL, NULL, 'meia antiderrapante (preta ou branca) futebol', 5990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 142, '2026-10-10 18:14:20.242+00', '2026-10-10 18:14:20.242+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('358a0a91-907c-4f26-8dc3-72eda41ecd13', 44, 'Meia Antiderrapante', 'meia-antiderrapante', NULL, NULL, 'meia antiderrapante futebol', 4990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 143, '2026-10-10 18:14:20.247+00', '2026-10-10 18:14:20.247+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('abbd3db3-7dc7-4078-a18d-1e9a88aac266', 45, 'Meião sem Pé', 'meiao-sem-pe', NULL, NULL, 'meiao sem pe futebol', 3990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 144, '2026-10-10 18:14:20.252+00', '2026-10-10 18:14:20.252+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6a0da636-1bf2-41b2-97f6-af154c66d09e', 46, 'Meião Penalty', 'meiao-penalty', 'Penalty', NULL, 'meiao penalty penalty futebol', 2990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 145, '2026-10-10 18:14:20.258+00', '2026-10-10 18:14:20.258+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('2561bb17-8354-4443-85ef-aaaec0dcfbc2', 47, 'Meia Futebol Training Infantil', 'meia-futebol-training-infantil', NULL, NULL, 'meia futebol training infantil futebol', 2990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 146, '2026-10-10 18:14:20.263+00', '2026-10-10 18:14:20.263+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0bb37736-5741-4f80-8957-bfab0246e5df', 48, 'Suporte de Caneleira', 'suporte-de-caneleira', NULL, NULL, 'suporte de caneleira futebol', 3490, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 147, '2026-10-10 18:14:20.268+00', '2026-10-10 18:14:20.268+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8247801a-dd97-45a3-8ced-8df02e2dcbb0', 49, 'Canelito Multi Esportivo', 'canelito-multi-esportivo', NULL, NULL, 'canelito multi esportivo futebol', 2990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 148, '2026-10-10 18:14:20.273+00', '2026-10-10 18:14:20.273+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7abe41c1-b960-4111-bdc8-11bd188a00fe', 50, 'Bomba de Inflar', 'bomba-de-inflar', NULL, NULL, 'bomba de inflar futebol', 3990, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 149, '2026-10-10 18:14:20.278+00', '2026-10-10 18:14:20.278+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ae72176d-9f27-4386-aadf-2830d5f5c019', 51, 'Cartão Oficial para Juiz', 'cartao-oficial-para-juiz', NULL, NULL, 'cartao oficial para juiz futebol', 2000, NULL, 'a329af1e-7631-4593-bfe1-b159049d2923', 10, 2, true, false, 150, '2026-10-10 18:14:20.283+00', '2026-10-10 18:14:20.283+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bce73721-dc6a-4c5d-8a61-95d307e99547', 52, 'Luva Profissional Basic', 'luva-profissional-basic', NULL, NULL, 'luva profissional basic goleiro', 19990, NULL, '33408dd0-0663-4b3a-b2d7-95ca63d3401d', 10, 2, true, false, 151, '2026-10-10 18:14:20.288+00', '2026-10-10 18:14:20.288+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6f035efc-d2bc-4090-93fb-8bb8601afccc', 53, 'Luva Training', 'luva-training', NULL, NULL, 'luva training goleiro', 11990, NULL, '33408dd0-0663-4b3a-b2d7-95ca63d3401d', 10, 2, true, false, 152, '2026-10-10 18:14:20.293+00', '2026-10-10 18:14:20.293+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('76372f17-90e5-46e9-babd-9ea1c1433365', 54, 'Luva Training Infantil', 'luva-training-infantil', NULL, NULL, 'luva training infantil goleiro', 9990, NULL, '33408dd0-0663-4b3a-b2d7-95ca63d3401d', 10, 2, true, false, 153, '2026-10-10 18:14:20.297+00', '2026-10-10 18:14:20.297+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('13da34f3-8747-4df3-9864-ea9c857541f7', 55, 'Joelheira Profissional', 'joelheira-profissional', NULL, NULL, 'joelheira profissional acessorios', 12990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 154, '2026-10-10 18:14:20.302+00', '2026-10-10 18:14:20.302+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('316c630d-1d27-4688-a6f5-90cb77298433', 56, 'Joelheira Profissional Infantil', 'joelheira-profissional-infantil', NULL, NULL, 'joelheira profissional infantil acessorios', 8990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 155, '2026-10-10 18:14:20.306+00', '2026-10-10 18:14:20.306+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b81506b8-64b3-49d4-b9d2-286a29518483', 57, 'Kit 3 Mini Band Poker', 'kit-3-mini-band-poker', 'Poker', NULL, 'kit 3 mini band poker poker acessorios', 5990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 156, '2026-10-10 18:14:20.311+00', '2026-10-10 18:14:20.311+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('acb514be-b6a8-4c83-bb14-1b34deb1dd76', 58, 'Braçadeira Porta Celular', 'bracadeira-porta-celular', NULL, NULL, 'bracadeira porta celular acessorios', 5990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 157, '2026-10-10 18:14:20.315+00', '2026-10-10 18:14:20.315+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ce9e6473-5edb-4985-9cc7-8911943a1d15', 59, 'Hand Grip Poker', 'hand-grip-poker', 'Poker', NULL, 'hand grip poker poker acessorios', 5000, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 158, '2026-10-10 18:14:20.319+00', '2026-10-10 18:14:20.319+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('00820a37-b4d3-42b6-9f0d-b7602014061b', 60, 'Galão Max Titanium 2,2L', 'galao-max-titanium-2-2l', 'Max Titanium', NULL, 'galao max titanium 2,2l max titanium acessorios', 4990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 159, '2026-10-10 18:14:20.323+00', '2026-10-10 18:14:20.323+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b1f327e3-02dd-4b81-a732-914bd8e1d162', 61, 'Straps Musculação Poker', 'straps-musculacao-poker', 'Poker', NULL, 'straps musculacao poker poker acessorios', 3990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 160, '2026-10-10 18:14:20.328+00', '2026-10-10 18:14:20.328+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('dd60124b-fadf-4112-bf00-8288cfd18fba', 62, 'Munhequeira Ajustável', 'munhequeira-ajustavel', NULL, NULL, 'munhequeira ajustavel acessorios', 3990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 161, '2026-10-10 18:14:20.333+00', '2026-10-10 18:14:20.333+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5d803133-90e8-4c33-a36b-b2fd9c44758d', 63, 'Munhequeira Neoprene', 'munhequeira-neoprene', NULL, NULL, 'munhequeira neoprene acessorios', 3490, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 162, '2026-10-10 18:14:20.337+00', '2026-10-10 18:14:20.337+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('235f4d22-61b3-43b4-a246-4e74c4b5dc2f', 64, 'Manguito Esportivo', 'manguito-esportivo', NULL, NULL, 'manguito esportivo acessorios', 2990, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 163, '2026-10-10 18:14:20.342+00', '2026-10-10 18:14:20.342+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4345742e-3ceb-4b6c-b377-ba5f49c90cfb', 65, 'Corda de Pular Poker', 'corda-de-pular-poker', 'Poker', NULL, 'corda de pular poker poker acessorios', 2900, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 164, '2026-10-10 18:14:20.346+00', '2026-10-10 18:14:20.346+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5e4005c9-c718-4e0a-b9d7-75a4089f81de', 66, 'Protetor Bucal Simples', 'protetor-bucal-simples', NULL, NULL, 'protetor bucal simples acessorios', 1490, NULL, '06c408a0-fd38-45b2-ae9b-e58eec4f1411', 10, 2, true, false, 165, '2026-10-10 18:14:20.352+00', '2026-10-10 18:14:20.352+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0e40da50-e5c8-4826-b962-61ecfe9c4cd9', 'aec434e0-1f97-4021-9945-3b996d214ca4', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:19.975+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('494910fa-6f5b-4b1d-900a-c5de8fd1616a', 'a07c68ca-36aa-44b4-8a19-5a75e65989f5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:19.986+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('800f8775-1b4e-4501-bde4-ca89d82da975', '39d58201-8c89-40a0-a96d-e177165699ea', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:19.994+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('fbea4032-6f2a-4345-8d20-fb4f99b21992', '7cd0156b-eb91-470d-9a5e-fb5740ac6e0a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.004+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bdbb94b2-b79e-4b51-93a2-2d20ba27dcaa', '3dfc1e71-7c11-4e9e-a5de-9dafcad89d2c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.011+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('28f96144-a684-4614-b527-cf2c69f74dc0', '4b8ed2d1-f171-4970-b357-cc29f96d9021', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.018+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('01b6f8b2-4599-426f-bd76-8622f5190446', 'af58c5b9-e01b-4114-a2d5-5efc685e0e8b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.032+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('017704a4-69ef-499a-91df-281a3e31c6cd', '22f17c84-9174-4964-864c-8b524a63f1eb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.038+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('61b9819e-e920-46f3-9c5d-5f236ebd2a60', '63e3d3a2-f3bf-421c-a308-470c563bbcbf', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.045+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d2e49dfa-a1d7-4a8f-9c00-0fbe76cf1e4b', '3d7353c1-6d19-4253-8655-a4ffccaa62cc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.051+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c7d7980c-f7d7-4bd6-9dd7-d9327e8ccbd9', '8c1834ec-8f58-4494-bfb2-44e3535bab0a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.056+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e8ca8d7a-e26d-42f9-9aae-3a62a2af9f2f', '112295e3-1b42-42bd-b4a5-bc599834f6c3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.061+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('74be7a7f-c05d-4abe-9d73-f8d70dd7dd71', '12182a5a-381c-44c1-adc2-e97bd446f132', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.068+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3b432c8d-fdc3-40b1-a90e-a52b980539b9', 'bfa2f308-8740-4806-a1ea-0d3531d962ed', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.075+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('277f44cd-3253-462f-8269-ad8fd7cdf346', '14b76107-f0d9-40dc-890a-ff5c59f01024', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.082+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('130f8505-2b41-46ea-8f94-b30a1280cf30', 'f29c8d7c-9110-4531-be7a-13aff3c6b982', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.087+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5f2b7cad-ecd8-40cb-a3cf-d721392d4809', '8babf7cf-d1c5-4a63-afcd-a865f14f97dc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.093+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('db9ba258-0db4-4e2a-837b-04fd975dd88c', '4bb59fa5-35f4-42c4-922e-bd6591127fab', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.098+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e69245fa-d32f-4bc7-8699-ef393b61d608', 'b4b33e40-5556-4435-be4c-9af76a8de610', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.106+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('218bdc74-e1dc-4724-8b96-722c92322683', '5b651dde-752a-4a10-8f14-b87a8fe62fb0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.111+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('60bb2996-2b04-4e50-953b-7e87ffb15187', 'f523091f-8b27-4edf-8564-4862c3617b65', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.117+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4f359c0b-934f-406f-aeaa-3372d555b7f0', 'cabf405d-a55a-4abe-83b0-66e7ec7bd71b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.121+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c08fe50e-4852-40db-be16-06b96b6f11b4', '9bceb2cc-1ec3-4daf-8295-b44a410ed59e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.126+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('dbd3064b-5b55-4879-8eb4-88f9612d698b', 'a0f9e294-3023-413e-a9c2-285b9c492365', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.13+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7f8c6c4a-2f9a-4fc8-a472-bcf525f94dbe', 'df8ff93e-4cf0-4233-8c9f-8b8b7758e928', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.137+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('71de7ab8-ec42-40b8-8aec-357c39978a73', '4376a5c9-2203-4f94-94c2-d9f00d2708ed', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.143+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('32a75ab2-4f2e-401e-a576-1d2fb1d7b652', '4e2444fb-3767-419a-8009-ff697fce79fc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.148+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e50f4014-7093-4c9a-9dd5-6821bac66293', '84a2b649-813c-4600-bad2-f41ef2987e1b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.156+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a55f96f6-c6af-491b-abb1-40f1bc7d1d3e', 'a136853d-98d2-4d13-a44e-4b2c4ce02b14', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.162+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e4009200-1b80-45b4-9525-b3a8b561a74e', 'c08203ad-1402-417c-b99a-77f14129e7a3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.17+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('75c9b32d-ad22-4569-b911-55873242540d', '3af8b819-8703-48e5-b402-ec162d134a09', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.178+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7625595b-a8dd-44a3-b0df-0f1299d3e322', '3c4ee1c5-135c-43fd-8e95-c4e93d12e246', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.184+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bab5e890-b16b-4af8-9f85-bf0122f1b2c4', 'f3832830-758d-4ced-bdcf-c3335b8cc3fe', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.189+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('13bfe063-664c-4007-8d0b-d81693777d48', '7a09df36-7faf-4d6c-8a3c-e558b04ab5e8', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.194+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bf16925e-18d3-47df-a89f-10970a54c70e', 'bfd92736-6baf-4f3c-91f0-dc34483860b8', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.199+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9241a6cb-1cfb-4a8f-a8e7-7c60e683a8ee', 'a2aba8c0-08b3-4a4a-ad37-c39b3356aca9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.204+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('dda57044-b9a6-4b0e-87a3-216b2297238c', 'ca4c4c37-6754-43de-891b-321d976b1a5a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.212+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('cf1ed5c7-9c02-4144-aab0-22c45bf774d5', '388cd785-107d-4566-a86a-653048661c3b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.218+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('eae2a4b2-b61c-417e-ba64-c3ef5b548c46', '8d6f5924-ba58-4c5a-a1b1-ce568dd798d1', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.223+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e7ac2238-77e5-4391-8869-88563f9033e1', 'df2556d7-5d0b-4681-8ad6-1f231487d449', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.229+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('99daa881-8c10-47c4-80a8-cc973a1f1ccb', '4fda190f-0991-4120-bd4e-01debff1ae97', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.234+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('212d13d5-ac09-4ada-8164-9c05786b7851', 'f77d26f4-76e3-4950-963a-abfeb31766b7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.238+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7b0c7546-eea3-4f99-acb1-fa3c7673419c', 'f066a3f9-e05b-4c88-969e-6a5a0a88dc10', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.243+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d3759bae-66a9-428b-add7-25c94fd513c0', '358a0a91-907c-4f26-8dc3-72eda41ecd13', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.248+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('22d7ea7d-cbbc-4521-94f6-c7bb37f9af04', 'abbd3db3-7dc7-4078-a18d-1e9a88aac266', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.253+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2469c9dd-aa87-4fa1-a326-25908694e407', '6a0da636-1bf2-41b2-97f6-af154c66d09e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.259+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f3b98f64-24b0-4999-aa35-1f4c2fbb52b7', '2561bb17-8354-4443-85ef-aaaec0dcfbc2', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.265+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6e0a1a60-5f9a-4aab-bc29-262cb51b64ad', '0bb37736-5741-4f80-8957-bfab0246e5df', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.269+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('48a17bff-46c0-4c08-ba76-a01b2f733f01', '8247801a-dd97-45a3-8ced-8df02e2dcbb0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.274+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c9e706f7-a17b-4a79-ae15-a993cf78b6e3', '7abe41c1-b960-4111-bdc8-11bd188a00fe', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.279+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c1050a31-6011-46eb-8fc0-4ac0faf0a812', 'ae72176d-9f27-4386-aadf-2830d5f5c019', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.284+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('78ff9b9f-89ff-43c8-96ba-6e99e0092218', 'bce73721-dc6a-4c5d-8a61-95d307e99547', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.289+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6de54f47-1287-4272-8ce2-28f4f958b336', '6f035efc-d2bc-4090-93fb-8bb8601afccc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.294+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('996a651c-ae2b-41a7-9eb4-df45e75313e6', '76372f17-90e5-46e9-babd-9ea1c1433365', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.299+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a06d05dc-fa8c-43ff-89cd-bb0a90558206', '13da34f3-8747-4df3-9864-ea9c857541f7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.303+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('846833c3-9eee-496b-9baf-72b0c37923d2', '316c630d-1d27-4688-a6f5-90cb77298433', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.308+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8485c939-3e9b-44c7-be55-121949cedaf4', 'b81506b8-64b3-49d4-b9d2-286a29518483', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.312+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d6100b85-057e-4c99-a8bc-a94ce1c4c914', 'acb514be-b6a8-4c83-bb14-1b34deb1dd76', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.316+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ea7e7fc4-7855-4450-bc62-39ba2ff7390c', 'ce9e6473-5edb-4985-9cc7-8911943a1d15', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.32+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1bfbfa5c-92f4-456b-b031-261a91330b89', '00820a37-b4d3-42b6-9f0d-b7602014061b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.325+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2e3ec9ff-31c4-45ec-8782-3c05f0b1f70a', 'b1f327e3-02dd-4b81-a732-914bd8e1d162', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.329+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('962ee1ce-c133-49bf-842d-5685f2b85d49', 'dd60124b-fadf-4112-bf00-8288cfd18fba', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.334+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3ff8edde-735e-4c5d-86d4-e1d7f7730c54', '5d803133-90e8-4c33-a36b-b2fd9c44758d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.338+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('dd0e62e1-1aa4-4ceb-939e-c91f6e6a19c5', '235f4d22-61b3-43b4-a246-4e74c4b5dc2f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.343+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bbe59a94-5b8d-4ac8-bd0b-ea3683ff249d', '4345742e-3ceb-4b6c-b377-ba5f49c90cfb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.347+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('10c6ba7d-e8af-49be-b6cc-a741aff04536', '5e4005c9-c718-4e0a-b9d7-75a4089f81de', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-10 18:14:20.354+00');
INSERT INTO public.store_settings (id, store_name, logo_path, whatsapp_number, phone_display, email, address, city, opening_hours, pickup_enabled, delivery_enabled, pickup_info, delivery_info, instagram_url, facebook_url, tiktok_url, whatsapp_greeting, order_message_intro, order_message_footer, hero_interval_seconds, pending_order_ttl_hours, timezone, content, updated_at) VALUES (1, 'Podium Sports', NULL, '554998090818', '(49) 99809-0818', NULL, NULL, 'Videira, SC', NULL, true, true, 'Retire na loja em Videira, SC.', 'Entrega em Videira e região — taxa combinada pelo WhatsApp.', NULL, NULL, NULL, 'Olá, Podium Sports! Vim pelo site.', 'Olá, Podium Sports! Quero fazer este pedido:', NULL, 6, 48, 'America/Sao_Paulo', '{"cta": {"text": "Chama a gente no WhatsApp que a gente te ajuda a escolher.", "title": "Dúvida no tamanho ou sabor?", "enabled": true, "buttonLabel": "Falar no WhatsApp →"}, "home": {"showOnSale": true, "showCatalog": true, "featuredTitle": "Destaques", "showCategories": true, "showNewArrivals": true}, "benefits": [{"icon": "whatsapp", "text": "Atendimento direto", "title": "Pedido no WhatsApp"}, {"icon": "truck", "text": "Videira e região", "title": "Retirada ou entrega"}, {"icon": "card", "text": "Combinado na conversa", "title": "Pix ou cartão"}, {"icon": "shield", "text": "Marcas de confiança", "title": "Produtos originais"}], "cartNote": "Tamanho, cor e sabor a gente confirma no WhatsApp.", "trustItems": [{"icon": "medal", "text": "Produtos selecionados", "title": "Qualidade"}, {"icon": "trophy", "text": "Aqui em Videira", "title": "Loja local"}, {"icon": "clock", "text": "Atendimento pelo Zap", "title": "Resposta rápida"}, {"icon": "diamond", "text": "Tudo em um só lugar", "title": "Do futsal à academia"}], "brandBanner": {"text": "Chuteiras de futsal, society e campo das marcas que você confia.", "title": "Entra em campo.", "brands": ["Nike", "Adidas", "Umbro", "Joma", "Penalty", "Poker"], "kicker": "Feito pra campeões", "enabled": true, "buttonUrl": "/produtos?categoria=chuteiras", "highlight": "Sobe no pódio.", "buttonLabel": "Ver chuteiras →"}, "footerAbout": "Loja de artigos esportivos, suplementação, tênis e moda fitness em Videira, SC.", "serviceNotes": ["Como comprar: monte a sacola e envie pelo WhatsApp", "Trocas: combine com a loja"], "topbarMessages": ["**PEDIDO PELO WHATSAPP** · rápido e fácil", "🏆 Artigos esportivos, suplementos, tênis e moda fitness"]}', '2026-10-10 18:14:19.921+00');
\unrestrict 82eGSfShrniUtcF3LHZxv9Ey3ZkhB7pRx3iTLyswyBDaT7kPtd79u2Z7rYAFRTC

COMMIT;
