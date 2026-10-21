import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { STRATEGY_DEFS, getStrategyStreak, type StrategyName } from "../lib/strategyStats";
import { TARGET_LEAGUES } from "../lib/targetLeagues";
import {
  fetchStrategyLiveFixtures,
  fetchFixtureHTResult,
  isFixtureAtOrPastHT,
  type LiveFixtureState,
} from "./liveMatchMonitor";
import { fetchLiveOdds } from "./liveOdds";
import { deliverPick, postPickResult, type StrategyPickContext, type StrategyPickResultContext } from "../telegram/sendStrategyAlert";

/**
 * The InPlay-Alerts-style loop: for each live fixture in a target league,
 * check every strategy's trigger conditions, and fire an alert if all of
 * them are met. Separately, resolve every pending pick that has reached HT.
 *
 * Two passes per invocation, both cheap enough to run every worker cycle:
 *  - runLiveTriggerPass(): 1 batched fetch of every live fixture across
 *    target leagues, then 1 live-odds fetch per fixture that matched a
 *    trigger (usually 0-3 fixtures at any moment).
 *  - runHTResultPass(): iterates pending picks, fetches fixture status per
 *    pick that could plausibly be at HT (kickoff was ≥ 40 min ago),
 *    resolves and posts result.
 */

interface TriggerContext {
  strategyName: StrategyName;
  fixture: LiveFixtureState;
  liveOddsMarketName: string;
  liveOddsHandicap: string;
  liveOddsSelection: "Over" | "Under";
  /** Minimum sample size required in the league's historical StrategyStats. */
  minOccurrences: number;
  /** Minimum historical hit-rate (%) required to trigger. */
  minHitRatePct: number;
}

/** Per-strategy live-odds market/handicap mapping — the STRATEGY_DEFS entry
 *  (checkpointMinute, maxGoalsAtCheckpoint) already encodes the precondition
 *  shared with the historical stats calculation (strategyStats.ts); this
 *  table adds only what's specific to the LIVE side: which API-Football
 *  live-odds market/handicap/selection to fetch a price for. */
const LIVE_ODDS_SPEC: Record<StrategyName, { marketName: string; handicap: string; selection: "Over" | "Under" }> = {
  over_0_5_ht_by_league: { marketName: "Over/Under Line (1st Half)", handicap: "0.5", selection: "Over" },
  over_1_5_ht_by_league: { marketName: "Over/Under Line (1st Half)", handicap: "1.5", selection: "Over" },
};

/**
 * Which strategies fire on which live-fixture state. Reads the precondition
 * straight from STRATEGY_DEFS (checkpointMinute / maxGoalsAtCheckpoint) so
 * the live trigger and the historical hit-rate calculation in
 * strategyStats.ts can never silently diverge — there's exactly one
 * definition of "still in trigger state", not two hand-kept copies.
 *
 * `minOccurrences`/`minHitRatePct` stay loose gates here — the real value
 * filter is the `implied < historical` comparison in runLiveTriggerPass,
 * against the CONDITIONAL hit-rate (not a raw league average) since the
 * 2026-08-24 stats rework.
 */
function candidateTriggers(fixture: LiveFixtureState): TriggerContext[] {
  const triggers: TriggerContext[] = [];

  for (const strategyName of Object.keys(STRATEGY_DEFS) as StrategyName[]) {
    const def = STRATEGY_DEFS[strategyName];
    const totalGoals = fixture.homeGoals + fixture.awayGoals;
    if (fixture.minute > def.checkpointMinute) continue;
    if (totalGoals > def.maxGoalsAtCheckpoint) continue;

    const odds = LIVE_ODDS_SPEC[strategyName];
    triggers.push({
      strategyName,
      fixture,
      liveOddsMarketName: odds.marketName,
      liveOddsHandicap: odds.handicap,
      liveOddsSelection: odds.selection,
      minOccurrences: 50,
      minHitRatePct: 0, // the implied-vs-historical value gate does the real filtering
    });
  }

  return triggers;
}

export async function runLiveTriggerPass(db: PrismaClient, bot: Bot | null, apiKey: string): Promise<number> {
  const fixtures = await fetchStrategyLiveFixtures(apiKey);
  if (fixtures === null) return 0; // API blip — try again next cycle
  console.log(`[strategy] live fixtures in target leagues (strategy window): ${fixtures.length}`);
  if (fixtures.length === 0) return 0;

  let firedCount = 0;
  for (const fixture of fixtures) {
    const targetLeague = TARGET_LEAGUES.find((l) => l.leagueId === fixture.leagueId);
    if (!targetLeague) continue;

    const competition = await db.competition.findFirst({
      where: { externalId: String(fixture.leagueId), provider: { name: "api-football" } },
      select: { id: true, country: true, name: true },
    });
    if (!competition) {
      // League discovered live but never seeded — the seeder must have missed
      // it. Skip rather than fire an alert without a valid StrategyStats row.
      continue;
    }

    // Ensure an Event row exists for this live fixture so StrategyPick can
    // FK to it — the live monitor is our only touch point for these until
    // the outcome resolver eventually finishes them.
    const event = await db.event.upsert({
      where: { competitionId_externalId: { competitionId: competition.id, externalId: String(fixture.fixtureId) } },
      create: {
        competitionId: competition.id,
        externalId: String(fixture.fixtureId),
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        kickoff: fixture.kickoff,
        status: "live",
      },
      update: { status: "live", homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam },
    });

    for (const trigger of candidateTriggers(fixture)) {
      if (!(trigger.strategyName in STRATEGY_DEFS)) continue;
      const reason = (r: string) => `[strategy] skip ${trigger.strategyName} on ${fixture.homeTeam}: ${r}`;

      // Idempotency guard: never fire the same strategy twice on the same
      // event. The unique index on (strategyName, eventId) would catch a
      // race but the pre-check keeps the log clean.
      const existing = await db.strategyPick.findUnique({
        where: { strategyName_eventId: { strategyName: trigger.strategyName, eventId: event.id } },
      });
      if (existing) { console.log(reason("already fired")); continue; }

      const stats = await db.strategyStats.findUnique({
        where: { strategyName_competitionId: { strategyName: trigger.strategyName, competitionId: competition.id } },
      });
      if (!stats) { console.log(reason("no strategy stats for this league")); continue; }
      if (stats.occurrences < trigger.minOccurrences) { console.log(reason(`sample=${stats.occurrences} < ${trigger.minOccurrences}`)); continue; }
      if (stats.hitRatePct < trigger.minHitRatePct) { console.log(reason(`hitRate=${stats.hitRatePct.toFixed(1)}% < ${trigger.minHitRatePct}%`)); continue; }

      const oddsResult = await fetchLiveOdds(
        apiKey,
        fixture.fixtureId,
        trigger.liveOddsMarketName,
        trigger.liveOddsHandicap,
        trigger.liveOddsSelection,
      );
      if (!oddsResult) { console.log(reason("no live odds")); continue; }
      if (oddsResult.odds < stats.minOdds) { console.log(reason(`odds=${oddsResult.odds} < minOdds=${stats.minOdds}`)); continue; }
      // Value gate: bookmaker's implied probability must be under the
      // historical hit-rate — otherwise there's no "edge" to alert on.
      const impliedProbPct = (1 / oddsResult.odds) * 100;
      if (impliedProbPct >= stats.hitRatePct) { console.log(reason(`implied=${impliedProbPct.toFixed(1)}% >= hitRate=${stats.hitRatePct.toFixed(1)}%`)); continue; }

      const streak = await getStrategyStreak(db, trigger.strategyName, competition.id, 5);

      const pick = await db.strategyPick.create({
        data: {
          strategyName: trigger.strategyName,
          eventId: event.id,
          triggeredAtMinute: fixture.minute,
          triggeredAtScore: `${fixture.homeGoals}-${fixture.awayGoals}`,
          firstGoalMinute: fixture.firstGoalMinute,
          bookmakerOdds: oddsResult.odds,
          bookmakerName: oddsResult.bookmakerName,
          hitRateAtTrigger: stats.hitRatePct,
          occurrencesAtTrigger: stats.occurrences,
          historyStreak: streak.history,
          currentLosingStreak: streak.currentLosingStreak,
          strategyStatsId: stats.id,
        },
      });

      console.log(
        `[strategy] fired ${trigger.strategyName} on ${fixture.homeTeam} vs ${fixture.awayTeam} ` +
          `(${competition.country} - ${competition.name}) min=${fixture.minute} odds=${oddsResult.odds} ` +
          `hitRate=${stats.hitRatePct.toFixed(1)}% n=${stats.occurrences}`,
      );

      if (bot) {
        const ctx: StrategyPickContext = {
          id: pick.id,
          strategyName: trigger.strategyName,
          bookmakerOdds: oddsResult.odds,
          bookmakerName: oddsResult.bookmakerName,
          triggeredAtMinute: fixture.minute,
          triggeredAtScore: `${fixture.homeGoals}-${fixture.awayGoals}`,
          firstGoalMinute: fixture.firstGoalMinute,
          hitRateAtTrigger: stats.hitRatePct,
          occurrencesAtTrigger: stats.occurrences,
          historyStreak: streak.history,
          currentLosingStreak: streak.currentLosingStreak,
          event: {
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            kickoff: fixture.kickoff,
            status: "live",
            competition: { country: competition.country, name: competition.name },
          },
        };
        await deliverPick(db, bot, ctx);
      }
      firedCount++;
    }
  }
  return firedCount;
}

export async function runHTResultPass(db: PrismaClient, bot: Bot | null, apiKey: string): Promise<number> {
  const pending = await db.strategyPick.findMany({
    where: { resolvedAt: null },
    include: { event: { include: { competition: true } } },
  });
  if (pending.length === 0) return 0;

  let resolvedCount = 0;
  for (const pick of pending) {
    const kickoff = pick.event.kickoff.getTime();
    // Fetch fixture status only for picks whose match should plausibly have
    // reached HT (≥ 45 min after kickoff, with a small buffer for stoppage).
    if (Date.now() - kickoff < 45 * 60_000) continue;

    const fixtureId = Number.parseInt(pick.event.externalId, 10);
    if (!Number.isFinite(fixtureId)) continue;

    const result = await fetchFixtureHTResult(apiKey, fixtureId);
    if (!result) continue;
    if (!isFixtureAtOrPastHT(result.status)) continue;
    if (result.htHomeGoals === null || result.htAwayGoals === null) {
      // At HT but no score data — extremely rare, skip and retry next pass.
      continue;
    }

    const def = STRATEGY_DEFS[pick.strategyName as StrategyName];
    if (!def) continue;
    const hit = result.htHomeGoals + result.htAwayGoals >= def.htGoalsRequired;

    await db.strategyPick.update({
      where: { id: pick.id },
      data: {
        resolvedAt: new Date(),
        htHomeGoals: result.htHomeGoals,
        htAwayGoals: result.htAwayGoals,
        hit,
      },
    });

    console.log(
      `[strategy] resolved pick ${pick.id} ${pick.strategyName} ${pick.event.homeTeam} vs ${pick.event.awayTeam} ` +
        `HT ${result.htHomeGoals}-${result.htAwayGoals} → ${hit ? "WIN" : "LOSS"}`,
    );

    if (bot) {
      const ctx: StrategyPickResultContext = {
        id: pick.id,
        strategyName: pick.strategyName,
        bookmakerOdds: pick.bookmakerOdds,
        bookmakerName: pick.bookmakerName,
        triggeredAtMinute: pick.triggeredAtMinute,
        triggeredAtScore: pick.triggeredAtScore,
        firstGoalMinute: pick.firstGoalMinute ?? result.firstGoalMinute,
        hitRateAtTrigger: pick.hitRateAtTrigger,
        occurrencesAtTrigger: pick.occurrencesAtTrigger,
        historyStreak: pick.historyStreak,
        currentLosingStreak: pick.currentLosingStreak,
        htHomeGoals: result.htHomeGoals,
        htAwayGoals: result.htAwayGoals,
        hit,
        event: {
          homeTeam: pick.event.homeTeam,
          awayTeam: pick.event.awayTeam,
          kickoff: pick.event.kickoff,
          status: pick.event.status,
          competition: {
            country: pick.event.competition.country,
            name: pick.event.competition.name,
          },
        },
      };
      await postPickResult(db, bot, ctx);
    }
    resolvedCount++;
  }
  return resolvedCount;
}
