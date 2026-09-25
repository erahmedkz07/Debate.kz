-- DropForeignKey
ALTER TABLE "judge_applications" DROP CONSTRAINT "judge_applications_tournament_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_applications" DROP CONSTRAINT "judge_applications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_calls" DROP CONSTRAINT "judge_calls_tournament_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_feedback" DROP CONSTRAINT "judge_feedback_debate_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_feedback" DROP CONSTRAINT "judge_feedback_from_user_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_feedback" DROP CONSTRAINT "judge_feedback_judge_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_feedback" DROP CONSTRAINT "judge_feedback_team_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_reviews" DROP CONSTRAINT "judge_reviews_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "judge_reviews" DROP CONSTRAINT "judge_reviews_judge_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_reports" DROP CONSTRAINT "tournament_reports_reporter_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_reports" DROP CONSTRAINT "tournament_reports_resolved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_reports" DROP CONSTRAINT "tournament_reports_tournament_id_fkey";

-- AlterTable
ALTER TABLE "tournaments" DROP COLUMN "auto_approved",
DROP COLUMN "report_hold";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "judge_level_min",
DROP COLUMN "organizer_trust";

-- DropTable
DROP TABLE "judge_applications";

-- DropTable
DROP TABLE "judge_calls";

-- DropTable
DROP TABLE "judge_feedback";

-- DropTable
DROP TABLE "judge_reviews";

-- DropTable
DROP TABLE "tournament_reports";

-- DropEnum
DROP TYPE "ApplicationStatus";

-- DropEnum
DROP TYPE "JudgeLevel";

-- DropEnum
DROP TYPE "OrganizerTrust";

-- DropEnum
DROP TYPE "ReportReason";

-- DropEnum
DROP TYPE "ReportStatus";

