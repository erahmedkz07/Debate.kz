-- AlterTable
ALTER TABLE "speakers" ADD COLUMN     "access_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "speakers_access_key_key" ON "speakers"("access_key");

