-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "league" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "leagues" JSONB NOT NULL DEFAULT '[]';

