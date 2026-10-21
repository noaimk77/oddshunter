/**
 * League list the strategy engine covers. Each entry has an API-Football
 * league id (from GET /leagues?country=X) plus the country/name pair that
 * gets rendered in the alert line "🏆 Ligue : Country - League Name".
 *
 * Started as a 10-league MVP (2026-08-23) to prove the detection loop
 * end-to-end; expanded to ~44 (2026-08-24, Noaim: "augmente les ligues"
 * before adding new strategies) — every added entry was checked live via
 * GET /leagues?country=X for `coverage.fixtures.events: true` on BOTH the
 * 2024 and 2025 seasons, since the events endpoint (goal-minute timing,
 * needed for the conditional hit-rate calculation in strategyStats.ts) is
 * NOT guaranteed just because a league exists — Turkey U19 (removed
 * 2026-08-24) looked fine in /leagues?country= listings but had zero events
 * coverage at all, which would have silently produced empty stats forever.
 *
 * Deliberately still not "1000+ leagues" like InPlayGuru — each league adds
 * one seed pass (cheap, ~2 API calls) plus one goal-minute backfill call
 * PER historical fixture (300-800 calls/league) and a fixed slice of the
 * live-monitor's batched fixture list. Growth stays a conscious, budgeted
 * decision (checked against the Ultra plan's 75k req/day and 450 req/min
 * caps), not an unbounded scrape.
 *
 * Mix favors niche/lower-tier divisions (original brief: obscure leagues
 * draw less scrutiny) with a few recognizable top flights mixed in
 * (matches InPlay Alerts' own visible pattern of running Brazil Serie A
 * alongside far smaller leagues) — one or two entries per country rather
 * than every division API-Football tracks for it.
 */

export interface TargetLeague {
  leagueId: number;
  country: string;
  name: string;
  /** Seasons to seed for hit-rate computation — 2 years of history matches
   *  what InPlay Alerts appears to work with ("Occurrences combinaison: 161"
   *  for Over 0.5 HT in Costa Rica Segunda ≈ two seasons of matches). */
  seasons: number[];
}

export const TARGET_LEAGUES: TargetLeague[] = [
  { leagueId: 162, country: "Costa Rica", name: "Primera División", seasons: [2024, 2025] },
  { leagueId: 281, country: "Peru", name: "Primera División", seasons: [2024, 2025] },
  { leagueId: 242, country: "Ecuador", name: "Liga Pro", seasons: [2024, 2025] },
  { leagueId: 243, country: "Ecuador", name: "Liga Pro Serie B", seasons: [2024, 2025] },
  { leagueId: 344, country: "Bolivia", name: "Primera División", seasons: [2024, 2025] },
  { leagueId: 233, country: "Egypt", name: "Premier League", seasons: [2024, 2025] },
  { leagueId: 71, country: "Brazil", name: "Serie A", seasons: [2024, 2025] },
  { leagueId: 95, country: "Portugal", name: "Segunda Liga", seasons: [2024, 2025] },
  { leagueId: 865, country: "Portugal", name: "Liga 3", seasons: [2024, 2025] },
  // Turkey U19 League (id 1240) was here originally to mirror an InPlay
  // Alerts screenshot, but API-Football only has a 2026 season for it with
  // no events coverage at all (verified live 2026-08-24: `coverage.fixtures
  // .events: false`) — every historical seed AND the goal-minute backfill
  // would silently produce zero data forever. Swapped for Turkey 2. Lig
  // (second division, same country, confirmed events coverage for both
  // 2024 and 2025) so the "niche league" slot for Turkey stays filled with
  // something the pipeline can actually compute stats for.
  { leagueId: 205, country: "Turkey", name: "2. Lig", seasons: [2024, 2025] },

  // --- Expansion 2026-08-24: +34 leagues, one region at a time ---
  { leagueId: 186, country: "Algeria", name: "Ligue 1", seasons: [2024, 2025] },
  { leagueId: 419, country: "Azerbaijan", name: "Premyer Liqa", seasons: [2024, 2025] },
  { leagueId: 172, country: "Bulgaria", name: "First League", seasons: [2024, 2025] },
  { leagueId: 266, country: "Chile", name: "Primera B", seasons: [2024, 2025] },
  { leagueId: 240, country: "Colombia", name: "Primera B", seasons: [2024, 2025] },
  { leagueId: 211, country: "Croatia", name: "First NL", seasons: [2024, 2025] },
  { leagueId: 319, country: "Cyprus", name: "2. Division", seasons: [2024, 2025] },
  { leagueId: 328, country: "Estonia", name: "Esiliiga A", seasons: [2024, 2025] },
  { leagueId: 245, country: "Finland", name: "Ykkönen", seasons: [2024, 2025] },
  { leagueId: 339, country: "Guatemala", name: "Liga Nacional", seasons: [2024, 2025] },
  { leagueId: 234, country: "Honduras", name: "Liga Nacional", seasons: [2024, 2025] },
  { leagueId: 272, country: "Hungary", name: "NB II", seasons: [2024, 2025] },
  { leagueId: 165, country: "Iceland", name: "1. Deild", seasons: [2024, 2025] },
  { leagueId: 324, country: "India", name: "I-League", seasons: [2024, 2025] },
  { leagueId: 275, country: "Indonesia", name: "Liga 2", seasons: [2024, 2025] },
  { leagueId: 382, country: "Israel", name: "Liga Leumit", seasons: [2024, 2025] },
  { leagueId: 276, country: "Kenya", name: "FKF Premier League", seasons: [2024, 2025] },
  { leagueId: 365, country: "Latvia", name: "Virsliga", seasons: [2024, 2025] },
  { leagueId: 362, country: "Lithuania", name: "A Lyga", seasons: [2024, 2025] },
  { leagueId: 394, country: "Moldova", name: "Super Liga", seasons: [2024, 2025] },
  { leagueId: 201, country: "Morocco", name: "Botola 2", seasons: [2024, 2025] },
  { leagueId: 399, country: "Nigeria", name: "NPFL", seasons: [2024, 2025] },
  { leagueId: 104, country: "Norway", name: "1. Division", seasons: [2024, 2025] },
  { leagueId: 304, country: "Panama", name: "Liga Panameña de Fútbol", seasons: [2024, 2025] },
  { leagueId: 109, country: "Poland", name: "II Liga - East", seasons: [2024, 2025] },
  { leagueId: 284, country: "Romania", name: "Liga II", seasons: [2024, 2025] },
  { leagueId: 287, country: "Serbia", name: "Prva Liga", seasons: [2024, 2025] },
  { leagueId: 506, country: "Slovakia", name: "2. liga", seasons: [2024, 2025] },
  { leagueId: 374, country: "Slovenia", name: "2. SNL", seasons: [2024, 2025] },
  { leagueId: 289, country: "South Africa", name: "1st Division", seasons: [2024, 2025] },
  { leagueId: 297, country: "Thailand", name: "Thai League 2", seasons: [2024, 2025] },
  { leagueId: 828, country: "Tunisia", name: "Ligue 2", seasons: [2024, 2025] },
  { leagueId: 300, country: "Venezuela", name: "Segunda División", seasons: [2024, 2025] },
  { leagueId: 637, country: "Vietnam", name: "V.League 2", seasons: [2024, 2025] },
];
