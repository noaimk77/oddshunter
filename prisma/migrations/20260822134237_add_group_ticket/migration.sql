-- CreateTable
CREATE TABLE "GroupTicket" (
    "id" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "sourceChatTitle" TEXT,
    "source" TEXT NOT NULL DEFAULT 'TEXT',
    "rawText" TEXT NOT NULL,
    "homeTeam" TEXT,
    "awayTeam" TEXT,
    "market" TEXT,
    "selection" TEXT,
    "odds" DOUBLE PRECISION,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTicket_sourceChatId_detectedAt_idx" ON "GroupTicket"("sourceChatId", "detectedAt");
