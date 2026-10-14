-- Variações com estoque próprio (tamanho, sabor…), versões leves das fotos e subcategorias.
-- Migração aditiva: produtos sem variações, fotos sem miniatura e categorias sem mãe continuam
-- funcionando exatamente como antes.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "parent_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "variant_type" VARCHAR(30);

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "medium_path" VARCHAR(300),
ADD COLUMN     "thumb_path" VARCHAR(300);

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "variant_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variant_id" UUID,
ADD COLUMN     "variant_label" VARCHAR(80);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_product_id_sort_order_idx" ON "product_variants"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_label_key" ON "product_variants"("product_id", "label");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridade
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_stock_non_negative" CHECK ("stock_quantity" >= 0),
  ADD CONSTRAINT "product_variants_label_not_blank" CHECK (length(btrim("label")) > 0);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- RLS / privilégios: mesmo padrão das demais tabelas (somente a API acessa).
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.product_variants FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.product_variants FROM authenticated;
  END IF;
END $$;
