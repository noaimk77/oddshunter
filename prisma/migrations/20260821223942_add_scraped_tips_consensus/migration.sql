-- CreateTable
CREATE TABLE "ScrapedTip" (
    "id" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "sourceChatTitle" TEXT,
    "rawText" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "homeTeam" TEXT,
    "awayTeam" TEXT,
    "market" TEXT,
    "selection" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapedTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsensusAlert" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "groupCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsensusAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapedTip_fingerprint_detectedAt_idx" ON "ScrapedTip"("fingerprint", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsensusAlert_fingerprint_key" ON "ConsensusAlert"("fingerprint");
