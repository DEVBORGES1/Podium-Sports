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
