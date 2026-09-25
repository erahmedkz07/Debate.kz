-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('verify_email', 'reset_password');

-- AlterTable
ALTER TABLE "email_tokens" ADD COLUMN     "purpose" "TokenPurpose" NOT NULL DEFAULT 'verify_email';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMP(3);
