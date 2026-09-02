import type { PrismaClient } from "@/generated/prisma/client";
import type { Fixture } from "./tipParser";

export async function rememberFixture(db: PrismaClient, sourceChatId: string, fixture: Fixture): Promise<void> {
  await db.chatFixtureContext.upsert({
    where: { sourceChatId },
    create: { sourceChatId, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam },
    update: { homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam },
  });
}

export async function recallFixture(db: PrismaClient, sourceChatId: string, maxAgeMinutes: number): Promise<Fixture | null> {
  const context = await db.chatFixtureContext.findUnique({ where: { sourceChatId } });
  if (!context) return null;
  const ageMs = Date.now() - context.updatedAt.getTime();
  if (ageMs > maxAgeMinutes * 60_000) return null;
  return { homeTeam: context.homeTeam, awayTeam: context.awayTeam };
}

/**
 * `recallFixture`'s "last match this chat talked about" model assumes one
 * chat = one match per hour — true for a slow tipster posting a photo then a
 * one-word pick, false for a live-odds firehose channel that cycles through
 * many unrelated matches (tennis, esports, football...) within minutes of
 * each other. For those, falling back to "whatever this chat mentioned last"
 * silently re-tags an unrelated message with the wrong fixture (confirmed
 * 2026-08-30: a tennis in-play bet from "Fix is fix tchat" got mislabeled as
 * a "SAW Youngsters vs Noir Verse" pick this way, turning a single genuine
 * tip into a fake 2-group consensus).
 *
 * Detects this by counting distinct fixtures the chat has actually produced
 * a *deterministically/LLM-identified* fixture for within the window — a
 * real single-match tipster stays at 1, a firehose channel blows past the
 * threshold fast. No schema change needed: `ScrapedTip` already carries
 * sourceChatId + homeTeam/awayTeam + detectedAt.
 */
export async function isFirehoseChat(
  db: PrismaClient,
  sourceChatId: string,
  windowMinutes: number,
  distinctFixtureThreshold = 3,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const recent = await db.scrapedTip.findMany({
    where: { sourceChatId, detectedAt: { gte: since }, homeTeam: { not: null }, awayTeam: { not: null } },
    select: { homeTeam: true, awayTeam: true },
  });
  const distinctFixtures = new Set(recent.map((r) => `${r.homeTeam}|${r.awayTeam}`));
  return distinctFixtures.size >= distinctFixtureThreshold;
}
