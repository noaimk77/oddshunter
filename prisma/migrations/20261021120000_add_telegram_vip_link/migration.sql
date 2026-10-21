-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramInviteLink" TEXT,
ADD COLUMN     "telegramUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramInviteLink_key" ON "User"("telegramInviteLink");

