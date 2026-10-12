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
