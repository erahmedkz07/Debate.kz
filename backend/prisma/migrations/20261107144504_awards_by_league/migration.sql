-- DropIndex
DROP INDEX "tournament_awards_tournament_id_kind_key";

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "league" TEXT;

-- AlterTable
ALTER TABLE "tournament_awards" ADD COLUMN     "league" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tournament_awards_tournament_id_kind_league_key" ON "tournament_awards"("tournament_id", "kind", "league");

