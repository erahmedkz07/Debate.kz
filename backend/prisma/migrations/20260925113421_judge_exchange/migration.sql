-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- CreateTable
CREATE TABLE "judge_calls" (
    "tournament_id" TEXT NOT NULL,
    "needed" INTEGER NOT NULL,
    "min_level" "JudgeLevel" NOT NULL DEFAULT 'novice',
    "message" TEXT,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_calls_pkey" PRIMARY KEY ("tournament_id")
);

-- CreateTable
CREATE TABLE "judge_applications" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "judge_applications_user_id_idx" ON "judge_applications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_applications_tournament_id_user_id_key" ON "judge_applications"("tournament_id", "user_id");

-- AddForeignKey
ALTER TABLE "judge_calls" ADD CONSTRAINT "judge_calls_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_applications" ADD CONSTRAINT "judge_applications_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "judge_calls"("tournament_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_applications" ADD CONSTRAINT "judge_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
