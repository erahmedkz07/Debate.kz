-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('manual', 'first_come', 'lottery');

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'waitlisted';

-- AlterTable
ALTER TABLE "team_registrations" ADD COLUMN     "lottery_rank" INTEGER;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "club_quota" INTEGER,
ADD COLUMN     "lottery_at" TIMESTAMP(3),
ADD COLUMN     "selection_mode" "SelectionMode" NOT NULL DEFAULT 'manual';

