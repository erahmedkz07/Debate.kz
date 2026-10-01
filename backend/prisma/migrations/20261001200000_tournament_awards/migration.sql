-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "award" TEXT;

-- CreateTable
CREATE TABLE "tournament_awards" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "speaker_id" TEXT,
    "judge_id" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_awards_tournament_id_kind_key" ON "tournament_awards"("tournament_id", "kind");

-- AddForeignKey
ALTER TABLE "tournament_awards" ADD CONSTRAINT "tournament_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

