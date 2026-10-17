-- AlterTable
ALTER TABLE "judges" ADD COLUMN     "access_key" TEXT,
ADD COLUMN     "league" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "judges_access_key_key" ON "judges"("access_key");

