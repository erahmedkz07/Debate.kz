-- British Parliamentary: four teams per room
ALTER TYPE "Side" ADD VALUE 'closing_proposition';
ALTER TYPE "Side" ADD VALUE 'closing_opposition';

ALTER TABLE "debates" ADD COLUMN "closing_proposition_team_id" TEXT,
ADD COLUMN "closing_opposition_team_id" TEXT,
ADD COLUMN "ranking" "Side"[];

ALTER TABLE "ballots" ADD COLUMN "ranking" "Side"[];

ALTER TABLE "debates" ADD CONSTRAINT "debates_closing_proposition_team_id_fkey" FOREIGN KEY ("closing_proposition_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debates" ADD CONSTRAINT "debates_closing_opposition_team_id_fkey" FOREIGN KEY ("closing_opposition_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
