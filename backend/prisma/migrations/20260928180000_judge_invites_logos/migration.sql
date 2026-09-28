-- AlterTable
ALTER TABLE "club_teams" ADD COLUMN     "logo_url" TEXT;

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "logo_url" TEXT;

-- AlterTable
ALTER TABLE "tournament_invites" ADD COLUMN     "judge_id" TEXT;

-- AddForeignKey
ALTER TABLE "tournament_invites" ADD CONSTRAINT "tournament_invites_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

