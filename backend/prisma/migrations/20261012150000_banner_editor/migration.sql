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
