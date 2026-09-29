-- CreateTable
CREATE TABLE "judge_feedback" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "judge_feedback_judge_id_idx" ON "judge_feedback"("judge_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_feedback_debate_id_judge_id_user_id_key" ON "judge_feedback"("debate_id", "judge_id", "user_id");

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_feedback" ADD CONSTRAINT "judge_feedback_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

