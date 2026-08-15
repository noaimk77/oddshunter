-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "requestsDate" TEXT,
ADD COLUMN     "requestsToday" INTEGER NOT NULL DEFAULT 0;
