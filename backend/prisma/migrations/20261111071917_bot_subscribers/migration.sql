-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "subscribers_notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bot_subscribers" (
    "chat_id" TEXT NOT NULL,
    "city" TEXT,
    "level" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_subscribers_pkey" PRIMARY KEY ("chat_id")
);
