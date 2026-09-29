-- AlterTable
ALTER TABLE "debates" ADD COLUMN     "online_url" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "room_links" JSONB NOT NULL DEFAULT '{}';

