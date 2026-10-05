-- CreateTable
CREATE TABLE "speaker_invites" (
    "id" TEXT NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaker_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "speaker_invites_token_hash_key" ON "speaker_invites"("token_hash");

-- CreateIndex
CREATE INDEX "speaker_invites_speaker_id_idx" ON "speaker_invites"("speaker_id");

-- AddForeignKey
ALTER TABLE "speaker_invites" ADD CONSTRAINT "speaker_invites_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

