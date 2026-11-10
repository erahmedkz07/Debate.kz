-- CreateTable
CREATE TABLE "telegram_logins" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "user_id" TEXT,
    "user_agent" TEXT,
    "approved_at" TIMESTAMP(3),
    "denied_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_logins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_dialogs" (
    "chat_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_dialogs_pkey" PRIMARY KEY ("chat_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_logins_token_hash_key" ON "telegram_logins"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_logins_secret_hash_key" ON "telegram_logins"("secret_hash");

-- AddForeignKey
ALTER TABLE "telegram_logins" ADD CONSTRAINT "telegram_logins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
