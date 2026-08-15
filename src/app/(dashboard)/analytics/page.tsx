import { Activity, AlertTriangle, Euro, Gauge, Zap } from "lucide-react";
import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import {
  HighestVolumeMarketsList,
  LargestMovementsList,
  SignalsByCompetitionChart,
  SignalsByDayChart,
  SignalsBySeverityChart,
} from "@/features/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Platform Analytics
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Aggregate trends across every market and signal Odds Hunter has processed."
      />
      {status.available ? <AnalyticsBody /> : <LiveDataUnavailable />}
    </div>
  );
}

async function AnalyticsBody() {
  const analytics = await marketDataProvider.getAnalytics();

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Markets Monitored"
          value={analytics.marketsMonitored}
          icon={<Activity className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={0}
        />
        <KpiCard
          label="Signals Generated"
          value={analytics.signalsGenerated}
          icon={<Zap className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={1}
        />
        <KpiCard
          label="Extreme Signals"
          value={analytics.extremeSignals}
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={2}
        />
        <KpiCard
          label="Avg. Movement"
          value={analytics.averageMovement}
          formatKind="percent"
          icon={<Gauge className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={3}
        />
        <KpiCard
          label="Volume Monitored"
          value={analytics.volumeMonitored}
          formatKind="compact-currency"
          icon={<Euro className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={4}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Signals by Day" description="Last 7 days">
          <SignalsByDayChart data={analytics.signalsByDay} />
        </SectionCard>
        <SectionCard title="Signals by Competition" description="Elevated, high & extreme markets">
          <SignalsByCompetitionChart data={analytics.signalsByCompetition} />
        </SectionCard>
        <SectionCard title="Signals by Severity" description="Current distribution across monitored markets">
          <SignalsBySeverityChart data={analytics.signalsBySeverity} />
        </SectionCard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          <SectionCard title="Largest Movements" description="Biggest odds swings right now">
            <LargestMovementsList rows={analytics.largestMovements} />
          </SectionCard>
          <SectionCard title="Highest-Volume Markets" description="Where the most money has matched">
            <HighestVolumeMarketsList rows={analytics.highestVolumeMarkets} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
