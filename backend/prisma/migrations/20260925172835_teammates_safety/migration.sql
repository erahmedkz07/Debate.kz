-- AlterTable
ALTER TABLE "users" ADD COLUMN     "safeguarding_officer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "teammate_posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "level" "TournamentLevel" NOT NULL,
    "languages" TEXT[],
    "text" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teammate_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teammate_replies" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teammate_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "about" TEXT,
    "place" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution_note" TEXT,
    "handled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teammate_posts_closed_expires_at_idx" ON "teammate_posts"("closed", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "teammate_replies_post_id_user_id_key" ON "teammate_replies"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "safety_reports_status_created_at_idx" ON "safety_reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "teammate_posts" ADD CONSTRAINT "teammate_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammate_replies" ADD CONSTRAINT "teammate_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "teammate_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammate_replies" ADD CONSTRAINT "teammate_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
