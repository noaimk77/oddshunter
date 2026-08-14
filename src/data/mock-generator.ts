import { buildFixtureSeeds, type FixtureSeed } from "./fixtures";
import { seededRandom, randRange, weightedPick } from "./rng";
import { formatCurrency } from "@/lib/format";
import { signalFromScore } from "@/lib/signal";
import type {
  Alert,
  AnalyticsSummary,
  AnomalyReason,
  Event,
  Liquidity,
  Market,
  MarketActivityPoint,
  MarketPulseBucket,
  MarketRow,
  OddsSnapshot,
  OverviewKpis,
  Runner,
  RunnerPosition,
  SignalLevel,
  Sport,
  VolumeSnapshot,
} from "@/types";

/** Fixed reference "now" so server and client render identical mock data. */
export const MOCK_NOW = new Date("2026-08-15T18:00:00Z").getTime();

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

const PROFILES: Record<Exclude<SignalLevel, "normal"> | "normal", ScoreProfile> = {
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

function buildRunners(marketId: string, home: string, away: string, hasDraw: boolean): Runner[] {
  const runners: Runner[] = [
    { id: `${marketId}-home`, name: home, position: "home" as RunnerPosition },
  ];
  if (hasDraw) runners.push({ id: `${marketId}-draw`, name: "Draw", position: "draw" as RunnerPosition });
  runners.push({ id: `${marketId}-away`, name: away, position: "away" as RunnerPosition });
  return runners;
}

interface GeneratedMetrics {
  score: number;
  oddsDropPct: number;
  volumeAccelPct: number;
  concentrationPct: number;
  liquidity: Liquidity;
  matchedVolume: number;
  volumeDelta15m: number;
  favorite: "home" | "away";
}

/** Exact figures called out in the product brief for the three flagship examples. */
const FLAGSHIP_OVERRIDES: Record<string, Partial<GeneratedMetrics> & { openingFavorite: number; currentFavorite: number }> = {
  "py-di-0": {
    score: 91,
    oddsDropPct: 26,
    volumeAccelPct: 312,
    concentrationPct: 72,
    liquidity: "low",
    matchedVolume: 37420,
    volumeDelta15m: 18240,
    favorite: "home",
    openingFavorite: 2.46,
    currentFavorite: 1.82,
  },
  "ar-pn-0": {
    score: 87,
    oddsDropPct: 21.9,
    volumeAccelPct: 245,
    concentrationPct: 68,
    liquidity: "low",
    matchedVolume: 51780,
    volumeDelta15m: 12430,
    favorite: "home",
    openingFavorite: 3.1,
    currentFavorite: 2.42,
  },
  "fi-yk-0": {
    score: 68,
    oddsDropPct: 12.7,
    volumeAccelPct: 95,
    concentrationPct: 57,
    liquidity: "medium",
    matchedVolume: 14280,
    volumeDelta15m: 2140,
    favorite: "home",
    openingFavorite: 2.05,
    currentFavorite: 1.79,
  },
};

function generateMetrics(rand: () => number, marketId: string): GeneratedMetrics {
  const override = FLAGSHIP_OVERRIDES[marketId];
  const favorite = weightedPick(rand, [["home", 55], ["away", 45]] as [("home" | "away"), number][]);
  if (override) {
    return {
      score: override.score!,
      oddsDropPct: override.oddsDropPct!,
      volumeAccelPct: override.volumeAccelPct!,
      concentrationPct: override.concentrationPct!,
      liquidity: override.liquidity!,
      matchedVolume: override.matchedVolume!,
      volumeDelta15m: override.volumeDelta15m!,
      favorite: override.favorite as "home" | "away",
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
  return { score, oddsDropPct, volumeAccelPct, concentrationPct, liquidity, matchedVolume, volumeDelta15m, favorite };
}

function buildOddsAndHistory(
  rand: () => number,
  runners: Runner[],
  metrics: GeneratedMetrics,
  marketId: string,
  nowMs: number
): { openingOdds: Record<string, number>; currentOdds: Record<string, number>; oddsHistory: OddsSnapshot[] } {
  const override = FLAGSHIP_OVERRIDES[marketId];
  const openingOdds: Record<string, number> = {};
  const currentOdds: Record<string, number> = {};

  for (const runner of runners) {
    if (runner.position === "draw") {
      openingOdds[runner.id] = round2(randRange(rand, 2.9, 4.1));
    } else if (runner.position === metrics.favorite) {
      openingOdds[runner.id] = override ? override.openingFavorite : round2(randRange(rand, 1.55, 2.6));
    } else {
      openingOdds[runner.id] = round2(randRange(rand, 2.6, 5.2));
    }
  }

  const favoriteRunner = runners.find((r) => r.position === metrics.favorite)!;
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
  for (let i = 0; i < POINTS; i++) {
    const t = i / (POINTS - 1);
    const ts = nowMs - (POINTS - 1 - i) * stepMs;
    const values: Record<string, number> = {};
    for (const runner of runners) {
      const target = currentOdds[runner.id];
      const open = openingOdds[runner.id];
      const ease = Math.pow(t, 1.4);
      const noise = i === POINTS - 1 ? 0 : (rand() - 0.5) * open * 0.015;
      values[runner.id] = Math.max(1.01, round2(open + (target - open) * ease + noise));
    }
    if (i === POINTS - 1) {
      for (const runner of runners) values[runner.id] = currentOdds[runner.id];
    }
    oddsHistory.push({ timestamp: new Date(ts).toISOString(), values });
  }

  return { openingOdds, currentOdds, oddsHistory };
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

function buildMoneyDistribution(runners: Runner[], metrics: GeneratedMetrics): Record<string, number> {
  const dist: Record<string, number> = {};
  const favoriteRunner = runners.find((r) => r.position === metrics.favorite)!;
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

function generateMarketRow(seed: FixtureSeed): MarketRow {
  const marketId = seed.id;
  const eventId = `evt-${seed.id}`;
  const rand = seededRandom(marketId);

  const runners = buildRunners(marketId, seed.home, seed.away, seed.pool.hasDraw);
  const metrics = generateMetrics(rand, marketId);
  const { openingOdds, currentOdds, oddsHistory } = buildOddsAndHistory(rand, runners, metrics, marketId, MOCK_NOW);
  const volumeHistory = buildVolumeHistory(rand, metrics, MOCK_NOW);
  const moneyDistribution = buildMoneyDistribution(runners, metrics);
  if (marketId === "py-di-0") {
    moneyDistribution[`${marketId}-home`] = 72;
    moneyDistribution[`${marketId}-draw`] = 11;
    moneyDistribution[`${marketId}-away`] = 17;
  }
  const reasons = buildAnomalyReasons(metrics);
  const level = signalFromScore(metrics.score);

  const startTime = new Date(MOCK_NOW + seed.startOffsetMinutes * 60_000).toISOString();
  const status: Event["status"] = seed.startOffsetMinutes <= 0 && seed.startOffsetMinutes > -110 ? "live" : seed.startOffsetMinutes > 0 ? "upcoming" : "closed";

  const event: Event = {
    id: eventId,
    sport: seed.pool.sport,
    country: seed.pool.country,
    league: seed.pool.league,
    homeTeam: seed.home,
    awayTeam: seed.away,
    startTime,
    status,
  };

  const marketName =
    seed.pool.marketType === "match-odds"
      ? "Match Odds"
      : seed.pool.marketType === "handicap"
        ? "Handicap"
        : seed.pool.marketType === "over-under"
          ? "Over / Under"
          : "Correct Score";

  const market: Market = {
    id: marketId,
    eventId,
    type: seed.pool.marketType,
    name: marketName,
    runners,
    openingOdds,
    currentOdds,
    matchedVolume: metrics.matchedVolume,
    volumeDelta15m: metrics.volumeDelta15m,
    liquidity: metrics.liquidity,
    moneyDistribution,
    oddsHistory,
    volumeHistory,
    signal: { level, score: metrics.score, reasons },
  };

  let movementPercent = 0;
  for (const runner of runners) {
    const open = openingOdds[runner.id];
    const cur = currentOdds[runner.id];
    const pct = ((cur - open) / open) * 100;
    if (Math.abs(pct) > Math.abs(movementPercent)) movementPercent = pct;
  }

  return { event, market, movementPercent: round2(movementPercent) };
}

function buildAlerts(rows: MarketRow[]): Alert[] {
  const ranked = [...rows].sort((a, b) => b.market.signal.score - a.market.signal.score).slice(0, 16);
  const alerts: Alert[] = [];

  const fixedTemplates: Array<{ level: SignalLevel; title: string; description: (r: MarketRow) => string; type: Alert["type"] }> = [
    {
      level: "extreme",
      title: "EXTREME",
      type: "odds-drop",
      description: () => "Odds dropped 28% in 7 minutes",
    },
    {
      level: "high",
      title: "HIGH VOLUME",
      type: "volume-spike",
      description: () => "€22,000 matched in 10 minutes",
    },
    {
      level: "high",
      title: "MONEY SHIFT",
      type: "money-shift",
      description: () => "74% of matched money moved to Home",
    },
  ];

  ranked.forEach((row, i) => {
    const rand = seededRandom(`alert-${row.market.id}`);
    const minsAgo = Math.round(randRange(rand, 4, 340));
    const timestamp = new Date(MOCK_NOW - minsAgo * 60_000).toISOString();

    if (i < fixedTemplates.length) {
      const t = fixedTemplates[i];
      alerts.push({
        id: `alert-${row.market.id}-fixed`,
        timestamp,
        level: t.level,
        type: t.type,
        title: t.title,
        description: t.description(row),
        eventId: row.event.id,
        marketId: row.market.id,
        eventLabel: `${row.event.homeTeam} vs ${row.event.awayTeam}`,
        league: `${row.event.country} · ${row.event.league}`,
        value: t.description(row),
        score: row.market.signal.score,
      });
      return;
    }

    const reasons = row.market.signal.reasons;
    const dominant = [...reasons].sort((a, b) => {
      const order: SignalLevel[] = ["normal", "watch", "elevated", "high", "extreme"];
      return order.indexOf(b.severity) - order.indexOf(a.severity);
    })[0];

    let type: Alert["type"] = "high-activity";
    let title = "HIGH ACTIVITY";
    let description = `Sharp increase in matched volume and odds movement detected`;

    if (dominant.key === "odds-drop") {
      type = "odds-drop";
      title = row.market.signal.level === "extreme" ? "EXTREME" : "SHARP MOVEMENT";
      description = `Odds dropped ${dominant.value} in ${Math.round(randRange(rand, 5, 40))} minutes`;
    } else if (dominant.key === "volume-acceleration" || dominant.key === "recent-volume") {
      type = "volume-spike";
      title = "HIGH VOLUME";
      description = `${formatCurrency(row.market.volumeDelta15m)} matched in ${Math.round(randRange(rand, 5, 25))} minutes`;
    } else if (dominant.key === "concentration") {
      type = "money-shift";
      title = "MONEY SHIFT";
      const favoriteRunner = row.market.runners.find((r) => row.market.moneyDistribution[r.id] === Math.max(...Object.values(row.market.moneyDistribution)));
      description = `${dominant.value} of matched money moved to ${favoriteRunner?.name ?? "favorite"}`;
    }

    alerts.push({
      id: `alert-${row.market.id}`,
      timestamp,
      level: row.market.signal.level,
      type,
      title,
      description,
      eventId: row.event.id,
      marketId: row.market.id,
      eventLabel: `${row.event.homeTeam} vs ${row.event.awayTeam}`,
      league: `${row.event.country} · ${row.event.league}`,
      value: description,
      score: row.market.signal.score,
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
  const leagueCounts = new Map<string, number>();
  const sportVolume = new Map<Sport, number>();
  let totalMovement = 0;

  for (const row of rows) {
    const level = row.market.signal.level;
    severityCounts.set(level, (severityCounts.get(level) ?? 0) + 1);
    if (level === "high" || level === "extreme" || level === "elevated") {
      leagueCounts.set(row.event.league, (leagueCounts.get(row.event.league) ?? 0) + 1);
    }
    sportVolume.set(row.event.sport, (sportVolume.get(row.event.sport) ?? 0) + row.market.matchedVolume);
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
    averageOddsMovement: round2(totalMovement / rows.length),
    volumeTracked: 18_400_000,
    signalsByDay,
    signalsByLeague: [...leagueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([league, count]) => ({ league, count })),
    signalsBySeverity: (["normal", "watch", "elevated", "high", "extreme"] as SignalLevel[]).map((level) => ({
      level,
      count: severityCounts.get(level) ?? 0,
    })),
    volumeDistribution: [...sportVolume.entries()].map(([sport, volume]) => ({ sport, volume })),
  };
}

const OVERVIEW_KPIS: OverviewKpis = {
  liveMarkets: 2847,
  liveMarketsDelta: 4.6,
  highActivity: 38,
  highActivityDelta: 12.1,
  majorMovements: 12,
  majorMovementsDelta: -3.4,
  volumeTracked: 18_400_000,
  volumeTrackedDelta: 8.9,
};

const MARKET_PULSE: MarketPulseBucket[] = [
  { level: "normal", label: "Normal Markets", percent: 72 },
  { level: "elevated", label: "Elevated Activity", percent: 18 },
  { level: "high", label: "High Activity", percent: 7 },
  { level: "extreme", label: "Extreme Activity", percent: 3 },
];

interface MockDataset {
  rows: MarketRow[];
  alerts: Alert[];
  kpis: OverviewKpis;
  marketPulse: MarketPulseBucket[];
  marketActivity: MarketActivityPoint[];
  analytics: AnalyticsSummary;
}

function buildDataset(): MockDataset {
  const seeds = buildFixtureSeeds();
  const rows = seeds.map(generateMarketRow);
  const alerts = buildAlerts(rows);
  const marketActivity = buildMarketActivity();
  const analytics = buildAnalytics(rows);
  return { rows, alerts, kpis: OVERVIEW_KPIS, marketPulse: MARKET_PULSE, marketActivity, analytics };
}

export const MOCK_DATASET: MockDataset = buildDataset();
