-- AlterTable
ALTER TABLE "tournament_reviews" ADD COLUMN     "replied_at" TIMESTAMP(3),
ADD COLUMN     "reply" TEXT,
ADD COLUMN     "reply_by" TEXT;

