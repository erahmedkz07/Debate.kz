-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('awaiting', 'pending', 'confirmed', 'rejected');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'awaiting',
    "payer_note" TEXT,
    "admin_note" TEXT,
    "paid_at" TIMESTAMP(3),
    "handled_by_id" TEXT,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "pro_price" INTEGER NOT NULL DEFAULT 20000,
    "kaspi_recipient" TEXT,
    "kaspi_phone" TEXT,
    "kaspi_qr_url" TEXT,
    "payment_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_tournament_id_idx" ON "payments"("tournament_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The free limit grows from 12 to 20 teams: tournaments of 13-20 teams are free again
UPDATE "tournaments" SET "plan" = 'free', "paid" = true WHERE "plan" = 'pro' AND "max_teams" <= 20;
