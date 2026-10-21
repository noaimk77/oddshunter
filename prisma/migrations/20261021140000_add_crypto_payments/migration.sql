-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_invoiceId_key" ON "CryptoPayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

