-- Foto opcional exclusiva para o celular no banner. Migração aditiva: banners existentes
-- ficam com as colunas nulas e continuam usando a foto principal em todos os dispositivos.

-- AlterTable
ALTER TABLE "banners"
  ADD COLUMN "mobile_image_path" VARCHAR(300),
  ADD COLUMN "mobile_image_bg" VARCHAR(7);

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_mobile_image_bg_hex" CHECK ("mobile_image_bg" IS NULL OR "mobile_image_bg" ~ '^#[0-9a-fA-F]{6}$');
