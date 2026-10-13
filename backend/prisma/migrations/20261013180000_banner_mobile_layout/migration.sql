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
