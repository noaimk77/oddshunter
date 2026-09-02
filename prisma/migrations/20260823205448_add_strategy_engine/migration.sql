-- CreateTable
CREATE TABLE "StrategyStats" (
    "id" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "seasons" JSONB NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "hits" INTEGER NOT NULL,
    "hitRatePct" DOUBLE PRECISION NOT NULL,
    "minOdds" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPick" (
    "id" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredAtMinute" INTEGER NOT NULL,
    "triggeredAtScore" TEXT NOT NULL,
    "firstGoalMinute" INTEGER,
    "bookmakerOdds" DOUBLE PRECISION NOT NULL,
    "bookmakerName" TEXT,
    "hitRateAtTrigger" DOUBLE PRECISION NOT NULL,
    "occurrencesAtTrigger" INTEGER NOT NULL,
    "historyStreak" TEXT NOT NULL,
    "currentLosingStreak" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "htHomeGoals" INTEGER,
    "htAwayGoals" INTEGER,
    "hit" BOOLEAN,
    "strategyStatsId" TEXT,

    CONSTRAINT "StrategyPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPickDelivery" (
    "id" TEXT NOT NULL,
    "strategyPickId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageRef" TEXT,
    "resultPosted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StrategyPickDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyStats_strategyName_hitRatePct_idx" ON "StrategyStats"("strategyName", "hitRatePct");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyStats_strategyName_competitionId_key" ON "StrategyStats"("strategyName", "competitionId");

-- CreateIndex
CREATE INDEX "StrategyPick_resolvedAt_idx" ON "StrategyPick"("resolvedAt");

-- CreateIndex
CREATE INDEX "StrategyPick_strategyName_triggeredAt_idx" ON "StrategyPick"("strategyName", "triggeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPick_strategyName_eventId_key" ON "StrategyPick"("strategyName", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPickDelivery_strategyPickId_userId_channel_key" ON "StrategyPickDelivery"("strategyPickId", "userId", "channel");

-- AddForeignKey
ALTER TABLE "StrategyStats" ADD CONSTRAINT "StrategyStats_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPick" ADD CONSTRAINT "StrategyPick_strategyStatsId_fkey" FOREIGN KEY ("strategyStatsId") REFERENCES "StrategyStats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPick" ADD CONSTRAINT "StrategyPick_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPickDelivery" ADD CONSTRAINT "StrategyPickDelivery_strategyPickId_fkey" FOREIGN KEY ("strategyPickId") REFERENCES "StrategyPick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPickDelivery" ADD CONSTRAINT "StrategyPickDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
