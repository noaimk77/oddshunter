-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "halftimeAwayScore" INTEGER,
ADD COLUMN     "halftimeHomeScore" INTEGER;

-- CreateTable
CREATE TABLE "SignalOutcome" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "finalHomeScore" INTEGER,
    "finalAwayScore" INTEGER,
    "selectionWon" BOOLEAN,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignalOutcome_signalId_key" ON "SignalOutcome"("signalId");

-- AddForeignKey
ALTER TABLE "SignalOutcome" ADD CONSTRAINT "SignalOutcome_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
