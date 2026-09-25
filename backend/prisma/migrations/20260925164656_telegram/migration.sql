-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'telegram_link';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_verified_at" TIMESTAMP(3),
ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_notify" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "telegram_username" TEXT,
ADD COLUMN     "verified_phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_verified_phone_key" ON "users"("verified_phone");

