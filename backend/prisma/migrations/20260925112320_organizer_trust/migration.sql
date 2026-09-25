-- CreateEnum
CREATE TYPE "OrganizerTrust" AS ENUM ('verified', 'restricted');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('fake', 'inappropriate', 'spam', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'upheld', 'dismissed');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "auto_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "report_hold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organizer_trust" "OrganizerTrust";

-- CreateTable
CREATE TABLE "tournament_reports" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "reporter_id" TEXT,
    "reason" "ReportReason" NOT NULL,
    "text" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_reports_status_idx" ON "tournament_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_reports_tournament_id_reporter_id_key" ON "tournament_reports"("tournament_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "tournament_reports" ADD CONSTRAINT "tournament_reports_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_reports" ADD CONSTRAINT "tournament_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_reports" ADD CONSTRAINT "tournament_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
