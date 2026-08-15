import { Activity, Euro, Flame, Target, Zap } from "lucide-react";
import { marketDataProvider } from "@/services";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";
import { MarketActivityChart } from "@/features/overview/market-activity-chart";
import { MarketPulse } from "@/features/overview/market-pulse";
import { LiveMarketFeed } from "@/features/overview/live-market-feed";
import { TopMovementsTable } from "@/features/overview/top-movements-table";

export default async function OverviewPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  const header = (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Good evening</p>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
          Market Intelligence
          {isDemo && <DemoDataBadge />}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Odds Hunter is watching price movement, matched volume, and money flow across every market it monitors.
        </p>
      </div>
      <OddsHunterMascot variant="compact" className="hidden shrink-0 sm:block" />
    </div>
  );

  if (!status.available) {
    return (
      <div>
        {header}
        <LiveDataUnavailable />
      </div>
    );
  }

  const [kpis, marketPulse, marketActivity, topMovements, liveFeed] = await Promise.all([
    marketDataProvider.getOverviewKpis(),
    marketDataProvider.getMarketPulse(),
    marketDataProvider.getMarketActivity(),
    marketDataProvider.getTopMovements(12),
    marketDataProvider.getLiveFeed(14),
  ]);

  return (
    <div>
      {header}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Markets Monitored"
          value={kpis.marketsMonitored}
          delta={kpis.marketsMonitoredDelta}
          deltaLabel="vs yesterday"
          icon={<Activity className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={0}
        />
        <KpiCard
          label="High Activity"
          value={kpis.highActivity}
          delta={kpis.highActivityDelta}
          deltaLabel="vs yesterday"
          icon={<Flame className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={1}
        />
        <KpiCard
          label="Major Movements"
          value={kpis.majorMovements}
          delta={kpis.majorMovementsDelta}
          deltaLabel="vs yesterday"
          icon={<Zap className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={2}
        />
        <KpiCard
          label="Volume Tracked"
          value={kpis.volumeTracked}
          formatKind="compact-currency"
          delta={kpis.volumeTrackedDelta}
          deltaLabel="vs yesterday"
          icon={<Euro className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={3}
        />
        <KpiCard
          label="Signals Detected"
          value={kpis.signalsDetected}
          delta={kpis.signalsDetectedDelta}
          deltaLabel="vs yesterday"
          icon={<Target className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={4}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Market Activity" description="Global matched volume, last 24 hours" className="xl:col-span-2">
          <MarketActivityChart data={marketActivity} />
        </SectionCard>
        <SectionCard title="Market Pulse" description="Distribution of markets by signal level">
          <MarketPulse buckets={marketPulse} />
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Top Market Movements"
          description={`${topMovements.length} markets with the largest odds movement right now`}
          className="xl:col-span-2"
          bodyClassName="p-0"
        >
          <TopMovementsTable rows={topMovements} />
        </SectionCard>
        <SectionCard title="Live Market Feed" description="Recent activity across every monitored market" bodyClassName="p-2">
          <LiveMarketFeed initialFeed={liveFeed} />
        </SectionCard>
      </div>
    </div>
  );
}
