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
-- Migration 20261012120000_out_for_delivery_customer_messages
-- ---------------------------------------------------------------------------
-- Pedidos com entrega ganham a etapa "Saiu para entrega" e o painel passa a registrar
-- as mensagens de atualização preparadas para o cliente (link wa.me aberto pela loja).
-- Migração aditiva: nenhuma coluna ou dado existente é alterado.

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP_LINK');

-- AlterEnum (o novo valor não é usado nesta migração; seguro dentro de transação no PostgreSQL 12+)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY' AFTER 'READY';

-- CreateTable
CREATE TABLE "order_messages" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP_LINK',
    "body" VARCHAR(1000) NOT NULL,
    "open_count" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opened_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,

    CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_messages_open_count_check" CHECK ("open_count" >= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "order_messages_order_id_status_key" ON "order_messages"("order_id", "status");

-- CreateIndex (consulta de novidades do painel: último pedido alterado)
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at" DESC);

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_last_opened_by_id_fkey" FOREIGN KEY ("last_opened_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS / privilégios: mesmo padrão das demais tabelas (somente a API acessa).
ALTER TABLE "order_messages" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.order_messages FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.order_messages FROM authenticated;
  END IF;
END $$;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, '7c73ca3c88b8ed7fc54af3599c592a0994265e73a3252bff2de804c98aeae9f2', now(), '20261012120000_out_for_delivery_customer_messages', 1);

-- ---------------------------------------------------------------------------
-- Migration 20261012150000_banner_editor
-- ---------------------------------------------------------------------------
-- Editor de banners: destinos escolhidos no painel (produto, categoria, página, link externo
-- ou WhatsApp), preços da oferta, layout e enquadramento da foto por dispositivo.
-- Migração aditiva: nenhuma coluna ou dado existente é alterado. Os banners já cadastrados
-- continuam usando button_url/secondary_button_url (button_target fica nulo) e mantêm o visual
-- anterior: layout "full", escurecimento 85% e foto centralizada (image_frame nulo).

-- AlterTable
ALTER TABLE "banners"
  ADD COLUMN "show_kicker" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "price_original_cents" INTEGER,
  ADD COLUMN "price_sale_cents" INTEGER,
  ADD COLUMN "show_prices" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "footnote" VARCHAR(160),
  ADD COLUMN "button_target" JSONB,
  ADD COLUMN "secondary_button_target" JSONB,
  ADD COLUMN "secondary_button_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "layout" VARCHAR(10) NOT NULL DEFAULT 'full',
  ADD COLUMN "content_align" VARCHAR(6) NOT NULL DEFAULT 'left',
  ADD COLUMN "overlay" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "image_frame" JSONB,
  ADD COLUMN "image_bg" VARCHAR(7);

-- Regras de integridade (mesmas validações da API)
ALTER TABLE "banners"
  ADD CONSTRAINT "banners_prices_valid" CHECK (
    ("price_original_cents" IS NULL OR "price_original_cents" > 0)
    AND ("price_sale_cents" IS NULL OR "price_sale_cents" > 0)
    AND ("price_original_cents" IS NULL OR "price_sale_cents" IS NULL OR "price_original_cents" > "price_sale_cents")
  ),
  ADD CONSTRAINT "banners_layout_valid" CHECK ("layout" IN ('split', 'full')),
  ADD CONSTRAINT "banners_content_align_valid" CHECK ("content_align" IN ('left', 'right')),
  ADD CONSTRAINT "banners_overlay_range" CHECK ("overlay" BETWEEN 0 AND 90),
  ADD CONSTRAINT "banners_image_bg_hex" CHECK ("image_bg" IS NULL OR "image_bg" ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT "banners_targets_object" CHECK (
    ("button_target" IS NULL OR jsonb_typeof("button_target") = 'object')
    AND ("secondary_button_target" IS NULL OR jsonb_typeof("secondary_button_target") = 'object')
    AND ("image_frame" IS NULL OR jsonb_typeof("image_frame") = 'object')
  );

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, '24a41224c94871299bd0451d108d58c0a9e774454d079b06aca56b6a0141665f', now(), '20261012150000_banner_editor', 1);

-- ---------------------------------------------------------------------------
-- Migration 20261013120000_banner_mobile_image
-- ---------------------------------------------------------------------------
-- Foto opcional exclusiva para o celular no banner. Migração aditiva: banners existentes
-- ficam com as colunas nulas e continuam usando a foto principal em todos os dispositivos.

-- AlterTable
ALTER TABLE "banners"
  ADD COLUMN "mobile_image_path" VARCHAR(300),
  ADD COLUMN "mobile_image_bg" VARCHAR(7);

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_mobile_image_bg_hex" CHECK ("mobile_image_bg" IS NULL OR "mobile_image_bg" ~ '^#[0-9a-fA-F]{6}$');

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, 'c39ca93f85fbd6884ad7a78d280cbd644923b0388736c4bdf0d04323a20ea93a', now(), '20261013120000_banner_mobile_image', 1);

-- ---------------------------------------------------------------------------
-- Migration 20261013180000_banner_mobile_layout
-- ---------------------------------------------------------------------------
-- Formato e escurecimento próprios do celular no banner. Migração aditiva: banners existentes
-- ficam com as colunas nulas e o celular continua usando o formato (layout) e o escurecimento
-- (overlay) do computador, exatamente como antes.

-- AlterTable
ALTER TABLE "banners"
  ADD COLUMN "mobile_layout" VARCHAR(10),
  ADD COLUMN "mobile_overlay" INTEGER;

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_mobile_layout_valid" CHECK ("mobile_layout" IS NULL OR "mobile_layout" IN ('split', 'full')),
  ADD CONSTRAINT "banners_mobile_overlay_range" CHECK ("mobile_overlay" IS NULL OR "mobile_overlay" BETWEEN 0 AND 90);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES (gen_random_uuid()::text, '206774f25e6b42a3555ccbb6aef482fc4c92fbf7adf5793c7cd1ce0efb50e1bc', now(), '20261013180000_banner_mobile_layout', 1);

-- ---------------------------------------------------------------------------
-- Dados iniciais (catálogo, categorias, banners e configurações do site original)
-- Estoque provisório: 10 unidades por produto — ajuste no painel.
-- ---------------------------------------------------------------------------
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg, mobile_image_path, mobile_image_bg, mobile_layout, mobile_overlay) VALUES ('a76c010e-bd0d-431e-a9d6-9664afad6d82', 'Podium Sports · Videira, SC', 'Supere', 'seus limites', 'Chuteiras, tênis, suplementos e tudo pro seu treino. Monte seu pedido aqui e finalize direto pelo WhatsApp.', NULL, 'trophy', '#2a2a2e', '#0b0b0c', 'Ver produtos →', '/produtos', 'Ofertas', '/produtos?ofertas=1', NULL, NULL, NULL, 0, true, NULL, NULL, '2026-10-13 10:44:53.766+00', '2026-10-13 10:44:53.766+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg, mobile_image_path, mobile_image_bg, mobile_layout, mobile_overlay) VALUES ('04d620a6-7802-4a27-a0b9-68e7784792c6', 'Oferta', 'Chuteira', 'F50 Messi', 'De R$ 599,00 por R$ 399,90. Adicione na sacola e confirme o tamanho pelo WhatsApp.', NULL, 'shoe', '#1d4a2c', '#08140c', 'Quero a minha →', '/produto/chuteira-f50-messi', 'Ver chuteiras', '/produtos?categoria=chuteiras', 'Desconto', '-33%', 'R$ 399,90', 1, true, NULL, NULL, '2026-10-13 10:44:53.766+00', '2026-10-13 10:44:53.766+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg, mobile_image_path, mobile_image_bg, mobile_layout, mobile_overlay) VALUES ('aad0fe76-1640-49b2-9c6f-0bac7445c3fa', 'Suplementação', 'Mais força', 'no seu treino', 'Whey, creatina, pré-treino e hipercalórico de marcas como Max Titanium e Nutrata.', NULL, 'jar', '#5a3608', '#140c03', 'Ver suplementos →', '/produtos?categoria=suplementos', NULL, NULL, 'Creatina', 'R$59', 'a partir de', 2, true, NULL, NULL, '2026-10-13 10:44:53.766+00', '2026-10-13 10:44:53.766+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg, mobile_image_path, mobile_image_bg, mobile_layout, mobile_overlay) VALUES ('f1d2112d-ac42-460e-ba3f-a282a2962686', 'Do futsal ao campo', 'Monte seu', 'kit completo', 'Chuteira, meião, caneleira, luva de goleiro e tudo pra entrar em campo.', NULL, 'ball', '#123f4a', '#05151a', 'Ver futebol →', '/produtos?categoria=futebol', 'Goleiro', '/produtos?categoria=goleiro', 'Luvas', 'R$99', 'a partir de', 3, true, NULL, NULL, '2026-10-13 10:44:53.766+00', '2026-10-13 10:44:53.766+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('39973943-86dc-4bd5-bbbd-d894808333e9', 'Chuteiras', 'chuteiras', NULL, 'ball', '#2b6a3c', '#0d2414', NULL, 0, true, true, '2026-10-13 10:44:53.488+00', '2026-10-13 10:44:53.488+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('f737d8ff-85af-46a7-a321-730ae5ba8434', 'Tênis', 'tenis', NULL, 'run', '#3a3a44', '#111114', NULL, 1, true, true, '2026-10-13 10:44:53.493+00', '2026-10-13 10:44:53.493+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('ea796cd8-c938-43f1-81ca-4bb3c4c54668', 'Suplementos', 'suplementos', NULL, 'jar', '#7a4a10', '#1c1206', NULL, 2, true, true, '2026-10-13 10:44:53.497+00', '2026-10-13 10:44:53.497+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 'Roupas', 'roupas', NULL, 'shirt', '#3b3360', '#120f1f', NULL, 3, true, false, '2026-10-13 10:44:53.5+00', '2026-10-13 10:44:53.5+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('b79de55b-e81c-4345-b500-d2609193172a', 'Futebol', 'futebol', NULL, 'ball', '#1c5b54', '#081a18', NULL, 4, true, false, '2026-10-13 10:44:53.503+00', '2026-10-13 10:44:53.503+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('9abea74c-41e0-4116-8064-7dbb5634461c', 'Goleiro', 'goleiro', NULL, 'glove', '#6b1d2c', '#1d080c', NULL, 5, true, false, '2026-10-13 10:44:53.506+00', '2026-10-13 10:44:53.506+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('982e0349-ea6d-4c25-b033-5bc6f43fad85', 'Acessórios', 'acessorios', 'Treino e acessórios', 'dumbbell', '#44464d', '#121214', NULL, 6, true, true, '2026-10-13 10:44:53.508+00', '2026-10-13 10:44:53.508+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e8af5f99-7218-42a3-a083-ac4bfd76374d', 1, 'Umbro Pro 5 Shark', 'umbro-pro-5-shark', 'Umbro', NULL, 'umbro pro 5 shark umbro chuteiras', 69990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, true, 1, '2026-10-13 10:44:53.516+00', '2026-10-13 10:44:53.516+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('991dd9c8-d76e-43a5-9663-8fde91bfa524', 2, 'Umbro Pro 5 Bump', 'umbro-pro-5-bump', 'Umbro', NULL, 'umbro pro 5 bump umbro chuteiras', 64990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 101, '2026-10-13 10:44:53.522+00', '2026-10-13 10:44:53.522+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b1f44d93-a326-4b12-b531-f842f983d1df', 3, 'Umbro Attack Campo', 'umbro-attack-campo', 'Umbro', NULL, 'umbro attack campo umbro chuteiras', 27990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 102, '2026-10-13 10:44:53.526+00', '2026-10-13 10:44:53.526+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('90f47c53-dc72-4b94-ae82-6055bb93c713', 4, 'Joma Top-Flex', 'joma-top-flex', 'Joma', NULL, 'joma top-flex joma chuteiras', 74990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 103, '2026-10-13 10:44:53.53+00', '2026-10-13 10:44:53.53+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('02520458-1f20-420b-90ef-056ad5e676c9', 5, 'Joma Top-Flex ACBF', 'joma-top-flex-acbf', 'Joma', NULL, 'joma top-flex acbf joma chuteiras', 67990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 104, '2026-10-13 10:44:53.534+00', '2026-10-13 10:44:53.534+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b9c1fe83-7108-438c-b613-8e49a373c0af', 6, 'Joma Top-Flex', 'joma-top-flex-2', 'Joma', NULL, 'joma top-flex joma chuteiras', 64990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 105, '2026-10-13 10:44:53.538+00', '2026-10-13 10:44:53.538+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bf8d73fa-0384-4374-8584-3e8143c616e7', 7, 'Chuteira Futsal Nike Tiempo', 'chuteira-futsal-nike-tiempo', 'Nike', NULL, 'chuteira futsal nike tiempo nike chuteiras', 69990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 106, '2026-10-13 10:44:53.541+00', '2026-10-13 10:44:53.541+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e4fb1e44-e533-4cf6-bb3b-f7cf6f07382d', 8, 'Chuteira Futsal Nike Zoom', 'chuteira-futsal-nike-zoom', 'Nike', NULL, 'chuteira futsal nike zoom nike chuteiras', 69990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 107, '2026-10-13 10:44:53.545+00', '2026-10-13 10:44:53.545+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f1511f58-f0e7-41d0-9d50-fe4bb4c4f3ab', 9, 'Chuteira Society Nike', 'chuteira-society-nike', 'Nike', NULL, 'chuteira society nike nike chuteiras', 29990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 108, '2026-10-13 10:44:53.551+00', '2026-10-13 10:44:53.551+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9797edaa-f3b3-4e52-87e4-05415246e8b3', 10, 'Chuteira F50 Messi', 'chuteira-f50-messi', NULL, NULL, 'chuteira f50 messi chuteiras', 59900, 39990, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, true, 0, '2026-10-13 10:44:53.555+00', '2026-10-13 10:44:53.555+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7a1f2479-dad9-4948-a979-f287eebb766a', 11, 'Chuteira Futsal Penalty', 'chuteira-futsal-penalty', 'Penalty', NULL, 'chuteira futsal penalty penalty chuteiras', 36990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 110, '2026-10-13 10:44:53.559+00', '2026-10-13 10:44:53.559+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7d06c3b0-57ae-4207-933f-0bdec13ab4e6', 12, 'Chuteira Society Infantil Penalty', 'chuteira-society-infantil-penalty', 'Penalty', NULL, 'chuteira society infantil penalty penalty chuteiras', 14990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 111, '2026-10-13 10:44:53.563+00', '2026-10-13 10:44:53.563+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('736d3df8-498d-42d2-951a-c0eaebf5c424', 13, 'Chuteira Campo Líder Infantil', 'chuteira-campo-lider-infantil', 'Líder', NULL, 'chuteira campo lider infantil lider chuteiras', 13990, NULL, '39973943-86dc-4bd5-bbbd-d894808333e9', 10, 2, true, false, 112, '2026-10-13 10:44:53.567+00', '2026-10-13 10:44:53.567+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1f4bdb56-4230-4ba6-b50f-38ff3c797ccc', 14, 'Nike Quest 6', 'nike-quest-6', 'Nike', NULL, 'nike quest 6 nike tenis', 59990, NULL, 'f737d8ff-85af-46a7-a321-730ae5ba8434', 10, 2, true, true, 3, '2026-10-13 10:44:53.57+00', '2026-10-13 10:44:53.57+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('aeffb1fc-9f06-44f5-b341-ed63d22dac06', 15, 'Adidas Duramos SL 2', 'adidas-duramos-sl-2', 'Adidas', NULL, 'adidas duramos sl 2 adidas tenis', 49990, NULL, 'f737d8ff-85af-46a7-a321-730ae5ba8434', 10, 2, true, false, 114, '2026-10-13 10:44:53.574+00', '2026-10-13 10:44:53.574+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1de3a552-037f-4569-a784-5c2e6450945f', 16, 'Adidas Latin Run 3.0', 'adidas-latin-run-3-0', 'Adidas', NULL, 'adidas latin run 3.0 adidas tenis', 44990, NULL, 'f737d8ff-85af-46a7-a321-730ae5ba8434', 10, 2, true, false, 115, '2026-10-13 10:44:53.578+00', '2026-10-13 10:44:53.578+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('24808822-ebe9-47a9-838b-90b049269b77', 17, 'Nike Revolution 8', 'nike-revolution-8', 'Nike', NULL, 'nike revolution 8 nike tenis', 39990, NULL, 'f737d8ff-85af-46a7-a321-730ae5ba8434', 10, 2, true, false, 116, '2026-10-13 10:44:53.581+00', '2026-10-13 10:44:53.581+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3703e0c9-d174-4914-8aa6-27a507a700ab', 18, 'Nike Run Defy', 'nike-run-defy', 'Nike', NULL, 'nike run defy nike tenis', 34990, NULL, 'f737d8ff-85af-46a7-a321-730ae5ba8434', 10, 2, true, false, 117, '2026-10-13 10:44:53.585+00', '2026-10-13 10:44:53.585+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('eae6dd7a-78d9-418a-9453-3a795384522f', 19, '100% Whey Max Titanium 900g', '100-whey-max-titanium-900g', 'Max Titanium', NULL, '100% whey max titanium 900g max titanium suplementos', 21990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, true, 2, '2026-10-13 10:44:53.589+00', '2026-10-13 10:44:53.589+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('87debf22-6b5f-4bea-8715-25711a0730c9', 20, 'Whey Refil 100%', 'whey-refil-100', NULL, NULL, 'whey refil 100% suplementos', 18990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 119, '2026-10-13 10:44:53.592+00', '2026-10-13 10:44:53.592+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('87d85109-305d-4672-815a-56e6026dce36', 21, 'Whey Refil W100 Nutrata 900g', 'whey-refil-w100-nutrata-900g', 'Nutrata', NULL, 'whey refil w100 nutrata 900g nutrata suplementos', 16990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 120, '2026-10-13 10:44:53.596+00', '2026-10-13 10:44:53.596+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('916f8abd-d475-4262-8d6a-c7a23680d1bb', 22, 'Pré-treino Hórus Elite 300g', 'pre-treino-horus-elite-300g', NULL, NULL, 'pre-treino horus elite 300g suplementos', 13990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 121, '2026-10-13 10:44:53.6+00', '2026-10-13 10:44:53.6+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('53fc8c5e-a8d1-4145-87e9-1927bb1aa679', 23, 'Pré-treino Night Train 300g', 'pre-treino-night-train-300g', NULL, NULL, 'pre-treino night train 300g suplementos', 11990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 122, '2026-10-13 10:44:53.603+00', '2026-10-13 10:44:53.603+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('88d12690-cfca-4a38-9d24-158ca53d5270', 24, 'Pré-treino Horus 7Belo 300g', 'pre-treino-horus-7belo-300g', NULL, NULL, 'pre-treino horus 7belo 300g suplementos', 9990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 123, '2026-10-13 10:44:53.606+00', '2026-10-13 10:44:53.606+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('31a52c37-326c-4681-9002-a943998890e3', 25, 'Mass Titanium 17500', 'mass-titanium-17500', NULL, NULL, 'mass titanium 17500 suplementos', 12990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, true, 4, '2026-10-13 10:44:53.61+00', '2026-10-13 10:44:53.61+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1d7b6193-ccd9-4b11-a1f0-38819dfc2ca1', 26, 'Massa Nitro Probiótica', 'massa-nitro-probiotica', NULL, NULL, 'massa nitro probiotica suplementos', 11990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 125, '2026-10-13 10:44:53.614+00', '2026-10-13 10:44:53.614+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('69e45393-8e99-43a7-8949-b055f2cdb80f', 27, 'Creatina Monohidratada 300g Hardcore', 'creatina-monohidratada-300g-hardcore', NULL, NULL, 'creatina monohidratada 300g hardcore suplementos', 7990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 126, '2026-10-13 10:44:53.618+00', '2026-10-13 10:44:53.618+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e533ab80-2faf-40a1-813e-2789d8ef9c48', 28, 'Creatina Monohidratada 300g Max', 'creatina-monohidratada-300g-max', NULL, NULL, 'creatina monohidratada 300g max suplementos', 6990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 127, '2026-10-13 10:44:53.621+00', '2026-10-13 10:44:53.621+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0c71b798-c8c2-4fd1-96d9-04f29c4521ef', 29, 'Creatina Monohidratada 300g Nutrata', 'creatina-monohidratada-300g-nutrata', 'Nutrata', NULL, 'creatina monohidratada 300g nutrata nutrata suplementos', 5990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 128, '2026-10-13 10:44:53.625+00', '2026-10-13 10:44:53.625+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('713988a9-0e4a-4b71-bfb8-8cfa823c42c4', 30, 'Multi Max Complexo Vitamínico 90 cáps', 'multi-max-complexo-vitaminico-90-caps', NULL, NULL, 'multi max complexo vitaminico 90 caps suplementos', 6990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 129, '2026-10-13 10:44:53.629+00', '2026-10-13 10:44:53.629+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3f4fd039-a938-4c28-ba1f-e833d3f17a97', 31, 'Ômega 3 Nutrata 60 cáps', 'omega-3-nutrata-60-caps', 'Nutrata', NULL, 'omega 3 nutrata 60 caps nutrata suplementos', 4990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 130, '2026-10-13 10:44:53.633+00', '2026-10-13 10:44:53.633+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e2902f95-08c5-4ab3-ad51-62f60a79c7de', 32, 'Fire Black Max Titanium 60 cáps', 'fire-black-max-titanium-60-caps', 'Max Titanium', NULL, 'fire black max titanium 60 caps max titanium suplementos', 4990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 131, '2026-10-13 10:44:53.636+00', '2026-10-13 10:44:53.636+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('2abd41dd-2885-4765-9114-7069304cd6ed', 33, 'Fire White Max Titanium', 'fire-white-max-titanium', 'Max Titanium', NULL, 'fire white max titanium max titanium suplementos', 3990, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 132, '2026-10-13 10:44:53.64+00', '2026-10-13 10:44:53.64+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('16d6e630-daa4-4745-b127-8c2e33786b37', 34, 'Proto Bar Havana (unidade)', 'proto-bar-havana-unidade', NULL, NULL, 'proto bar havana (unidade) suplementos', 1600, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 133, '2026-10-13 10:44:53.643+00', '2026-10-13 10:44:53.643+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a44f67f1-d1aa-482b-9f79-16ad045456ca', 35, 'Barra Protein Crisp (unidade)', 'barra-protein-crisp-unidade', NULL, NULL, 'barra protein crisp (unidade) suplementos', 1100, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 134, '2026-10-13 10:44:53.647+00', '2026-10-13 10:44:53.647+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3c16db85-9309-415d-bfc7-889e2e429926', 36, 'Whey Grego Bar (unidade)', 'whey-grego-bar-unidade', NULL, NULL, 'whey grego bar (unidade) suplementos', 700, NULL, 'ea796cd8-c938-43f1-81ca-4bb3c4c54668', 10, 2, true, false, 135, '2026-10-13 10:44:53.651+00', '2026-10-13 10:44:53.651+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('063a9294-1d79-4df4-89c4-ea55cec92f57', 37, 'Jaqueta Feminina Poker', 'jaqueta-feminina-poker', 'Poker', NULL, 'jaqueta feminina poker poker roupas', 14990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 136, '2026-10-13 10:44:53.654+00', '2026-10-13 10:44:53.654+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('36abc8eb-5fcd-4edd-b7ed-a79b59a4a64e', 38, 'Corta Vento Feminino', 'corta-vento-feminino', NULL, NULL, 'corta vento feminino roupas', 10990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 137, '2026-10-13 10:44:53.658+00', '2026-10-13 10:44:53.658+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8526db0b-b322-4ea4-8951-ecafe287e5c3', 39, 'Corta Vento Masculino', 'corta-vento-masculino', NULL, NULL, 'corta vento masculino roupas', 9990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 138, '2026-10-13 10:44:53.661+00', '2026-10-13 10:44:53.661+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1211e2c3-3549-4edc-a20f-d71bbecd7a19', 40, 'Regata Poliamida Feminina', 'regata-poliamida-feminina', NULL, NULL, 'regata poliamida feminina roupas', 9990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 139, '2026-10-13 10:44:53.665+00', '2026-10-13 10:44:53.665+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a60ce4a6-4d42-4a53-b6c4-3a8209a1febe', 41, 'Camisa Podium', 'camisa-podium', 'Podium', NULL, 'camisa podium podium roupas', 6990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 140, '2026-10-13 10:44:53.668+00', '2026-10-13 10:44:53.668+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('6c7c4f15-5ca7-4622-96ad-bfb4670ec85e', 42, 'Camisa Esportiva Feminina', 'camisa-esportiva-feminina', NULL, NULL, 'camisa esportiva feminina roupas', 5990, NULL, '11533eeb-2c73-4d1e-9f7c-7b540b868eb7', 10, 2, true, false, 141, '2026-10-13 10:44:53.672+00', '2026-10-13 10:44:53.672+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('67699786-ad16-4816-bbea-d2826fd7c10a', 43, 'Meia Antiderrapante (preta ou branca)', 'meia-antiderrapante-preta-ou-branca', NULL, NULL, 'meia antiderrapante (preta ou branca) futebol', 5990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 142, '2026-10-13 10:44:53.676+00', '2026-10-13 10:44:53.676+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('692e2ca4-525f-4668-87fc-524e08471d14', 44, 'Meia Antiderrapante', 'meia-antiderrapante', NULL, NULL, 'meia antiderrapante futebol', 4990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 143, '2026-10-13 10:44:53.68+00', '2026-10-13 10:44:53.68+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b30e8094-b146-4596-9252-c18a37f515ca', 45, 'Meião sem Pé', 'meiao-sem-pe', NULL, NULL, 'meiao sem pe futebol', 3990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 144, '2026-10-13 10:44:53.683+00', '2026-10-13 10:44:53.683+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7d961695-cb1d-40af-b37a-7a706a858cda', 46, 'Meião Penalty', 'meiao-penalty', 'Penalty', NULL, 'meiao penalty penalty futebol', 2990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 145, '2026-10-13 10:44:53.687+00', '2026-10-13 10:44:53.687+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c1c83c5d-1190-470d-86e9-f1c081d72e96', 47, 'Meia Futebol Training Infantil', 'meia-futebol-training-infantil', NULL, NULL, 'meia futebol training infantil futebol', 2990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 146, '2026-10-13 10:44:53.69+00', '2026-10-13 10:44:53.69+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('acc1ee7d-09d3-4713-8d8c-9f0f9fdbc9f2', 48, 'Suporte de Caneleira', 'suporte-de-caneleira', NULL, NULL, 'suporte de caneleira futebol', 3490, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 147, '2026-10-13 10:44:53.694+00', '2026-10-13 10:44:53.694+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0b735561-a15b-4723-9766-4c85f636cebd', 49, 'Canelito Multi Esportivo', 'canelito-multi-esportivo', NULL, NULL, 'canelito multi esportivo futebol', 2990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 148, '2026-10-13 10:44:53.697+00', '2026-10-13 10:44:53.697+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('fff0f7e7-47c1-40e1-a58d-f47b1eb7cef0', 50, 'Bomba de Inflar', 'bomba-de-inflar', NULL, NULL, 'bomba de inflar futebol', 3990, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 149, '2026-10-13 10:44:53.701+00', '2026-10-13 10:44:53.701+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('8439b618-e526-4fe6-bed1-d8857c28f793', 51, 'Cartão Oficial para Juiz', 'cartao-oficial-para-juiz', NULL, NULL, 'cartao oficial para juiz futebol', 2000, NULL, 'b79de55b-e81c-4345-b500-d2609193172a', 10, 2, true, false, 150, '2026-10-13 10:44:53.704+00', '2026-10-13 10:44:53.704+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b000e117-d4fb-4f69-9809-8c7732a3d296', 52, 'Luva Profissional Basic', 'luva-profissional-basic', NULL, NULL, 'luva profissional basic goleiro', 19990, NULL, '9abea74c-41e0-4116-8064-7dbb5634461c', 10, 2, true, false, 151, '2026-10-13 10:44:53.708+00', '2026-10-13 10:44:53.708+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0fbf2e0f-756e-4c8b-bef8-6cb82efbf429', 53, 'Luva Training', 'luva-training', NULL, NULL, 'luva training goleiro', 11990, NULL, '9abea74c-41e0-4116-8064-7dbb5634461c', 10, 2, true, false, 152, '2026-10-13 10:44:53.711+00', '2026-10-13 10:44:53.711+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7a641af7-2041-47be-be19-3af09f46dbca', 54, 'Luva Training Infantil', 'luva-training-infantil', NULL, NULL, 'luva training infantil goleiro', 9990, NULL, '9abea74c-41e0-4116-8064-7dbb5634461c', 10, 2, true, false, 153, '2026-10-13 10:44:53.715+00', '2026-10-13 10:44:53.715+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('db91cb50-3365-4668-896c-e993b90c6dd9', 55, 'Joelheira Profissional', 'joelheira-profissional', NULL, NULL, 'joelheira profissional acessorios', 12990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 154, '2026-10-13 10:44:53.718+00', '2026-10-13 10:44:53.718+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5e8585ee-a287-4cbf-8e84-3a2e27b62f59', 56, 'Joelheira Profissional Infantil', 'joelheira-profissional-infantil', NULL, NULL, 'joelheira profissional infantil acessorios', 8990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 155, '2026-10-13 10:44:53.722+00', '2026-10-13 10:44:53.722+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d6e56bed-5760-4f1f-9be5-89a0e8e3577c', 57, 'Kit 3 Mini Band Poker', 'kit-3-mini-band-poker', 'Poker', NULL, 'kit 3 mini band poker poker acessorios', 5990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 156, '2026-10-13 10:44:53.725+00', '2026-10-13 10:44:53.725+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0cb466cd-58dc-4f63-9861-75dc71bd5f46', 58, 'Braçadeira Porta Celular', 'bracadeira-porta-celular', NULL, NULL, 'bracadeira porta celular acessorios', 5990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 157, '2026-10-13 10:44:53.729+00', '2026-10-13 10:44:53.729+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('985dda30-5595-47ee-b3cc-4e8a4e8cd61e', 59, 'Hand Grip Poker', 'hand-grip-poker', 'Poker', NULL, 'hand grip poker poker acessorios', 5000, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 158, '2026-10-13 10:44:53.732+00', '2026-10-13 10:44:53.732+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d5a861d4-8029-4930-a158-7ec16a616189', 60, 'Galão Max Titanium 2,2L', 'galao-max-titanium-2-2l', 'Max Titanium', NULL, 'galao max titanium 2,2l max titanium acessorios', 4990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 159, '2026-10-13 10:44:53.736+00', '2026-10-13 10:44:53.736+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('077536df-6f6e-4963-80c6-e8c2090b30fd', 61, 'Straps Musculação Poker', 'straps-musculacao-poker', 'Poker', NULL, 'straps musculacao poker poker acessorios', 3990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 160, '2026-10-13 10:44:53.743+00', '2026-10-13 10:44:53.743+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('43b7fafc-99a2-41cf-a395-b5a8e4dd327b', 62, 'Munhequeira Ajustável', 'munhequeira-ajustavel', NULL, NULL, 'munhequeira ajustavel acessorios', 3990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 161, '2026-10-13 10:44:53.746+00', '2026-10-13 10:44:53.746+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('80c705ae-d84f-42a8-a559-5af7adc9e3a3', 63, 'Munhequeira Neoprene', 'munhequeira-neoprene', NULL, NULL, 'munhequeira neoprene acessorios', 3490, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 162, '2026-10-13 10:44:53.75+00', '2026-10-13 10:44:53.75+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('de24c633-f2ab-420a-900c-dbe713e072f3', 64, 'Manguito Esportivo', 'manguito-esportivo', NULL, NULL, 'manguito esportivo acessorios', 2990, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 163, '2026-10-13 10:44:53.754+00', '2026-10-13 10:44:53.754+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c4a0a4f4-b76e-4efe-90b7-b81c80f6686b', 65, 'Corda de Pular Poker', 'corda-de-pular-poker', 'Poker', NULL, 'corda de pular poker poker acessorios', 2900, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 164, '2026-10-13 10:44:53.757+00', '2026-10-13 10:44:53.757+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('fd656d8f-cfc8-4b50-862b-9c3c499643bb', 66, 'Protetor Bucal Simples', 'protetor-bucal-simples', NULL, NULL, 'protetor bucal simples acessorios', 1490, NULL, '982e0349-ea6d-4c25-b033-5bc6f43fad85', 10, 2, true, false, 165, '2026-10-13 10:44:53.761+00', '2026-10-13 10:44:53.761+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b8365742-9b41-4d2b-be64-c01569f0e5fb', 'e8af5f99-7218-42a3-a083-ac4bfd76374d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.518+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a199d947-6821-4904-a54a-6c948511418b', '991dd9c8-d76e-43a5-9663-8fde91bfa524', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.523+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('05bb6503-0edc-4d97-b8bf-4b653ca4ad6c', 'b1f44d93-a326-4b12-b531-f842f983d1df', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.527+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0081a4a6-7ed1-471e-b00e-34c56687f775', '90f47c53-dc72-4b94-ae82-6055bb93c713', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.531+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('33eb35ab-0ae1-4a5e-b23f-2078b6b40a80', '02520458-1f20-420b-90ef-056ad5e676c9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.535+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('350e9df7-2534-417d-a4a4-38b9bf592193', 'b9c1fe83-7108-438c-b613-8e49a373c0af', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.539+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c5a6855e-5ad5-49d0-8bc4-880f60b451d2', 'bf8d73fa-0384-4374-8584-3e8143c616e7', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.542+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3fb7c8e9-422e-45c9-8589-32b74b09dda0', 'e4fb1e44-e533-4cf6-bb3b-f7cf6f07382d', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.546+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4b6cdd60-5439-4e63-a7d5-54692c44ca23', 'f1511f58-f0e7-41d0-9d50-fe4bb4c4f3ab', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.552+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('312b5621-facf-4cc6-9ff9-1a4e5f16ebb0', '9797edaa-f3b3-4e52-87e4-05415246e8b3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.556+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0e5f5b63-c9d3-4e0a-8779-a0e8975c9b28', '7a1f2479-dad9-4948-a979-f287eebb766a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.56+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3ed1cbe3-8fd2-464f-8731-82a7f2e168e1', '7d06c3b0-57ae-4207-933f-0bdec13ab4e6', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.563+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3b895b56-4d33-4fef-b628-d6b527c18137', '736d3df8-498d-42d2-951a-c0eaebf5c424', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.567+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c290f993-814a-4ec8-b1d9-2276e98925a2', '1f4bdb56-4230-4ba6-b50f-38ff3c797ccc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.571+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8955b8f3-2a51-49fc-b16a-87b9df653a8b', 'aeffb1fc-9f06-44f5-b341-ed63d22dac06', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.575+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a13c56ce-90be-4b24-aae5-7fed84488587', '1de3a552-037f-4569-a784-5c2e6450945f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.578+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('97631819-c815-463f-8ba9-444f792bbcc0', '24808822-ebe9-47a9-838b-90b049269b77', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.582+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d1789478-20ee-4d1b-aaa8-fd1f740126c3', '3703e0c9-d174-4914-8aa6-27a507a700ab', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.586+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1c1e19b5-fb7b-47e0-bd17-8e68566aad18', 'eae6dd7a-78d9-418a-9453-3a795384522f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.589+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7d067bc6-a668-4d3d-af0b-5d0d526ebb27', '87debf22-6b5f-4bea-8715-25711a0730c9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.593+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bd7c8827-55dd-492b-a0ae-7318d81aaea0', '87d85109-305d-4672-815a-56e6026dce36', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.597+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1420f1f1-f033-4471-85f8-7bc977874ecb', '916f8abd-d475-4262-8d6a-c7a23680d1bb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.601+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f9e52153-3f70-456c-91e0-75f2dbaa464b', '53fc8c5e-a8d1-4145-87e9-1927bb1aa679', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.604+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6bc79153-0654-4113-bce5-5fbb30b226e9', '88d12690-cfca-4a38-9d24-158ca53d5270', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.607+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('dae6f0f4-0c7b-4a68-99a9-88380d2ca3f3', '31a52c37-326c-4681-9002-a943998890e3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.611+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('032cc12d-61f7-43fe-b38c-7001da68773d', '1d7b6193-ccd9-4b11-a1f0-38819dfc2ca1', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.615+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b1836442-d647-4215-8dc6-54d3532ef198', '69e45393-8e99-43a7-8949-b055f2cdb80f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.618+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7b98fd0d-13dc-46c4-abc7-c43d402d525b', 'e533ab80-2faf-40a1-813e-2789d8ef9c48', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.622+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('130c0f71-a97c-4941-b2ac-c8f843db49fe', '0c71b798-c8c2-4fd1-96d9-04f29c4521ef', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.626+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2be7b2e4-73b4-4985-9831-d579b9590b2b', '713988a9-0e4a-4b71-bfb8-8cfa823c42c4', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.63+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('29f813d1-5812-4e1e-ab22-c64056e57ef5', '3f4fd039-a938-4c28-ba1f-e833d3f17a97', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.633+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8dfa00d9-19ef-4fad-b7ba-6645024b395f', 'e2902f95-08c5-4ab3-ad51-62f60a79c7de', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.637+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('06fde2b7-9b06-4941-a0ca-e6f26c47dbe1', '2abd41dd-2885-4765-9114-7069304cd6ed', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.641+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a7b5ca65-af75-4c1a-9233-d9d11b095808', '16d6e630-daa4-4745-b127-8c2e33786b37', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.644+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('76a9e9ef-0879-4997-9556-18f66d936bb9', 'a44f67f1-d1aa-482b-9f79-16ad045456ca', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.648+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4f1a3f67-b95d-4425-b1a3-81552984cfd2', '3c16db85-9309-415d-bfc7-889e2e429926', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.651+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5b002868-c24a-4028-9b9e-316a6c50d8ac', '063a9294-1d79-4df4-89c4-ea55cec92f57', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.655+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('57c85094-9ccc-4129-be79-1cdaa810d271', '36abc8eb-5fcd-4edd-b7ed-a79b59a4a64e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.659+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e3137a48-f165-4e48-9b66-5da93436b321', '8526db0b-b322-4ea4-8951-ecafe287e5c3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.662+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('62ceaf1e-8a90-49db-a648-812dc5d25c74', '1211e2c3-3549-4edc-a20f-d71bbecd7a19', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.666+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2af41e90-6c25-4807-aa92-698efac2dd46', 'a60ce4a6-4d42-4a53-b6c4-3a8209a1febe', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.67+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3bd83027-f00b-43da-8650-0cbb2f9cf7b1', '6c7c4f15-5ca7-4622-96ad-bfb4670ec85e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.673+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('42424484-1faa-48ef-b622-f71024900f54', '67699786-ad16-4816-bbea-d2826fd7c10a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.677+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9d74a471-8122-42aa-8a4f-1ccb8e11420c', '692e2ca4-525f-4668-87fc-524e08471d14', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.681+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b9e72267-8fb8-438c-adce-52a2eb358c25', 'b30e8094-b146-4596-9252-c18a37f515ca', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.684+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1e0b3b81-fda8-485d-9716-b1c90331ca76', '7d961695-cb1d-40af-b37a-7a706a858cda', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.688+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0ff3ce5e-2c4b-4c56-af02-975a2ee2a02e', 'c1c83c5d-1190-470d-86e9-f1c081d72e96', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.691+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('54547755-e5a1-4ca7-98d1-7c4d66b0c01b', 'acc1ee7d-09d3-4713-8d8c-9f0f9fdbc9f2', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.694+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('54557c01-69b2-4451-96ff-4961bc1d2a18', '0b735561-a15b-4723-9766-4c85f636cebd', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.698+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('36d690d3-4120-4676-b797-5f8dbfbb86f1', 'fff0f7e7-47c1-40e1-a58d-f47b1eb7cef0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.702+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9f24dbdd-0368-4cd9-b188-ad662154bbfd', '8439b618-e526-4fe6-bed1-d8857c28f793', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.705+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7d00df9c-4673-4c16-bed4-0983188d0e70', 'b000e117-d4fb-4f69-9809-8c7732a3d296', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.709+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('18679bee-9178-48a7-9e3c-06b23f350db4', '0fbf2e0f-756e-4c8b-bef8-6cb82efbf429', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.712+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6b97d613-561a-42b1-8a22-df900c9e284d', '7a641af7-2041-47be-be19-3af09f46dbca', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.716+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('eca3c75d-d9ac-4d79-839f-ef01317a97c0', 'db91cb50-3365-4668-896c-e993b90c6dd9', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.719+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3327a7f8-dd32-4074-a1b0-217db924eb65', '5e8585ee-a287-4cbf-8e84-3a2e27b62f59', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.722+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7abc3da8-faff-42c2-a232-8e4719faa6c8', 'd6e56bed-5760-4f1f-9be5-89a0e8e3577c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.726+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('61bf484e-365d-466d-b132-1901ef751768', '0cb466cd-58dc-4f63-9861-75dc71bd5f46', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.729+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('fb24e317-ae75-49f6-a422-97ba8b38bbc9', '985dda30-5595-47ee-b3cc-4e8a4e8cd61e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.733+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3235db64-c9e9-493b-a28f-fa31040634fe', 'd5a861d4-8029-4930-a158-7ec16a616189', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.737+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1f339c64-9a11-4f45-a7ca-00c51551f654', '077536df-6f6e-4963-80c6-e8c2090b30fd', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.744+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('91854126-9bb3-4c73-a3a2-040e5a66e193', '43b7fafc-99a2-41cf-a395-b5a8e4dd327b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.747+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('84df920c-fc1f-4cd5-aaee-b053fae9bcd9', '80c705ae-d84f-42a8-a559-5af7adc9e3a3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.751+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ca00ceb1-a338-4da2-b91b-4fb20a9e092a', 'de24c633-f2ab-420a-900c-dbe713e072f3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.755+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c96ab521-f94b-4aec-b7a9-8981ea8275d6', 'c4a0a4f4-b76e-4efe-90b7-b81c80f6686b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.758+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ea8ec5fa-e470-47cd-9cf9-00c312fb4d57', 'fd656d8f-cfc8-4b50-862b-9c3c499643bb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-13 10:44:53.762+00');
INSERT INTO public.store_settings (id, store_name, logo_path, whatsapp_number, phone_display, email, address, city, opening_hours, pickup_enabled, delivery_enabled, pickup_info, delivery_info, instagram_url, facebook_url, tiktok_url, whatsapp_greeting, order_message_intro, order_message_footer, hero_interval_seconds, pending_order_ttl_hours, timezone, content, updated_at) VALUES (1, 'Podium Sports', NULL, '554998090818', '(49) 99809-0818', NULL, NULL, 'Videira, SC', NULL, true, true, 'Retire na loja em Videira, SC.', 'Entrega em Videira e região — taxa combinada pelo WhatsApp.', NULL, NULL, NULL, 'Olá, Podium Sports! Vim pelo site.', 'Olá, Podium Sports! Quero fazer este pedido:', NULL, 6, 48, 'America/Sao_Paulo', '{"cta": {"text": "Chama a gente no WhatsApp que a gente te ajuda a escolher.", "title": "Dúvida no tamanho ou sabor?", "enabled": true, "buttonLabel": "Falar no WhatsApp →"}, "home": {"showOnSale": true, "showCatalog": true, "featuredTitle": "Destaques", "showCategories": true, "showNewArrivals": true}, "benefits": [{"icon": "whatsapp", "text": "Atendimento direto", "title": "Pedido no WhatsApp"}, {"icon": "truck", "text": "Videira e região", "title": "Retirada ou entrega"}, {"icon": "card", "text": "Combinado na conversa", "title": "Pix ou cartão"}, {"icon": "shield", "text": "Marcas de confiança", "title": "Produtos originais"}], "cartNote": "Tamanho, cor e sabor a gente confirma no WhatsApp.", "trustItems": [{"icon": "medal", "text": "Produtos selecionados", "title": "Qualidade"}, {"icon": "trophy", "text": "Aqui em Videira", "title": "Loja local"}, {"icon": "clock", "text": "Atendimento pelo Zap", "title": "Resposta rápida"}, {"icon": "diamond", "text": "Tudo em um só lugar", "title": "Do futsal à academia"}], "brandBanner": {"text": "Chuteiras de futsal, society e campo das marcas que você confia.", "title": "Entra em campo.", "brands": ["Nike", "Adidas", "Umbro", "Joma", "Penalty", "Poker"], "kicker": "Feito pra campeões", "enabled": true, "buttonUrl": "/produtos?categoria=chuteiras", "highlight": "Sobe no pódio.", "buttonLabel": "Ver chuteiras →"}, "footerAbout": "Loja de artigos esportivos, suplementação, tênis e moda fitness em Videira, SC.", "serviceNotes": ["Como comprar: monte a sacola e envie pelo WhatsApp", "Trocas: combine com a loja"], "topbarMessages": ["**PEDIDO PELO WHATSAPP** · rápido e fácil", "🏆 Artigos esportivos, suplementos, tênis e moda fitness"], "customerMessages": {"accepted": "Olá, {nome}! Seu pedido {pedido} foi aceito e já estamos separando tudo. Obrigado pela preferência!", "cancelled": "Olá, {nome}. Houve um cancelamento no pedido {pedido}. Entre em contato conosco caso precise de ajuda.", "completed": "Olá, {nome}! Seu pedido {pedido} foi concluído. Obrigado pela preferência!", "processing": "Olá, {nome}! Seu pedido {pedido} está em separação. Avisaremos assim que estiver pronto.", "readyPickup": "Olá, {nome}! Seu pedido {pedido} está pronto para retirada. Aguardamos você na loja!", "readyDelivery": "Olá, {nome}! Seu pedido {pedido} está pronto e logo sairá para entrega.", "outForDelivery": "Olá, {nome}! Seu pedido {pedido} saiu para entrega. Em breve ele chegará até você."}}', '2026-10-13 10:44:53.481+00');

COMMIT;
