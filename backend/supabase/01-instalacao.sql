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
-- Dados iniciais (catálogo, categorias, banners e configurações do site original)
-- Estoque provisório: 10 unidades por produto — ajuste no painel.
-- ---------------------------------------------------------------------------
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg) VALUES ('8be84a7c-edcb-45f6-8478-64e17dbb1b17', 'Podium Sports · Videira, SC', 'Supere', 'seus limites', 'Chuteiras, tênis, suplementos e tudo pro seu treino. Monte seu pedido aqui e finalize direto pelo WhatsApp.', NULL, 'trophy', '#2a2a2e', '#0b0b0c', 'Ver produtos →', '/produtos', 'Ofertas', '/produtos?ofertas=1', NULL, NULL, NULL, 0, true, NULL, NULL, '2026-10-12 18:51:38.2+00', '2026-10-12 18:51:38.2+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg) VALUES ('fcb54cc0-5d8c-456c-8ff9-83ddb26c0cc2', 'Oferta', 'Chuteira', 'F50 Messi', 'De R$ 599,00 por R$ 399,90. Adicione na sacola e confirme o tamanho pelo WhatsApp.', NULL, 'shoe', '#1d4a2c', '#08140c', 'Quero a minha →', '/produto/chuteira-f50-messi', 'Ver chuteiras', '/produtos?categoria=chuteiras', 'Desconto', '-33%', 'R$ 399,90', 1, true, NULL, NULL, '2026-10-12 18:51:38.2+00', '2026-10-12 18:51:38.2+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg) VALUES ('07cb691a-eaf4-48a5-a6d2-ff8ab165c31b', 'Suplementação', 'Mais força', 'no seu treino', 'Whey, creatina, pré-treino e hipercalórico de marcas como Max Titanium e Nutrata.', NULL, 'jar', '#5a3608', '#140c03', 'Ver suplementos →', '/produtos?categoria=suplementos', NULL, NULL, 'Creatina', 'R$59', 'a partir de', 2, true, NULL, NULL, '2026-10-12 18:51:38.2+00', '2026-10-12 18:51:38.2+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL);
INSERT INTO public.banners (id, kicker, title, highlight, subtitle, image_path, icon, color_from, color_to, button_label, button_url, secondary_button_label, secondary_button_url, badge_top, badge_main, badge_bottom, sort_order, is_active, starts_at, ends_at, created_at, updated_at, show_kicker, price_original_cents, price_sale_cents, show_prices, footnote, button_target, secondary_button_target, secondary_button_enabled, layout, content_align, "overlay", image_frame, image_bg) VALUES ('1bffedfe-8a24-47e5-9fd8-0aa320c3a372', 'Do futsal ao campo', 'Monte seu', 'kit completo', 'Chuteira, meião, caneleira, luva de goleiro e tudo pra entrar em campo.', NULL, 'ball', '#123f4a', '#05151a', 'Ver futebol →', '/produtos?categoria=futebol', 'Goleiro', '/produtos?categoria=goleiro', 'Luvas', 'R$99', 'a partir de', 3, true, NULL, NULL, '2026-10-12 18:51:38.2+00', '2026-10-12 18:51:38.2+00', true, NULL, NULL, true, NULL, NULL, NULL, true, 'full', 'left', 85, NULL, NULL);
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 'Chuteiras', 'chuteiras', NULL, 'ball', '#2b6a3c', '#0d2414', NULL, 0, true, true, '2026-10-12 18:51:37.744+00', '2026-10-12 18:51:37.744+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('f84ff0c9-fb39-4113-86f9-0911400e0dc4', 'Tênis', 'tenis', NULL, 'run', '#3a3a44', '#111114', NULL, 1, true, true, '2026-10-12 18:51:37.753+00', '2026-10-12 18:51:37.753+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('b8942444-2405-4e4a-ae97-f89ed872d6dd', 'Suplementos', 'suplementos', NULL, 'jar', '#7a4a10', '#1c1206', NULL, 2, true, true, '2026-10-12 18:51:37.758+00', '2026-10-12 18:51:37.758+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('137e05cf-6ba5-41d9-a558-b13dbb4896a8', 'Roupas', 'roupas', NULL, 'shirt', '#3b3360', '#120f1f', NULL, 3, true, false, '2026-10-12 18:51:37.763+00', '2026-10-12 18:51:37.763+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('b52a4631-6a44-4aa4-b7d5-7e117e18a682', 'Futebol', 'futebol', NULL, 'ball', '#1c5b54', '#081a18', NULL, 4, true, false, '2026-10-12 18:51:37.768+00', '2026-10-12 18:51:37.768+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('47c428df-8ebf-446c-a9b1-54597d2d3b71', 'Goleiro', 'goleiro', NULL, 'glove', '#6b1d2c', '#1d080c', NULL, 5, true, false, '2026-10-12 18:51:37.773+00', '2026-10-12 18:51:37.773+00');
INSERT INTO public.categories (id, name, slug, description, icon, color_from, color_to, image_path, sort_order, is_active, show_on_home, created_at, updated_at) VALUES ('0469a485-5ed4-48c8-9aaf-cf8d132970b6', 'Acessórios', 'acessorios', 'Treino e acessórios', 'dumbbell', '#44464d', '#121214', NULL, 6, true, true, '2026-10-12 18:51:37.778+00', '2026-10-12 18:51:37.778+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('5a5273d6-269b-4665-bcd5-9b43511e39b5', 1, 'Umbro Pro 5 Shark', 'umbro-pro-5-shark', 'Umbro', NULL, 'umbro pro 5 shark umbro chuteiras', 69990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, true, 1, '2026-10-12 18:51:37.79+00', '2026-10-12 18:51:37.79+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('471b412e-3d35-45bf-bf7f-75f320288ded', 2, 'Umbro Pro 5 Bump', 'umbro-pro-5-bump', 'Umbro', NULL, 'umbro pro 5 bump umbro chuteiras', 64990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 101, '2026-10-12 18:51:37.799+00', '2026-10-12 18:51:37.799+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('761e83e8-24e9-432b-ba91-516034ffaff5', 3, 'Umbro Attack Campo', 'umbro-attack-campo', 'Umbro', NULL, 'umbro attack campo umbro chuteiras', 27990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 102, '2026-10-12 18:51:37.805+00', '2026-10-12 18:51:37.805+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e2a43db1-26d7-443a-8560-636e82d2f286', 4, 'Joma Top-Flex', 'joma-top-flex', 'Joma', NULL, 'joma top-flex joma chuteiras', 74990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 103, '2026-10-12 18:51:37.811+00', '2026-10-12 18:51:37.811+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('92903bee-7557-4d21-acb5-a85214d71546', 5, 'Joma Top-Flex ACBF', 'joma-top-flex-acbf', 'Joma', NULL, 'joma top-flex acbf joma chuteiras', 67990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 104, '2026-10-12 18:51:37.818+00', '2026-10-12 18:51:37.818+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a506f4a2-7a57-41eb-9926-b9c88f7f06f2', 6, 'Joma Top-Flex', 'joma-top-flex-2', 'Joma', NULL, 'joma top-flex joma chuteiras', 64990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 105, '2026-10-12 18:51:37.824+00', '2026-10-12 18:51:37.824+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d30c216e-4c1a-476c-82f9-e8861fca631b', 7, 'Chuteira Futsal Nike Tiempo', 'chuteira-futsal-nike-tiempo', 'Nike', NULL, 'chuteira futsal nike tiempo nike chuteiras', 69990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 106, '2026-10-12 18:51:37.831+00', '2026-10-12 18:51:37.831+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a69ef8e9-2353-4d0f-890d-f9b6b330790e', 8, 'Chuteira Futsal Nike Zoom', 'chuteira-futsal-nike-zoom', 'Nike', NULL, 'chuteira futsal nike zoom nike chuteiras', 69990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 107, '2026-10-12 18:51:37.837+00', '2026-10-12 18:51:37.837+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('849b4252-c510-48e9-b702-d0b2c2a40b1a', 9, 'Chuteira Society Nike', 'chuteira-society-nike', 'Nike', NULL, 'chuteira society nike nike chuteiras', 29990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 108, '2026-10-12 18:51:37.843+00', '2026-10-12 18:51:37.843+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9b6efe32-e43a-4e83-a86e-ff7c8fd72d65', 10, 'Chuteira F50 Messi', 'chuteira-f50-messi', NULL, NULL, 'chuteira f50 messi chuteiras', 59900, 39990, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, true, 0, '2026-10-12 18:51:37.85+00', '2026-10-12 18:51:37.85+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('cd2de226-0db5-4b58-8962-d7cfc93e6f1f', 11, 'Chuteira Futsal Penalty', 'chuteira-futsal-penalty', 'Penalty', NULL, 'chuteira futsal penalty penalty chuteiras', 36990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 110, '2026-10-12 18:51:37.856+00', '2026-10-12 18:51:37.856+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('2d6dd671-fcf8-4adc-990a-48f0cab97661', 12, 'Chuteira Society Infantil Penalty', 'chuteira-society-infantil-penalty', 'Penalty', NULL, 'chuteira society infantil penalty penalty chuteiras', 14990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 111, '2026-10-12 18:51:37.862+00', '2026-10-12 18:51:37.862+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('c76861a3-51b4-4e0c-a1f6-e0d08d695b42', 13, 'Chuteira Campo Líder Infantil', 'chuteira-campo-lider-infantil', 'Líder', NULL, 'chuteira campo lider infantil lider chuteiras', 13990, NULL, '7f8ca9d0-2d3f-4309-9058-22ff66a1fe94', 10, 2, true, false, 112, '2026-10-12 18:51:37.867+00', '2026-10-12 18:51:37.867+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('11e1e57f-3882-4078-871b-e86e6228b825', 14, 'Nike Quest 6', 'nike-quest-6', 'Nike', NULL, 'nike quest 6 nike tenis', 59990, NULL, 'f84ff0c9-fb39-4113-86f9-0911400e0dc4', 10, 2, true, true, 3, '2026-10-12 18:51:37.874+00', '2026-10-12 18:51:37.874+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('2796032e-b048-4a20-862a-c1bde5a9915f', 15, 'Adidas Duramos SL 2', 'adidas-duramos-sl-2', 'Adidas', NULL, 'adidas duramos sl 2 adidas tenis', 49990, NULL, 'f84ff0c9-fb39-4113-86f9-0911400e0dc4', 10, 2, true, false, 114, '2026-10-12 18:51:37.88+00', '2026-10-12 18:51:37.88+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d5476c27-acfe-460b-9938-5d11390f93bb', 16, 'Adidas Latin Run 3.0', 'adidas-latin-run-3-0', 'Adidas', NULL, 'adidas latin run 3.0 adidas tenis', 44990, NULL, 'f84ff0c9-fb39-4113-86f9-0911400e0dc4', 10, 2, true, false, 115, '2026-10-12 18:51:37.886+00', '2026-10-12 18:51:37.886+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('890779e0-625c-43b4-8543-62a6fc9ba700', 17, 'Nike Revolution 8', 'nike-revolution-8', 'Nike', NULL, 'nike revolution 8 nike tenis', 39990, NULL, 'f84ff0c9-fb39-4113-86f9-0911400e0dc4', 10, 2, true, false, 116, '2026-10-12 18:51:37.893+00', '2026-10-12 18:51:37.893+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7d8412e7-9e0c-4525-b4fb-81a9b2d7fb58', 18, 'Nike Run Defy', 'nike-run-defy', 'Nike', NULL, 'nike run defy nike tenis', 34990, NULL, 'f84ff0c9-fb39-4113-86f9-0911400e0dc4', 10, 2, true, false, 117, '2026-10-12 18:51:37.898+00', '2026-10-12 18:51:37.898+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f857df37-ef68-4ad8-962b-14ce2bc6453b', 19, '100% Whey Max Titanium 900g', '100-whey-max-titanium-900g', 'Max Titanium', NULL, '100% whey max titanium 900g max titanium suplementos', 21990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, true, 2, '2026-10-12 18:51:37.904+00', '2026-10-12 18:51:37.904+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('72ab435c-42ac-4cfd-9018-db7d58672e22', 20, 'Whey Refil 100%', 'whey-refil-100', NULL, NULL, 'whey refil 100% suplementos', 18990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 119, '2026-10-12 18:51:37.91+00', '2026-10-12 18:51:37.91+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b803095e-b9f3-4ba6-a439-8a175861db3e', 21, 'Whey Refil W100 Nutrata 900g', 'whey-refil-w100-nutrata-900g', 'Nutrata', NULL, 'whey refil w100 nutrata 900g nutrata suplementos', 16990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 120, '2026-10-12 18:51:37.916+00', '2026-10-12 18:51:37.916+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('44e9b457-c4f6-4f28-922b-20b18a5d8a2a', 22, 'Pré-treino Hórus Elite 300g', 'pre-treino-horus-elite-300g', NULL, NULL, 'pre-treino horus elite 300g suplementos', 13990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 121, '2026-10-12 18:51:37.922+00', '2026-10-12 18:51:37.922+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('a1c39711-4759-401c-9369-f646836096f3', 23, 'Pré-treino Night Train 300g', 'pre-treino-night-train-300g', NULL, NULL, 'pre-treino night train 300g suplementos', 11990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 122, '2026-10-12 18:51:37.928+00', '2026-10-12 18:51:37.928+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f4cdce49-9c42-420d-8707-1f7ed51daded', 24, 'Pré-treino Horus 7Belo 300g', 'pre-treino-horus-7belo-300g', NULL, NULL, 'pre-treino horus 7belo 300g suplementos', 9990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 123, '2026-10-12 18:51:37.934+00', '2026-10-12 18:51:37.934+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('20109d16-ae8d-4acb-accf-350a2ba5b283', 25, 'Mass Titanium 17500', 'mass-titanium-17500', NULL, NULL, 'mass titanium 17500 suplementos', 12990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, true, 4, '2026-10-12 18:51:37.94+00', '2026-10-12 18:51:37.94+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('afb610e3-89be-49f4-94f5-8baa5e9e6046', 26, 'Massa Nitro Probiótica', 'massa-nitro-probiotica', NULL, NULL, 'massa nitro probiotica suplementos', 11990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 125, '2026-10-12 18:51:37.946+00', '2026-10-12 18:51:37.946+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7ae886f0-8fc0-447b-a70c-f67b944cc2d0', 27, 'Creatina Monohidratada 300g Hardcore', 'creatina-monohidratada-300g-hardcore', NULL, NULL, 'creatina monohidratada 300g hardcore suplementos', 7990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 126, '2026-10-12 18:51:37.952+00', '2026-10-12 18:51:37.952+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('dea5943c-05ab-4e7e-9ea7-560e5141ce2f', 28, 'Creatina Monohidratada 300g Max', 'creatina-monohidratada-300g-max', NULL, NULL, 'creatina monohidratada 300g max suplementos', 6990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 127, '2026-10-12 18:51:37.958+00', '2026-10-12 18:51:37.958+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('1db2adf6-f053-47f7-a238-5f857aa3919c', 29, 'Creatina Monohidratada 300g Nutrata', 'creatina-monohidratada-300g-nutrata', 'Nutrata', NULL, 'creatina monohidratada 300g nutrata nutrata suplementos', 5990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 128, '2026-10-12 18:51:37.964+00', '2026-10-12 18:51:37.964+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ee938483-48f3-49bf-bf2c-b5b1fc45f175', 30, 'Multi Max Complexo Vitamínico 90 cáps', 'multi-max-complexo-vitaminico-90-caps', NULL, NULL, 'multi max complexo vitaminico 90 caps suplementos', 6990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 129, '2026-10-12 18:51:37.97+00', '2026-10-12 18:51:37.97+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d09131c7-b16f-4abb-b44d-af59af8a3058', 31, 'Ômega 3 Nutrata 60 cáps', 'omega-3-nutrata-60-caps', 'Nutrata', NULL, 'omega 3 nutrata 60 caps nutrata suplementos', 4990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 130, '2026-10-12 18:51:37.976+00', '2026-10-12 18:51:37.976+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('910c3abd-949a-4640-9aae-9cf7a92d3a95', 32, 'Fire Black Max Titanium 60 cáps', 'fire-black-max-titanium-60-caps', 'Max Titanium', NULL, 'fire black max titanium 60 caps max titanium suplementos', 4990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 131, '2026-10-12 18:51:37.981+00', '2026-10-12 18:51:37.981+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b316c4e8-b33d-4474-99c6-194642592e9c', 33, 'Fire White Max Titanium', 'fire-white-max-titanium', 'Max Titanium', NULL, 'fire white max titanium max titanium suplementos', 3990, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 132, '2026-10-12 18:51:37.988+00', '2026-10-12 18:51:37.988+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b0c36aa6-be77-4f34-91dc-dd3304a99563', 34, 'Proto Bar Havana (unidade)', 'proto-bar-havana-unidade', NULL, NULL, 'proto bar havana (unidade) suplementos', 1600, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 133, '2026-10-12 18:51:37.994+00', '2026-10-12 18:51:37.994+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('33f0ece2-0afb-4e50-9aa4-ff3d52ee41d4', 35, 'Barra Protein Crisp (unidade)', 'barra-protein-crisp-unidade', NULL, NULL, 'barra protein crisp (unidade) suplementos', 1100, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 134, '2026-10-12 18:51:38+00', '2026-10-12 18:51:38+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('74b9a002-ff4f-4426-82b3-c4149b75264f', 36, 'Whey Grego Bar (unidade)', 'whey-grego-bar-unidade', NULL, NULL, 'whey grego bar (unidade) suplementos', 700, NULL, 'b8942444-2405-4e4a-ae97-f89ed872d6dd', 10, 2, true, false, 135, '2026-10-12 18:51:38.006+00', '2026-10-12 18:51:38.006+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('99d3d863-eb8d-4b49-b9b6-75da12dc66dc', 37, 'Jaqueta Feminina Poker', 'jaqueta-feminina-poker', 'Poker', NULL, 'jaqueta feminina poker poker roupas', 14990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 136, '2026-10-12 18:51:38.012+00', '2026-10-12 18:51:38.012+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('4bf736a6-79ce-4c34-8c7f-0d5e7ba0175b', 38, 'Corta Vento Feminino', 'corta-vento-feminino', NULL, NULL, 'corta vento feminino roupas', 10990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 137, '2026-10-12 18:51:38.02+00', '2026-10-12 18:51:38.02+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('20c47b4d-110b-4d67-90ce-e929bd0baeef', 39, 'Corta Vento Masculino', 'corta-vento-masculino', NULL, NULL, 'corta vento masculino roupas', 9990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 138, '2026-10-12 18:51:38.025+00', '2026-10-12 18:51:38.025+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ea2295fc-2667-45ff-bc9d-890e7fb49dcd', 40, 'Regata Poliamida Feminina', 'regata-poliamida-feminina', NULL, NULL, 'regata poliamida feminina roupas', 9990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 139, '2026-10-12 18:51:38.031+00', '2026-10-12 18:51:38.031+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('b45443e7-cc23-46db-a50a-e897a2b8ef0f', 41, 'Camisa Podium', 'camisa-podium', 'Podium', NULL, 'camisa podium podium roupas', 6990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 140, '2026-10-12 18:51:38.038+00', '2026-10-12 18:51:38.038+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('529ad251-8d2b-41bb-a79a-0bf443aad076', 42, 'Camisa Esportiva Feminina', 'camisa-esportiva-feminina', NULL, NULL, 'camisa esportiva feminina roupas', 5990, NULL, '137e05cf-6ba5-41d9-a558-b13dbb4896a8', 10, 2, true, false, 141, '2026-10-12 18:51:38.045+00', '2026-10-12 18:51:38.045+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('ca181795-79f2-431c-809c-b3583b6cb0ea', 43, 'Meia Antiderrapante (preta ou branca)', 'meia-antiderrapante-preta-ou-branca', NULL, NULL, 'meia antiderrapante (preta ou branca) futebol', 5990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 142, '2026-10-12 18:51:38.051+00', '2026-10-12 18:51:38.051+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('68d5462f-5e76-4d20-90d2-85d3a3b1ce68', 44, 'Meia Antiderrapante', 'meia-antiderrapante', NULL, NULL, 'meia antiderrapante futebol', 4990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 143, '2026-10-12 18:51:38.057+00', '2026-10-12 18:51:38.057+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('d064cf39-692f-484f-9128-1679a6957019', 45, 'Meião sem Pé', 'meiao-sem-pe', NULL, NULL, 'meiao sem pe futebol', 3990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 144, '2026-10-12 18:51:38.062+00', '2026-10-12 18:51:38.062+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('90d0e359-6e1e-497d-b41e-9385a381b092', 46, 'Meião Penalty', 'meiao-penalty', 'Penalty', NULL, 'meiao penalty penalty futebol', 2990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 145, '2026-10-12 18:51:38.068+00', '2026-10-12 18:51:38.068+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3be43071-9599-4540-be0b-3f40e24bb797', 47, 'Meia Futebol Training Infantil', 'meia-futebol-training-infantil', NULL, NULL, 'meia futebol training infantil futebol', 2990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 146, '2026-10-12 18:51:38.073+00', '2026-10-12 18:51:38.073+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('521c4618-cd5d-42be-b085-2aaec092bc8a', 48, 'Suporte de Caneleira', 'suporte-de-caneleira', NULL, NULL, 'suporte de caneleira futebol', 3490, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 147, '2026-10-12 18:51:38.079+00', '2026-10-12 18:51:38.079+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('69db05a1-02d1-43b4-9df2-9d0cf300e5d5', 49, 'Canelito Multi Esportivo', 'canelito-multi-esportivo', NULL, NULL, 'canelito multi esportivo futebol', 2990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 148, '2026-10-12 18:51:38.085+00', '2026-10-12 18:51:38.085+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('bf474741-7161-4b27-948a-0d1e2c3a6721', 50, 'Bomba de Inflar', 'bomba-de-inflar', NULL, NULL, 'bomba de inflar futebol', 3990, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 149, '2026-10-12 18:51:38.091+00', '2026-10-12 18:51:38.091+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('2bd63a82-31f9-436b-8374-d534f08a9a22', 51, 'Cartão Oficial para Juiz', 'cartao-oficial-para-juiz', NULL, NULL, 'cartao oficial para juiz futebol', 2000, NULL, 'b52a4631-6a44-4aa4-b7d5-7e117e18a682', 10, 2, true, false, 150, '2026-10-12 18:51:38.097+00', '2026-10-12 18:51:38.097+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('73fad44b-c733-4663-a787-86652154db0c', 52, 'Luva Profissional Basic', 'luva-profissional-basic', NULL, NULL, 'luva profissional basic goleiro', 19990, NULL, '47c428df-8ebf-446c-a9b1-54597d2d3b71', 10, 2, true, false, 151, '2026-10-12 18:51:38.103+00', '2026-10-12 18:51:38.103+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3518100d-04f5-4b3c-a3c5-bd0582a398ac', 53, 'Luva Training', 'luva-training', NULL, NULL, 'luva training goleiro', 11990, NULL, '47c428df-8ebf-446c-a9b1-54597d2d3b71', 10, 2, true, false, 152, '2026-10-12 18:51:38.109+00', '2026-10-12 18:51:38.109+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f9b3381e-4236-4cc6-a172-4a11f27ef4f1', 54, 'Luva Training Infantil', 'luva-training-infantil', NULL, NULL, 'luva training infantil goleiro', 9990, NULL, '47c428df-8ebf-446c-a9b1-54597d2d3b71', 10, 2, true, false, 153, '2026-10-12 18:51:38.115+00', '2026-10-12 18:51:38.115+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('3019453b-9e1e-47c6-ad87-157e18166cca', 55, 'Joelheira Profissional', 'joelheira-profissional', NULL, NULL, 'joelheira profissional acessorios', 12990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 154, '2026-10-12 18:51:38.121+00', '2026-10-12 18:51:38.121+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('e44dc2ba-2b6c-41df-af0e-b1afa28154ce', 56, 'Joelheira Profissional Infantil', 'joelheira-profissional-infantil', NULL, NULL, 'joelheira profissional infantil acessorios', 8990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 155, '2026-10-12 18:51:38.127+00', '2026-10-12 18:51:38.127+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('17e3f6ad-7b64-4222-af19-801d70b78c96', 57, 'Kit 3 Mini Band Poker', 'kit-3-mini-band-poker', 'Poker', NULL, 'kit 3 mini band poker poker acessorios', 5990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 156, '2026-10-12 18:51:38.134+00', '2026-10-12 18:51:38.134+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('9cfb29c4-708b-4f0b-ad0f-159c68dd8f78', 58, 'Braçadeira Porta Celular', 'bracadeira-porta-celular', NULL, NULL, 'bracadeira porta celular acessorios', 5990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 157, '2026-10-12 18:51:38.139+00', '2026-10-12 18:51:38.139+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('f656f755-3c19-48b6-8a46-8e2893ea6e51', 59, 'Hand Grip Poker', 'hand-grip-poker', 'Poker', NULL, 'hand grip poker poker acessorios', 5000, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 158, '2026-10-12 18:51:38.146+00', '2026-10-12 18:51:38.146+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('7b44747b-0aef-48a9-be13-75e2ae626737', 60, 'Galão Max Titanium 2,2L', 'galao-max-titanium-2-2l', 'Max Titanium', NULL, 'galao max titanium 2,2l max titanium acessorios', 4990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 159, '2026-10-12 18:51:38.153+00', '2026-10-12 18:51:38.153+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('dcc4a615-d98a-4ee9-ad4a-f15464ae9631', 61, 'Straps Musculação Poker', 'straps-musculacao-poker', 'Poker', NULL, 'straps musculacao poker poker acessorios', 3990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 160, '2026-10-12 18:51:38.16+00', '2026-10-12 18:51:38.16+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0810d157-c259-4661-bb7d-d92bbf6335a4', 62, 'Munhequeira Ajustável', 'munhequeira-ajustavel', NULL, NULL, 'munhequeira ajustavel acessorios', 3990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 161, '2026-10-12 18:51:38.168+00', '2026-10-12 18:51:38.168+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('0e5b191d-5a45-416a-a747-13a266813bdb', 63, 'Munhequeira Neoprene', 'munhequeira-neoprene', NULL, NULL, 'munhequeira neoprene acessorios', 3490, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 162, '2026-10-12 18:51:38.175+00', '2026-10-12 18:51:38.175+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('90f487f8-3122-4eae-9f2f-363ba2b6cb92', 64, 'Manguito Esportivo', 'manguito-esportivo', NULL, NULL, 'manguito esportivo acessorios', 2990, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 163, '2026-10-12 18:51:38.181+00', '2026-10-12 18:51:38.181+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('872ca487-5b95-495a-ba10-2cc99c4bf612', 65, 'Corda de Pular Poker', 'corda-de-pular-poker', 'Poker', NULL, 'corda de pular poker poker acessorios', 2900, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 164, '2026-10-12 18:51:38.187+00', '2026-10-12 18:51:38.187+00');
INSERT INTO public.products (id, legacy_id, name, slug, brand, description, search_text, price_cents, sale_price_cents, category_id, stock_quantity, min_stock, is_active, is_featured, sort_order, created_at, updated_at) VALUES ('699570e4-ac85-442d-9338-9b840d8be131', 66, 'Protetor Bucal Simples', 'protetor-bucal-simples', NULL, NULL, 'protetor bucal simples acessorios', 1490, NULL, '0469a485-5ed4-48c8-9aaf-cf8d132970b6', 10, 2, true, false, 165, '2026-10-12 18:51:38.193+00', '2026-10-12 18:51:38.193+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bdcfe1f5-7b75-441e-9407-c3be44a29053', '5a5273d6-269b-4665-bcd5-9b43511e39b5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.792+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('cef6bcb5-0bff-4aa2-9afa-053e72b066b8', '471b412e-3d35-45bf-bf7f-75f320288ded', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.801+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ebdc356c-3913-4c35-8809-f8c848fec04d', '761e83e8-24e9-432b-ba91-516034ffaff5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.806+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('66d070c9-c9db-4d11-a457-45ba0e4f8726', 'e2a43db1-26d7-443a-8560-636e82d2f286', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.813+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0bf8cb4b-6a1d-4be9-a655-725b4b7f8f3b', '92903bee-7557-4d21-acb5-a85214d71546', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.819+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9b8b747b-4bd7-404d-940b-a1cb96a58258', 'a506f4a2-7a57-41eb-9926-b9c88f7f06f2', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.826+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('a600975a-0c02-4dd8-a8cc-4043e513db35', 'd30c216e-4c1a-476c-82f9-e8861fca631b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.832+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('51955492-cc41-4912-be70-401865a7d23e', 'a69ef8e9-2353-4d0f-890d-f9b6b330790e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.839+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0838cd47-fc38-471d-b0ca-8fced292802d', '849b4252-c510-48e9-b702-d0b2c2a40b1a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.845+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c4081abf-1b4c-4983-8f0d-5bd619e158ad', '9b6efe32-e43a-4e83-a86e-ff7c8fd72d65', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.851+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d5178d63-9555-429e-87e3-307a5fe394ea', 'cd2de226-0db5-4b58-8962-d7cfc93e6f1f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.857+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('57138b39-3dca-4fb6-b1ee-4548da053b1e', '2d6dd671-fcf8-4adc-990a-48f0cab97661', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.863+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('31ad53e7-22c3-4832-9667-6bfa929b2263', 'c76861a3-51b4-4e0c-a1f6-e0d08d695b42', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.868+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3d67c405-f47d-40c6-93a8-e7d67a5b9d8b', '11e1e57f-3882-4078-871b-e86e6228b825', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.875+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('1b92281c-50ae-45a8-bacb-03bcfe583227', '2796032e-b048-4a20-862a-c1bde5a9915f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.881+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('170675ac-4196-49b7-838c-b645d8b16162', 'd5476c27-acfe-460b-9938-5d11390f93bb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.888+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('fb6de544-90d5-4b3b-b320-528efb4e7660', '890779e0-625c-43b4-8543-62a6fc9ba700', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.894+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('6d4721e2-dc14-48d7-9d12-93be6fb6ff8b', '7d8412e7-9e0c-4525-b4fb-81a9b2d7fb58', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.9+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('cf5139a7-c4c2-4f17-b096-635bf0d84b97', 'f857df37-ef68-4ad8-962b-14ce2bc6453b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.905+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('13e43858-5f35-4155-90d0-9f2bbfdc8015', '72ab435c-42ac-4cfd-9018-db7d58672e22', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.911+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0e8b812e-8a65-4212-9222-baa34ce66388', 'b803095e-b9f3-4ba6-a439-8a175861db3e', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.917+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('66b432f4-bbe9-4b06-a3fb-370cd8e9316d', '44e9b457-c4f6-4f28-922b-20b18a5d8a2a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.923+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f00a83b1-6edb-4270-8f7a-92b9a521e3d3', 'a1c39711-4759-401c-9369-f646836096f3', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.929+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('203f31d0-5827-4d33-b7fe-927237bcf499', 'f4cdce49-9c42-420d-8707-1f7ed51daded', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.935+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('661c5e04-5982-42c2-af8d-5acaea91a8ab', '20109d16-ae8d-4acb-accf-350a2ba5b283', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.942+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0d8e3a6a-c34f-47d7-952f-762537c26055', 'afb610e3-89be-49f4-94f5-8baa5e9e6046', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.948+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('848d1037-ebd4-47e7-b797-518383061276', '7ae886f0-8fc0-447b-a70c-f67b944cc2d0', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.953+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3d6b852d-9639-4d15-abaa-7a3bcc3c2066', 'dea5943c-05ab-4e7e-9ea7-560e5141ce2f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.959+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('5f7a33b6-b3a9-4663-a4e8-633a00f80f58', '1db2adf6-f053-47f7-a238-5f857aa3919c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.966+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b3194cb9-cf9c-4cf1-837b-17b8a0c82bec', 'ee938483-48f3-49bf-bf2c-b5b1fc45f175', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.971+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('3bd7aa9d-d503-4f6f-946b-4409d5312c99', 'd09131c7-b16f-4abb-b44d-af59af8a3058', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.977+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('12750af8-1681-45bc-be23-d3e5f6e03e4b', '910c3abd-949a-4640-9aae-9cf7a92d3a95', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.983+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('d4d1a64c-a508-4906-864a-6b898b9e15ad', 'b316c4e8-b33d-4474-99c6-194642592e9c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.989+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b26fdfc6-fbc0-4fd9-a719-87a112ce2f20', 'b0c36aa6-be77-4f34-91dc-dd3304a99563', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:37.995+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2ab5d3dc-3841-4072-9914-cea692a734f2', '33f0ece2-0afb-4e50-9aa4-ff3d52ee41d4', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.001+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('43674921-b308-4181-ba56-369909e982ee', '74b9a002-ff4f-4426-82b3-c4149b75264f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.007+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('725505ee-8763-4031-a507-8ca8e79cc4a4', '99d3d863-eb8d-4b49-b9b6-75da12dc66dc', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.013+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('01778ac1-1d20-4c2d-a2f9-3680f7de03ee', '4bf736a6-79ce-4c34-8c7f-0d5e7ba0175b', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.021+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('055dcacf-8751-43e6-b4ca-a803e6a6686e', '20c47b4d-110b-4d67-90ce-e929bd0baeef', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.027+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('e2d42eb4-cc8e-4cf6-9344-696fb93e397f', 'ea2295fc-2667-45ff-bc9d-890e7fb49dcd', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.032+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('170f9955-9eba-4b3a-a109-cd49538af4f1', 'b45443e7-cc23-46db-a50a-e897a2b8ef0f', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.039+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('14511237-6a69-4215-a894-0d1ff6a282ad', '529ad251-8d2b-41bb-a79a-0bf443aad076', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.046+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('fe9ff915-0220-4979-bd83-8c4c0f07e776', 'ca181795-79f2-431c-809c-b3583b6cb0ea', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.052+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('51c54e81-7c48-497c-9bcc-74ffe2616cf5', '68d5462f-5e76-4d20-90d2-85d3a3b1ce68', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.058+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0a717261-1914-4141-89f8-fd451854f395', 'd064cf39-692f-484f-9128-1679a6957019', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.063+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('40e5d891-dce7-451d-b85a-d197e8526bdc', '90d0e359-6e1e-497d-b41e-9385a381b092', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.069+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0014d427-0dc4-41ce-a2f2-1f9704fe0bd1', '3be43071-9599-4540-be0b-3f40e24bb797', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.074+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f9c5cc52-52b6-4e96-b22b-f3f3585e5180', '521c4618-cd5d-42be-b085-2aaec092bc8a', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.08+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('b08a0537-cadd-4f65-beef-0663b2588d24', '69db05a1-02d1-43b4-9df2-9d0cf300e5d5', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.087+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c4c3caf4-1ab3-4ad3-a85b-891238822a1d', 'bf474741-7161-4b27-948a-0d1e2c3a6721', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.093+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('41f6ce99-68b4-4180-ae9d-ddd30c2cd364', '2bd63a82-31f9-436b-8374-d534f08a9a22', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.099+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('f1e20b22-de49-40a4-a61c-a9dbbba0f823', '73fad44b-c733-4663-a787-86652154db0c', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.105+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('4732019f-5ec2-4280-85f9-0ca9b5360665', '3518100d-04f5-4b3c-a3c5-bd0582a398ac', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.11+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0f14d860-473b-4b05-9baa-2de05dda20c4', 'f9b3381e-4236-4cc6-a172-4a11f27ef4f1', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.116+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('2c0634fd-b7da-443c-8555-a55ec0b1adf6', '3019453b-9e1e-47c6-ad87-157e18166cca', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.122+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('ae831e99-2235-4783-9f33-8c87701aed2d', 'e44dc2ba-2b6c-41df-af0e-b1afa28154ce', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.129+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('0a900032-2cda-4a4b-b0b7-a5b45cedcfe0', '17e3f6ad-7b64-4222-af19-801d70b78c96', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.135+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('bd9ff560-3350-4940-8606-0252082153f1', '9cfb29c4-708b-4f0b-ad0f-159c68dd8f78', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.141+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('acda325d-e725-4786-b389-530feae4170f', 'f656f755-3c19-48b6-8a46-8e2893ea6e51', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.147+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('25cec1e6-f5e6-49c9-9549-10b626210cf9', '7b44747b-0aef-48a9-be13-75e2ae626737', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.155+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('17d859ff-ba6e-4d0a-8298-f85c0148534c', 'dcc4a615-d98a-4ee9-ad4a-f15464ae9631', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.162+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('53f93389-7c1e-478b-9b86-c9fe53d105e2', '0810d157-c259-4661-bb7d-d92bbf6335a4', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.17+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('9c0c1394-66c2-400f-9a33-4ed93f94eb7f', '0e5b191d-5a45-416a-a747-13a266813bdb', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.176+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('7bc28cac-1b47-493c-9967-6f442bdf1328', '90f487f8-3122-4eae-9f2f-363ba2b6cb92', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.182+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('8229ddc7-2b21-4869-b064-b446fa3254db', '872ca487-5b95-495a-ba10-2cc99c4bf612', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.188+00');
INSERT INTO public.inventory_movements (id, product_id, type, quantity, balance_before, balance_after, reason, order_id, profile_id, created_at) VALUES ('c7e709da-ccd6-4114-b7d3-26d8a6176e30', '699570e4-ac85-442d-9338-9b840d8be131', 'INITIAL', 10, 0, 10, 'Carga inicial da importação do catálogo — ajuste com a contagem real', NULL, NULL, '2026-10-12 18:51:38.195+00');
INSERT INTO public.store_settings (id, store_name, logo_path, whatsapp_number, phone_display, email, address, city, opening_hours, pickup_enabled, delivery_enabled, pickup_info, delivery_info, instagram_url, facebook_url, tiktok_url, whatsapp_greeting, order_message_intro, order_message_footer, hero_interval_seconds, pending_order_ttl_hours, timezone, content, updated_at) VALUES (1, 'Podium Sports', NULL, '554998090818', '(49) 99809-0818', NULL, NULL, 'Videira, SC', NULL, true, true, 'Retire na loja em Videira, SC.', 'Entrega em Videira e região — taxa combinada pelo WhatsApp.', NULL, NULL, NULL, 'Olá, Podium Sports! Vim pelo site.', 'Olá, Podium Sports! Quero fazer este pedido:', NULL, 6, 48, 'America/Sao_Paulo', '{"cta": {"text": "Chama a gente no WhatsApp que a gente te ajuda a escolher.", "title": "Dúvida no tamanho ou sabor?", "enabled": true, "buttonLabel": "Falar no WhatsApp →"}, "home": {"showOnSale": true, "showCatalog": true, "featuredTitle": "Destaques", "showCategories": true, "showNewArrivals": true}, "benefits": [{"icon": "whatsapp", "text": "Atendimento direto", "title": "Pedido no WhatsApp"}, {"icon": "truck", "text": "Videira e região", "title": "Retirada ou entrega"}, {"icon": "card", "text": "Combinado na conversa", "title": "Pix ou cartão"}, {"icon": "shield", "text": "Marcas de confiança", "title": "Produtos originais"}], "cartNote": "Tamanho, cor e sabor a gente confirma no WhatsApp.", "trustItems": [{"icon": "medal", "text": "Produtos selecionados", "title": "Qualidade"}, {"icon": "trophy", "text": "Aqui em Videira", "title": "Loja local"}, {"icon": "clock", "text": "Atendimento pelo Zap", "title": "Resposta rápida"}, {"icon": "diamond", "text": "Tudo em um só lugar", "title": "Do futsal à academia"}], "brandBanner": {"text": "Chuteiras de futsal, society e campo das marcas que você confia.", "title": "Entra em campo.", "brands": ["Nike", "Adidas", "Umbro", "Joma", "Penalty", "Poker"], "kicker": "Feito pra campeões", "enabled": true, "buttonUrl": "/produtos?categoria=chuteiras", "highlight": "Sobe no pódio.", "buttonLabel": "Ver chuteiras →"}, "footerAbout": "Loja de artigos esportivos, suplementação, tênis e moda fitness em Videira, SC.", "serviceNotes": ["Como comprar: monte a sacola e envie pelo WhatsApp", "Trocas: combine com a loja"], "topbarMessages": ["**PEDIDO PELO WHATSAPP** · rápido e fácil", "🏆 Artigos esportivos, suplementos, tênis e moda fitness"], "customerMessages": {"accepted": "Olá, {nome}! Seu pedido {pedido} foi aceito e já estamos separando tudo. Obrigado pela preferência!", "cancelled": "Olá, {nome}. Houve um cancelamento no pedido {pedido}. Entre em contato conosco caso precise de ajuda.", "completed": "Olá, {nome}! Seu pedido {pedido} foi concluído. Obrigado pela preferência!", "processing": "Olá, {nome}! Seu pedido {pedido} está em separação. Avisaremos assim que estiver pronto.", "readyPickup": "Olá, {nome}! Seu pedido {pedido} está pronto para retirada. Aguardamos você na loja!", "readyDelivery": "Olá, {nome}! Seu pedido {pedido} está pronto e logo sairá para entrega.", "outForDelivery": "Olá, {nome}! Seu pedido {pedido} saiu para entrega. Em breve ele chegará até você."}}', '2026-10-12 18:51:37.734+00');

COMMIT;
