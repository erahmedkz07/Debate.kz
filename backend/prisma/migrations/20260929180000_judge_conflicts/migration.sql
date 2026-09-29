-- CreateTable
CREATE TABLE "judge_conflicts" (
    "judge_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,

    CONSTRAINT "judge_conflicts_pkey" PRIMARY KEY ("judge_id","team_id")
);

-- CreateIndex
CREATE INDEX "judge_conflicts_team_id_idx" ON "judge_conflicts"("team_id");

-- AddForeignKey
ALTER TABLE "judge_conflicts" ADD CONSTRAINT "judge_conflicts_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_conflicts" ADD CONSTRAINT "judge_conflicts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

