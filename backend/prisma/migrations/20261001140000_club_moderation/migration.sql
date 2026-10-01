-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "moderation_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "status" "ClubStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "club_reports" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "club_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_reports_club_id_idx" ON "club_reports"("club_id");

-- AddForeignKey
ALTER TABLE "club_reports" ADD CONSTRAINT "club_reports_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_reports" ADD CONSTRAINT "club_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- clubs that already exist were created before moderation: they stay in the catalogue
UPDATE "clubs" SET "status" = 'approved', "reviewed_at" = CURRENT_TIMESTAMP;
