import { Activity, Euro, Flame, Zap } from "lucide-react";
import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { MarketActivityChart } from "@/features/overview/market-activity-chart";
import { MarketPulse } from "@/features/overview/market-pulse";
import { TopMovementsTable } from "@/features/overview/top-movements-table";

export default async function OverviewPage() {
  const [kpis, marketPulse, marketActivity, topMovements] = await Promise.all([
    marketDataProvider.getOverviewKpis(),
    marketDataProvider.getMarketPulse(),
    marketDataProvider.getMarketActivity(),
    marketDataProvider.getTopMovements(12),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Good evening"
        title="Market Intelligence Overview"
        description="A real-time snapshot of odds and volume activity across every market OddScope is watching."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Live Markets"
          value={kpis.liveMarkets}
          delta={kpis.liveMarketsDelta}
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Market Activity" description="Global matched volume, last 24 hours" className="xl:col-span-2">
          <MarketActivityChart data={marketActivity} />
        </SectionCard>
        <SectionCard title="Market Pulse" description="Distribution of markets by signal level">
          <MarketPulse buckets={marketPulse} />
        </SectionCard>
      </div>

      <SectionCard
        title="Top Market Movements"
        description={`${topMovements.length} markets with the largest odds movement right now`}
        className="mt-4"
        bodyClassName="p-0"
      >
        <TopMovementsTable rows={topMovements} />
      </SectionCard>
    </div>
  );
}
