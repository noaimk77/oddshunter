-- DropForeignKey
ALTER TABLE "LiveAlertDelivery" DROP CONSTRAINT IF EXISTS "LiveAlertDelivery_strategyId_fkey";

-- DropTable
DROP TABLE IF EXISTS "LiveAlertDelivery";

-- DropTable
DROP TABLE IF EXISTS "LiveAlertStrategy";
