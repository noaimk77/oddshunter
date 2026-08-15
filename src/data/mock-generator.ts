import { buildFixtureSeeds, LEAGUE_POOLS, type FixtureSeed, type LeaguePool } from "./fixtures";
import { seededRandom, randRange, weightedPick } from "./rng";
import { formatCurrency } from "@/lib/format";
import { signalFromScore } from "@/lib/signal";
import type {
  Alert,
  AlertTrigger,
  AnalyticsSummary,
  AnomalyMetrics,
  AnomalyReason,
  Competition,
  Event,
  Liquidity,
  LiquidityMetrics,
  Market,
  MarketActivityPoint,
  MarketPulseBucket,
  MarketRow,
  MarketTimelineEvent,
  MarketType,
  OddsSnapshot,
  OverviewKpis,
  Runner,
  RunnerPosition,
  SignalLevel,
  VolumeSnapshot,
} from "@/types";

/**
 * Reference "now" for the demo dataset — fixed for the lifetime of this
 * server process (not per-request) so every page reads a consistent
 * dataset, but anchored to when the process actually started rather than
 * a hardcoded calendar date. A literal past date here would silently drift:
 * events seeded as "a few minutes before MOCK_NOW" would read as "just
 * now" only on the day that date fell on, then as stale multi-day-old
 * activity on every day after — exactly the kind of fabricated freshness
 * this app is required to never show.
 */
export const MOCK_NOW = Date.now();

const round2 = (n: number) => Math.round(n * 100) / 100;

interface ScoreProfile {
  level: SignalLevel;
  scoreRange: [number, number];
  oddsDropRange: [number, number];
  volumeAccelRange: [number, number];
  concentrationRange: [number, number];
  liquidity: [Liquidity, number][];
  baseVolumeRange: [number, number];
}

const PROFILES: Record<SignalLevel, ScoreProfile> = {
  normal: {
    level: "normal",
    scoreRange: [4, 24],
    oddsDropRange: [0.2, 4],
    volumeAccelRange: [-10, 25],
    concentrationRange: [34, 46],
    liquidity: [["high", 6], ["medium", 3], ["low", 1]],
    baseVolumeRange: [1200, 6500],
  },
  watch: {
    level: "watch",
    scoreRange: [25, 49],
    oddsDropRange: [3, 8],
    volumeAccelRange: [15, 60],
    concentrationRange: [42, 54],
    liquidity: [["high", 3], ["medium", 5], ["low", 2]],
    baseVolumeRange: [2200, 9500],
  },
  elevated: {
    level: "elevated",
    scoreRange: [50, 74],
    oddsDropRange: [7, 14],
    volumeAccelRange: [45, 130],
    concentrationRange: [50, 63],
    liquidity: [["medium", 5], ["low", 4], ["high", 1]],
    baseVolumeRange: [5000, 19000],
  },
  high: {
    level: "high",
    scoreRange: [75, 92],
    oddsDropRange: [13, 24],
    volumeAccelRange: [110, 260],
    concentrationRange: [60, 74],
    liquidity: [["low", 6], ["medium", 3]],
    baseVolumeRange: [14000, 46000],
  },
  extreme: {
    level: "extreme",
    scoreRange: [93, 99],
    oddsDropRange: [22, 34],
    volumeAccelRange: [230, 420],
    concentrationRange: [70, 86],
    liquidity: [["low", 8], ["medium", 1]],
    baseVolumeRange: [30000, 72000],
  },
};

const PROFILE_WEIGHTS: [ScoreProfile, number][] = [
  [PROFILES.normal, 52],
  [PROFILES.watch, 22],
  [PROFILES.elevated, 15],
  [PROFILES.high, 9],
  [PROFILES.extreme, 2],
];

const ODDS_DROP_LABELS: Record<SignalLevel, string> = {
  normal: "Within range",
  watch: "Mild",
  elevated: "Notable",
  high: "Unusual",
  extreme: "Very unusual",
};
const VOLUME_ACCEL_LABELS: Record<SignalLevel, string> = {
  normal: "Stable",
  watch: "Above average",
  elevated: "Accelerating",
  high: "High",
  extreme: "Extreme",
};
const RECENT_VOLUME_LABELS: Record<SignalLevel, string> = {
  normal: "Low",
  watch: "Moderate",
  elevated: "Elevated",
  high: "High",
  extreme: "Extreme",
};
const CONCENTRATION_LABELS: Record<SignalLevel, string> = {
  normal: "Balanced",
  watch: "Leaning",
  elevated: "Notable",
  high: "High",
  extreme: "Extreme",
};
const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  low: "Elevated risk",
  medium: "Moderate depth",
  high: "Deep market",
};
const LIQUIDITY_SEVERITY: Record<Liquidity, SignalLevel> = {
  low: "high",
  medium: "watch",
  high: "normal",
};

function tierFor(value: number, thresholds: [number, SignalLevel][]): SignalLevel {
  let level: SignalLevel = "normal";
  for (const [threshold, lvl] of thresholds) {
    if (value >= threshold) level = lvl;
  }
  return level;
}

interface RunnerSpec {
  id: string;
  name: string;
  position: RunnerPosition;
}

function buildMatchOddsRunners(marketId: string, home: string, away: string, hasDraw: boolean): RunnerSpec[] {
  const runners: RunnerSpec[] = [{ id: `${marketId}-home`, name: home, position: "home" }];
  if (hasDraw) runners.push({ id: `${marketId}-draw`, name: "Draw", position: "draw" });
  runners.push({ id: `${marketId}-away`, name: away, position: "away" });
  return runners;
}

function buildOverUnderRunners(marketId: string): RunnerSpec[] {
  return [
    { id: `${marketId}-over`, name: "Over 2.5", position: "over" },
    { id: `${marketId}-under`, name: "Under 2.5", position: "under" },
  ];
}

interface GeneratedMetrics {
  score: number;
  oddsDropPct: number;
  volumeAccelPct: number;
  concentrationPct: number;
  liquidity: Liquidity;
  matchedVolume: number;
  volumeDelta15m: number;
  favoritePosition: RunnerPosition;
}

/** Exact figures called out in the product brief for the three flagship examples. */
const FLAGSHIP_OVERRIDES: Record<
  string,
  Partial<GeneratedMetrics> & { openingFavorite: number; currentFavorite: number }
> = {
  "vantera-li-0": {
    score: 91,
    oddsDropPct: 26,
    volumeAccelPct: 312,
    concentrationPct: 72,
    liquidity: "low",
    matchedVolume: 37420,
    volumeDelta15m: 18240,
    favoritePosition: "home",
    openingFavorite: 2.46,
    currentFavorite: 1.82,
  },
  "aurelia-2d-0": {
    score: 87,
    oddsDropPct: 21.9,
    volumeAccelPct: 245,
    concentrationPct: 68,
    liquidity: "low",
    matchedVolume: 51780,
    volumeDelta15m: 12430,
    favoritePosition: "home",
    openingFavorite: 3.1,
    currentFavorite: 2.42,
  },
  "norlund-1d-0": {
    score: 68,
    oddsDropPct: 12.7,
    volumeAccelPct: 95,
    concentrationPct: 57,
    liquidity: "medium",
    matchedVolume: 14280,
    volumeDelta15m: 2140,
    favoritePosition: "home",
    openingFavorite: 2.05,
    currentFavorite: 1.79,
  },
};

function generateMetrics(rand: () => number, marketId: string, favoritePositions: RunnerPosition[]): GeneratedMetrics {
  const override = FLAGSHIP_OVERRIDES[marketId];
  const favoritePosition = weightedPick(
    rand,
    favoritePositions.map((p, i) => [p, i === 0 ? 55 : 45] as [RunnerPosition, number])
  );
  if (override) {
    return {
      score: override.score!,
      oddsDropPct: override.oddsDropPct!,
      volumeAccelPct: override.volumeAccelPct!,
      concentrationPct: override.concentrationPct!,
      liquidity: override.liquidity!,
      matchedVolume: override.matchedVolume!,
      volumeDelta15m: override.volumeDelta15m!,
      favoritePosition: override.favoritePosition as RunnerPosition,
    };
  }
  const profile = weightedPick(rand, PROFILE_WEIGHTS);
  const score = Math.round(randRange(rand, profile.scoreRange[0], profile.scoreRange[1]));
  const oddsDropPct = randRange(rand, profile.oddsDropRange[0], profile.oddsDropRange[1]);
  const volumeAccelPct = randRange(rand, profile.volumeAccelRange[0], profile.volumeAccelRange[1]);
  const concentrationPct = randRange(rand, profile.concentrationRange[0], profile.concentrationRange[1]);
  const liquidity = weightedPick(rand, profile.liquidity);
  const matchedVolume = Math.round(randRange(rand, profile.baseVolumeRange[0], profile.baseVolumeRange[1]));
  const volumeDelta15m = Math.round(matchedVolume * randRange(rand, 0.08, 0.24));
  return { score, oddsDropPct, volumeAccelPct, concentrationPct, liquidity, matchedVolume, volumeDelta15m, favoritePosition };
}

function buildOddsAndHistory(
  rand: () => number,
  runners: RunnerSpec[],
  metrics: GeneratedMetrics,
  marketId: string,
  nowMs: number
): {
  openingOdds: Record<string, number>;
  currentOdds: Record<string, number>;
  peakOdds: Record<string, number>;
  lowOdds: Record<string, number>;
  oddsHistory: OddsSnapshot[];
} {
  const override = FLAGSHIP_OVERRIDES[marketId];
  const openingOdds: Record<string, number> = {};
  const currentOdds: Record<string, number> = {};

  for (const runner of runners) {
    if (runner.position === "draw") {
      openingOdds[runner.id] = round2(randRange(rand, 2.9, 4.1));
    } else if (runner.position === metrics.favoritePosition) {
      openingOdds[runner.id] = override ? override.openingFavorite : round2(randRange(rand, 1.55, 2.6));
    } else {
      openingOdds[runner.id] = round2(randRange(rand, 2.6, 5.2));
    }
  }

  const favoriteRunner = runners.find((r) => r.position === metrics.favoritePosition)!;
  for (const runner of runners) {
    if (runner.id === favoriteRunner.id) {
      currentOdds[runner.id] = override
        ? override.currentFavorite
        : round2(Math.max(1.01, openingOdds[runner.id] * (1 - metrics.oddsDropPct / 100)));
    } else {
      const drift = 1 + (metrics.oddsDropPct / 100) * randRange(rand, 0.15, 0.4);
      currentOdds[runner.id] = round2(openingOdds[runner.id] * drift);
    }
  }

  const POINTS = 96;
  const stepMs = (24 * 60 * 60 * 1000) / POINTS;
  const oddsHistory: OddsSnapshot[] = [];
  const peakOdds: Record<string, number> = { ...openingOdds };
  const lowOdds: Record<string, number> = { ...openingOdds };

  for (let i = 0; i < POINTS; i++) {
    const t = i / (POINTS - 1);
    const ts = nowMs - (POINTS - 1 - i) * stepMs;
    const values: Record<string, number> = {};
    for (const runner of runners) {
      const target = currentOdds[runner.id];
      const open = openingOdds[runner.id];
      const ease = Math.pow(t, 1.4);
      const noise = i === POINTS - 1 ? 0 : (rand() - 0.5) * open * 0.015;
      const value = Math.max(1.01, round2(open + (target - open) * ease + noise));
      values[runner.id] = value;
      if (value > peakOdds[runner.id]) peakOdds[runner.id] = value;
      if (value < lowOdds[runner.id]) lowOdds[runner.id] = value;
    }
    if (i === POINTS - 1) {
      for (const runner of runners) values[runner.id] = currentOdds[runner.id];
    }
    oddsHistory.push({ timestamp: new Date(ts).toISOString(), values });
  }

  return { openingOdds, currentOdds, peakOdds, lowOdds, oddsHistory };
}

function buildVolumeHistory(rand: () => number, metrics: GeneratedMetrics, nowMs: number): VolumeSnapshot[] {
  const POINTS = 96;
  const stepMs = (24 * 60 * 60 * 1000) / POINTS;
  const remaining = Math.max(0, metrics.matchedVolume - metrics.volumeDelta15m);
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < POINTS - 1; i++) {
    const t = i / (POINTS - 2);
    const w = 0.3 + Math.pow(t, 1.6) * 1.2 + rand() * 0.3;
    weights.push(w);
    weightSum += w;
  }
  const history: VolumeSnapshot[] = [];
  let cumulative = 0;
  for (let i = 0; i < POINTS; i++) {
    const ts = nowMs - (POINTS - 1 - i) * stepMs;
    const volume = i === POINTS - 1 ? metrics.volumeDelta15m : Math.round((weights[i] / weightSum) * remaining);
    cumulative += volume;
    history.push({ timestamp: new Date(ts).toISOString(), volume, cumulative });
  }
  return history;
}

function buildMoneyDistribution(runners: RunnerSpec[], metrics: GeneratedMetrics): Record<string, number> {
  const dist: Record<string, number> = {};
  const favoriteRunner = runners.find((r) => r.position === metrics.favoritePosition)!;
  const others = runners.filter((r) => r.id !== favoriteRunner.id);
  dist[favoriteRunner.id] = Math.round(metrics.concentrationPct);
  const remainder = 100 - dist[favoriteRunner.id];
  if (others.length === 1) {
    dist[others[0].id] = remainder;
  } else {
    const drawShare = Math.round(remainder * 0.35);
    dist[others.find((r) => r.position === "draw")!.id] = drawShare;
    dist[others.find((r) => r.position !== "draw")!.id] = remainder - drawShare;
  }
  return dist;
}

function buildAnomalyBreakdown(metrics: GeneratedMetrics): AnomalyMetrics {
  const liquidityAnomaly = metrics.liquidity === "low" ? 78 + metrics.score * 0.15 : metrics.liquidity === "medium" ? 40 : 14;
  return {
    priceAnomaly: Math.min(100, Math.round(metrics.oddsDropPct * 3.1 + 8)),
    volumeAnomaly: Math.min(100, Math.round(metrics.volumeAccelPct * 0.26 + 6)),
    velocity: Math.min(100, Math.round(metrics.volumeAccelPct * 0.3 + metrics.oddsDropPct * 0.8)),
    concentration: Math.min(100, Math.round(metrics.concentrationPct * 1.15)),
    liquidityAnomaly: Math.min(100, Math.round(liquidityAnomaly)),
  };
}

function buildAnomalyReasons(metrics: GeneratedMetrics): AnomalyReason[] {
  const oddsDropSeverity = tierFor(metrics.oddsDropPct, [
    [4, "watch"],
    [8, "elevated"],
    [15, "high"],
    [22, "extreme"],
  ]);
  const volumeAccelSeverity = tierFor(metrics.volumeAccelPct, [
    [30, "watch"],
    [70, "elevated"],
    [150, "high"],
    [250, "extreme"],
  ]);
  const recentVolumeSeverity = tierFor(metrics.volumeDelta15m, [
    [2000, "watch"],
    [6000, "elevated"],
    [12000, "high"],
    [20000, "extreme"],
  ]);
  const concentrationSeverity = tierFor(metrics.concentrationPct, [
    [45, "watch"],
    [55, "elevated"],
    [65, "high"],
    [75, "extreme"],
  ]);

  return [
    {
      key: "odds-drop",
      label: "Odds drop",
      value: `${metrics.oddsDropPct.toFixed(0)}%`,
      severity: oddsDropSeverity,
      description: ODDS_DROP_LABELS[oddsDropSeverity],
    },
    {
      key: "volume-acceleration",
      label: "Volume acceleration",
      value: `+${metrics.volumeAccelPct.toFixed(0)}%`,
      severity: volumeAccelSeverity,
      description: VOLUME_ACCEL_LABELS[volumeAccelSeverity],
    },
    {
      key: "recent-volume",
      label: "Recent matched volume",
      value: `${formatCurrency(metrics.volumeDelta15m)} / 15m`,
      severity: recentVolumeSeverity,
      description: RECENT_VOLUME_LABELS[recentVolumeSeverity],
    },
    {
      key: "liquidity",
      label: "Liquidity",
      value: metrics.liquidity[0].toUpperCase() + metrics.liquidity.slice(1),
      severity: LIQUIDITY_SEVERITY[metrics.liquidity],
      description: LIQUIDITY_LABELS[metrics.liquidity],
    },
    {
      key: "concentration",
      label: "Market concentration",
      value: `${metrics.concentrationPct.toFixed(0)}%`,
      severity: concentrationSeverity,
      description: CONCENTRATION_LABELS[concentrationSeverity],
    },
  ];
}

function buildTimeline(
  rand: () => number,
  volumeHistory: VolumeSnapshot[],
  oddsHistory: OddsSnapshot[],
  favoriteRunnerId: string,
  level: SignalLevel
): MarketTimelineEvent[] {
  const recent = volumeHistory.slice(-16);
  const recentOdds = oddsHistory.slice(-16);
  const avg = recent.reduce((s, d) => s + d.volume, 0) / recent.length;
  const events: MarketTimelineEvent[] = [];

  recent.forEach((bucket, i) => {
    if (bucket.volume > avg * 1.6 && rand() > 0.3) {
      events.push({
        id: `tl-${bucket.timestamp}-vol`,
        timestamp: bucket.timestamp,
        type: bucket.volume > avg * 2.4 ? "volume-spike" : "volume",
        label: `${formatCurrency(bucket.volume)} matched`,
        severity: bucket.volume > avg * 2.4 ? "high" : "watch",
      });
    }
    if (i > 0) {
      const prevOdds = recentOdds[i - 1]?.values[favoriteRunnerId];
      const currOdds = recentOdds[i]?.values[favoriteRunnerId];
      if (prevOdds && currOdds && Math.abs(prevOdds - currOdds) / prevOdds > 0.02) {
        events.push({
          id: `tl-${bucket.timestamp}-odds`,
          timestamp: bucket.timestamp,
          type: "odds-move",
          label: `Odds ${prevOdds.toFixed(2)} → ${currOdds.toFixed(2)}`,
          severity: "watch",
        });
      }
    }
  });

  if (level === "high" || level === "extreme") {
    events.push({
      id: `tl-signal`,
      timestamp: volumeHistory[volumeHistory.length - 1].timestamp,
      type: "signal",
      label: `${level.toUpperCase()} SIGNAL`,
      severity: level,
    });
  }

  return events.slice(-7);
}

function buildLiquidityMetrics(metrics: GeneratedMetrics): LiquidityMetrics {
  return {
    level: metrics.liquidity,
    matchedVolume: metrics.matchedVolume,
    volumeVelocity: round2(metrics.volumeDelta15m / 15),
    concentration: metrics.concentrationPct,
  };
}

interface GenerateMarketParams {
  marketId: string;
  eventId: string;
  type: MarketType;
  name: string;
  runners: RunnerSpec[];
  seedKey: string;
  nowMs: number;
}

function generateMarket({ marketId, eventId, type, name, runners, seedKey, nowMs }: GenerateMarketParams): Market {
  const rand = seededRandom(seedKey);
  // "Draw" can never be the side money is backing — only a two-runner
  // head-to-head split (home/away, over/under) is a valid favorite.
  const favoriteCandidates = runners.filter((r) => r.position !== "draw").map((r) => r.position);
  const metrics = generateMetrics(rand, marketId, favoriteCandidates);
  const { openingOdds, currentOdds, peakOdds, lowOdds, oddsHistory } = buildOddsAndHistory(
    rand,
    runners,
    metrics,
    marketId,
    nowMs
  );
  const volumeHistory = buildVolumeHistory(rand, metrics, nowMs);
  const moneyDistribution = buildMoneyDistribution(runners, metrics);
  if (marketId === "vantera-li-0") {
    moneyDistribution[`${marketId}-home`] = 72;
    moneyDistribution[`${marketId}-draw`] = 11;
    moneyDistribution[`${marketId}-away`] = 17;
  }
  const reasons = buildAnomalyReasons(metrics);
  const breakdown = buildAnomalyBreakdown(metrics);
  const level = signalFromScore(metrics.score);
  const favoriteRunner = runners.find((r) => r.position === metrics.favoritePosition)!;
  const timeline = buildTimeline(rand, volumeHistory, oddsHistory, favoriteRunner.id, level);
  const runnerList: Runner[] = runners.map((r) => ({ id: r.id, name: r.name, position: r.position }));

  return {
    id: marketId,
    eventId,
    type,
    name,
    status: "open",
    runners: runnerList,
    openingOdds,
    currentOdds,
    peakOdds,
    lowOdds,
    matchedVolume: metrics.matchedVolume,
    volumeDelta15m: metrics.volumeDelta15m,
    liquidity: metrics.liquidity,
    liquidityMetrics: buildLiquidityMetrics(metrics),
    moneyDistribution,
    oddsHistory,
    volumeHistory,
    timeline,
    signal: { level, score: metrics.score, reasons, breakdown },
    lastUpdated: new Date(nowMs).toISOString(),
  };
}

function computeMovementPercent(market: Market): number {
  let movementPercent = 0;
  for (const runner of market.runners) {
    const open = market.openingOdds[runner.id];
    const cur = market.currentOdds[runner.id];
    const pct = ((cur - open) / open) * 100;
    if (Math.abs(pct) > Math.abs(movementPercent)) movementPercent = pct;
  }
  return round2(movementPercent);
}

function poolCompetitionId(pool: LeaguePool): string {
  return pool.id;
}

function generateEventMarkets(seed: FixtureSeed): { event: Event; markets: Market[] } {
  const eventId = `evt-${seed.id}`;
  const nowMs = MOCK_NOW;
  const eventRand = seededRandom(`event-${seed.id}`);

  const primaryRunners = buildMatchOddsRunners(seed.id, seed.home, seed.away, seed.pool.hasDraw);
  const primaryMarket = generateMarket({
    marketId: seed.id,
    eventId,
    type: seed.pool.marketType,
    name:
      seed.pool.marketType === "match-odds"
        ? "Match Odds"
        : seed.pool.marketType === "handicap"
          ? "Handicap"
          : "Match Odds",
    runners: primaryRunners,
    seedKey: seed.id,
    nowMs,
  });

  const markets: Market[] = [primaryMarket];

  // Roughly half of football fixtures also carry a secondary Over/Under
  // market, so the scanner and Moneyway feel like they're covering more
  // than one market type per event.
  if (seed.pool.sport === "football" && eventRand() < 0.45) {
    const ouId = `${seed.id}-ou25`;
    const ouRunners = buildOverUnderRunners(seed.id);
    markets.push(
      generateMarket({
        marketId: ouId,
        eventId,
        type: "over-under",
        name: "Over/Under 2.5 Goals",
        runners: ouRunners,
        seedKey: ouId,
        nowMs,
      })
    );
  }

  const startTime = MOCK_NOW + seed.startOffsetMinutes * 60_000;
  const status: Event["status"] =
    seed.startOffsetMinutes <= 0 && seed.startOffsetMinutes > -110 ? "live" : seed.startOffsetMinutes > 0 ? "upcoming" : "finished";

  const event: Event = {
    id: eventId,
    sport: seed.pool.sport,
    country: seed.pool.country,
    competitionId: poolCompetitionId(seed.pool),
    competition: seed.pool.competition,
    homeTeam: seed.home,
    awayTeam: seed.away,
    kickoff: new Date(startTime).toISOString(),
    status,
    marketIds: markets.map((m) => m.id),
  };

  return { event, markets };
}

function buildAlerts(rows: MarketRow[]): Alert[] {
  const ranked = [...rows].sort((a, b) => b.market.signal.score - a.market.signal.score).slice(0, 16);
  const alerts: Alert[] = [];

  const fixedTemplates: Array<{ severity: SignalLevel; title: string; trigger: AlertTrigger; description: string }> = [
    { severity: "extreme", title: "EXTREME", trigger: "odds-drop", description: "Odds dropped 28% in 7 minutes" },
    { severity: "high", title: "HIGH VOLUME", trigger: "volume-spike", description: "€22,000 matched in 10 minutes" },
    { severity: "high", title: "MONEY SHIFT", trigger: "money-shift", description: "74% of matched money moved to Home" },
  ];

  ranked.forEach((row, i) => {
    const rand = seededRandom(`alert-${row.market.id}`);
    const minsAgo = Math.round(randRange(rand, 4, 340));
    const timestamp = new Date(MOCK_NOW - minsAgo * 60_000).toISOString();
    const match = `${row.event.homeTeam} vs ${row.event.awayTeam}`;

    if (i < fixedTemplates.length) {
      const t = fixedTemplates[i];
      alerts.push({
        id: `alert-${row.market.id}-fixed`,
        timestamp,
        sport: row.event.sport,
        competition: row.event.competition,
        match,
        market: row.market.name,
        trigger: t.trigger,
        title: t.title,
        description: t.description,
        value: t.description,
        score: row.market.signal.score,
        severity: t.severity,
        eventId: row.event.id,
        marketId: row.market.id,
      });
      return;
    }

    const reasons = row.market.signal.reasons;
    const order: SignalLevel[] = ["normal", "watch", "elevated", "high", "extreme"];
    const dominant = [...reasons].sort((a, b) => order.indexOf(b.severity) - order.indexOf(a.severity))[0];

    let trigger: AlertTrigger = "high-activity";
    let title = "HIGH ACTIVITY";
    let description = "Sharp increase in matched volume and odds movement detected";

    if (dominant.key === "odds-drop") {
      trigger = "odds-drop";
      title = row.market.signal.level === "extreme" ? "EXTREME" : "SHARP MOVEMENT";
      description = `Odds dropped ${dominant.value} in ${Math.round(randRange(rand, 5, 40))} minutes`;
    } else if (dominant.key === "volume-acceleration" || dominant.key === "recent-volume") {
      trigger = "volume-spike";
      title = "HIGH VOLUME";
      description = `${formatCurrency(row.market.volumeDelta15m)} matched in ${Math.round(randRange(rand, 5, 25))} minutes`;
    } else if (dominant.key === "concentration") {
      trigger = "money-shift";
      title = "MONEY SHIFT";
      const favoriteRunner = row.market.runners.find(
        (r) => row.market.moneyDistribution[r.id] === Math.max(...Object.values(row.market.moneyDistribution))
      );
      description = `${dominant.value} of matched money moved to ${favoriteRunner?.name ?? "favorite"}`;
    } else if (dominant.key === "liquidity") {
      trigger = "liquidity-shift";
      title = "LIQUIDITY SHIFT";
      description = `+${Math.round(randRange(rand, 120, 280))}% drop in available depth`;
    }

    alerts.push({
      id: `alert-${row.market.id}`,
      timestamp,
      sport: row.event.sport,
      competition: row.event.competition,
      match,
      market: row.market.name,
      trigger,
      title,
      description,
      value: description,
      score: row.market.signal.score,
      severity: row.market.signal.level,
      eventId: row.event.id,
      marketId: row.market.id,
    });
  });

  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function buildMarketActivity(): MarketActivityPoint[] {
  const rand = seededRandom("market-activity");
  const points: MarketActivityPoint[] = [];
  const HOURS = 24;
  for (let i = 0; i < HOURS; i++) {
    const ts = MOCK_NOW - (HOURS - 1 - i) * 60 * 60_000;
    const base = 640_000 + Math.sin((i / HOURS) * Math.PI * 2 + 1) * 180_000;
    const spike = i === 14 || i === 20 ? randRange(rand, 260_000, 420_000) : 0;
    const volume = Math.max(120_000, Math.round(base + spike + (rand() - 0.5) * 90_000));
    points.push({ timestamp: new Date(ts).toISOString(), volume });
  }
  return points;
}

function buildAnalytics(rows: MarketRow[]): AnalyticsSummary {
  const severityCounts = new Map<SignalLevel, number>();
  const competitionCounts = new Map<string, number>();
  let totalMovement = 0;
  let extremeSignals = 0;

  for (const row of rows) {
    const level = row.market.signal.level;
    severityCounts.set(level, (severityCounts.get(level) ?? 0) + 1);
    if (level === "extreme") extremeSignals += 1;
    if (level === "high" || level === "extreme" || level === "elevated") {
      competitionCounts.set(row.event.competition, (competitionCounts.get(row.event.competition) ?? 0) + 1);
    }
    totalMovement += Math.abs(row.movementPercent);
  }

  const signalsByDay = [
    { day: "Mon", count: 21 },
    { day: "Tue", count: 27 },
    { day: "Wed", count: 34 },
    { day: "Thu", count: 29 },
    { day: "Fri", count: 22 },
    { day: "Sat", count: 41 },
    { day: "Sun", count: 33 },
  ];

  return {
    marketsMonitored: 2847,
    signalsGenerated: signalsByDay.reduce((s, d) => s + d.count, 0),
    extremeSignals,
    averageMovement: round2(totalMovement / rows.length),
    volumeMonitored: 18_400_000,
    signalsByDay,
    signalsBySeverity: (["normal", "watch", "elevated", "high", "extreme"] as SignalLevel[]).map((level) => ({
      level,
      count: severityCounts.get(level) ?? 0,
    })),
    signalsByCompetition: [...competitionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([competition, count]) => ({ competition, count })),
    largestMovements: [...rows].sort((a, b) => Math.abs(b.movementPercent) - Math.abs(a.movementPercent)).slice(0, 6),
    highestVolumeMarkets: [...rows].sort((a, b) => b.market.matchedVolume - a.market.matchedVolume).slice(0, 6),
  };
}

const OVERVIEW_KPIS: OverviewKpis = {
  marketsMonitored: 2847,
  marketsMonitoredDelta: 4.6,
  highActivity: 38,
  highActivityDelta: 12.1,
  majorMovements: 12,
  majorMovementsDelta: -3.4,
  volumeTracked: 18_400_000,
  volumeTrackedDelta: 8.9,
  signalsDetected: 207,
  signalsDetectedDelta: 15.8,
};

const MARKET_PULSE: MarketPulseBucket[] = [
  { level: "normal", label: "Normal", percent: 72 },
  { level: "elevated", label: "Elevated", percent: 18 },
  { level: "high", label: "High", percent: 7 },
  { level: "extreme", label: "Extreme", percent: 3 },
];

interface MockDataset {
  competitions: Competition[];
  rows: MarketRow[];
  alerts: Alert[];
  kpis: OverviewKpis;
  marketPulse: MarketPulseBucket[];
  marketActivity: MarketActivityPoint[];
  analytics: AnalyticsSummary;
}

function buildCompetitions(): Competition[] {
  return LEAGUE_POOLS.map((pool) => ({
    id: pool.id,
    sport: pool.sport,
    country: pool.country,
    name: pool.competition,
  }));
}

function buildDataset(): MockDataset {
  const seeds = buildFixtureSeeds();
  const rows: MarketRow[] = [];
  for (const seed of seeds) {
    const { event, markets } = generateEventMarkets(seed);
    for (const market of markets) {
      rows.push({ event, market, movementPercent: computeMovementPercent(market) });
    }
  }
  const alerts = buildAlerts(rows);
  const marketActivity = buildMarketActivity();
  const analytics = buildAnalytics(rows);
  const competitions = buildCompetitions();
  return { competitions, rows, alerts, kpis: OVERVIEW_KPIS, marketPulse: MARKET_PULSE, marketActivity, analytics };
}

export const MOCK_DATASET: MockDataset = buildDataset();
