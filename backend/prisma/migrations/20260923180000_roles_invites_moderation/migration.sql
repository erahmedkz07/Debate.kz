-- CreateEnum
CREATE TYPE "OrganizerRole" AS ENUM ('owner', 'co_organizer');

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('judge', 'co_organizer');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('user', 'admin');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
-- data migration: organizer/judge/participant become plain users; admins stay admins
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'admin' THEN 'admin' ELSE 'user' END)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
COMMIT;

-- AlterTable
ALTER TABLE "tournament_organizers" ADD COLUMN     "role" "OrganizerRole" NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "moderation" "ModerationStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "moderation_note" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "consent_at" TIMESTAMP(3),
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ALTER COLUMN "role" SET DEFAULT 'user';

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_invites" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "kind" "InviteKind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "used_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_idx" ON "email_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_invites_token_hash_key" ON "tournament_invites"("token_hash");

-- CreateIndex
CREATE INDEX "tournament_invites_tournament_id_idx" ON "tournament_invites"("tournament_id");

-- CreateIndex
CREATE INDEX "tournaments_moderation_idx" ON "tournaments"("moderation");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_invites" ADD CONSTRAINT "tournament_invites_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_invites" ADD CONSTRAINT "tournament_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_invites" ADD CONSTRAINT "tournament_invites_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- data migration: tournaments that already existed were public before moderation existed
UPDATE "tournaments" SET "moderation" = 'approved';

-- data migration: accounts created before email verification existed are treated as verified
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
