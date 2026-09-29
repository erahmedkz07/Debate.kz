-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "break_category" TEXT,
ADD COLUMN     "category_place" INTEGER;

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "break_category" TEXT,
ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "break_categories" JSONB NOT NULL DEFAULT '[]';

