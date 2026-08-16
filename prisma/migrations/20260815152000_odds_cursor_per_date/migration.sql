-- Replace the single-date odds pagination cursor with a per-date JSON map,
-- since today's date shrinks in coverage all day as matches kick off while
-- tomorrow's stays fully pre-match.
ALTER TABLE "Provider" DROP COLUMN "lastOddsDate";
ALTER TABLE "Provider" DROP COLUMN "lastOddsPage";
ALTER TABLE "Provider" ADD COLUMN "oddsCursor" JSONB;
