-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "checked_in_at" TIMESTAMP(3),
ADD COLUMN     "swing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "checkin_code" TEXT;

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "speaker_id" TEXT,
    "judge_id" TEXT,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "team_name" TEXT,
    "institution" TEXT,
    "team_place" INTEGER,
    "in_break" BOOLEAN NOT NULL DEFAULT false,
    "speaker_place" INTEGER,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_tournament_id_speaker_id_key" ON "certificates"("tournament_id", "speaker_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_tournament_id_judge_id_key" ON "certificates"("tournament_id", "judge_id");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
