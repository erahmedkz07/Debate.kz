-- CreateEnum
CREATE TYPE "TournamentKind" AS ENUM ('open', 'local');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "kind" "TournamentKind" NOT NULL DEFAULT 'local',
ADD COLUMN     "registration_url" TEXT;

-- CreateTable
CREATE TABLE "speaker_claims" (
    "id" TEXT NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "speaker_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "speaker_claims_status_idx" ON "speaker_claims"("status");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_claims_speaker_id_user_id_key" ON "speaker_claims"("speaker_id", "user_id");

-- AddForeignKey
ALTER TABLE "speaker_claims" ADD CONSTRAINT "speaker_claims_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_claims" ADD CONSTRAINT "speaker_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

