-- AlterTable
ALTER TABLE "ballots" ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "judge_notes" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "flow" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "judge_notes_debate_id_judge_id_key" ON "judge_notes"("debate_id", "judge_id");

-- AddForeignKey
ALTER TABLE "judge_notes" ADD CONSTRAINT "judge_notes_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_notes" ADD CONSTRAINT "judge_notes_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

