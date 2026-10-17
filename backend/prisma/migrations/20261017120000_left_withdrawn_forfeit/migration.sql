-- AlterTable
ALTER TABLE "debates" ADD COLUMN     "forfeit" TEXT;

-- AlterTable
ALTER TABLE "judges" ADD COLUMN     "left_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "withdrawn_at" TIMESTAMP(3);

