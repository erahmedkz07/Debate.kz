-- CreateEnum
CREATE TYPE "JudgeLevel" AS ENUM ('novice', 'judge', 'experienced', 'chief');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "judge_level_min" "JudgeLevel";

-- CreateTable
CREATE TABLE "judge_feedback" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "team_won" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_reviews" (
    "judge_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_reviews_pkey" PRIMARY KEY ("judge_id")
);

-- CreateIndex
CREATE INDEX "judge_feedback_judge_id_idx" ON "judge_feedback"("judge_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_feedback_debate_id_judge_id_team_id_key" ON "judge_feedback"("debate_id", "judge_id", "team_id");

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_reviews" ADD CONSTRAINT "judge_reviews_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_reviews" ADD CONSTRAINT "judge_reviews_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
