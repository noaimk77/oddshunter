-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "lastOddsDate" TEXT,
ADD COLUMN     "lastOddsPage" INTEGER NOT NULL DEFAULT 0;
