-- CreateTable
CREATE TABLE "ChatFixtureContext" (
    "sourceChatId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatFixtureContext_pkey" PRIMARY KEY ("sourceChatId")
);
