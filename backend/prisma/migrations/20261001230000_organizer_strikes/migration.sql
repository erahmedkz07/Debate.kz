-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "abandoned_at" TIMESTAMP(3),
ADD COLUMN     "finish_reminders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminded_motions_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "organizer_strikes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tournament_id" TEXT,
    "tournament_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_at" TIMESTAMP(3),
    "lifted_note" TEXT,

    CONSTRAINT "organizer_strikes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizer_strikes_user_id_idx" ON "organizer_strikes"("user_id");

-- AddForeignKey
ALTER TABLE "organizer_strikes" ADD CONSTRAINT "organizer_strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

