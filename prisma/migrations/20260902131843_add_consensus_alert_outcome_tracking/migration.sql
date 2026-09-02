-- AlterTable
ALTER TABLE "ConsensusAlert" ADD COLUMN     "awayScore" INTEGER,
ADD COLUMN     "awayTeam" TEXT,
ADD COLUMN     "homeScore" INTEGER,
ADD COLUMN     "homeTeam" TEXT,
ADD COLUMN     "market" TEXT,
ADD COLUMN     "oddsAtAlert" DOUBLE PRECISION,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "selection" TEXT,
ADD COLUMN     "sentChatId" TEXT,
ADD COLUMN     "sentMessageId" BIGINT;

-- CreateIndex
CREATE INDEX "ConsensusAlert_outcome_sentAt_idx" ON "ConsensusAlert"("outcome", "sentAt");
