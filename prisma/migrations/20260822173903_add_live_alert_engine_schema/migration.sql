-- CreateTable
CREATE TABLE "LiveAlertStrategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leagueExternalId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "triggerCondition" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveAlertStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAlertDelivery" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "externalFixtureId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "minuteAtAlert" INTEGER NOT NULL,
    "liveOdds" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "messageRef" TEXT,

    CONSTRAINT "LiveAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveAlertStrategy_leagueExternalId_enabled_idx" ON "LiveAlertStrategy"("leagueExternalId", "enabled");

-- CreateIndex
CREATE INDEX "LiveAlertDelivery_strategyId_sentAt_idx" ON "LiveAlertDelivery"("strategyId", "sentAt");

-- CreateIndex
CREATE INDEX "LiveAlertDelivery_status_idx" ON "LiveAlertDelivery"("status");

-- AddForeignKey
ALTER TABLE "LiveAlertDelivery" ADD CONSTRAINT "LiveAlertDelivery_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "LiveAlertStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
