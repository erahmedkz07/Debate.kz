-- Closed (silent) rounds move from "the last N rounds of the tournament" to a switch on each round
ALTER TABLE "rounds" ADD COLUMN "silent" BOOLEAN NOT NULL DEFAULT false;

-- keep what organizers already chose: the last N preliminary rounds become closed rounds
UPDATE "rounds" r SET "silent" = true
FROM "tournaments" t
WHERE r."tournament_id" = t."id" AND t."silent_rounds" > 0 AND r."kind" = 'preliminary'
  AND r."number" > (SELECT MAX(p."number") FROM "rounds" p WHERE p."tournament_id" = t."id" AND p."kind" = 'preliminary') - t."silent_rounds";

ALTER TABLE "tournaments" DROP COLUMN "silent_rounds";
