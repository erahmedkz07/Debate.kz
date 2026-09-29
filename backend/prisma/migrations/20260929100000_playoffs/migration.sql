-- CreateEnum
CREATE TYPE "RoundKind" AS ENUM ('preliminary', 'elimination');

-- AlterTable
ALTER TABLE "debates" ADD COLUMN     "bracket_slot" INTEGER;

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "kind" "RoundKind" NOT NULL DEFAULT 'preliminary',
ADD COLUMN     "teams_in_round" INTEGER;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "break_seed" INTEGER;

