import { Activity, Euro, Gauge, Zap } from "lucide-react";
import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import {
  SignalsByDayChart,
  SignalsByLeagueChart,
  SignalsBySeverityChart,
  VolumeDistributionChart,
} from "@/features/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const analytics = await marketDataProvider.getAnalytics();

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Platform Analytics"
        description="Aggregate trends across every market and signal OddScope has processed."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          label="Avg. Odds Movement"
          value={analytics.averageOddsMovement}
          formatKind="percent"
          icon={<Gauge className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={2}
        />
        <KpiCard
          label="Volume Tracked"
          value={analytics.volumeTracked}
          formatKind="compact-currency"
          icon={<Euro className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} />}
          index={3}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Signals by Day" description="Last 7 days">
          <SignalsByDayChart data={analytics.signalsByDay} />
        </SectionCard>
        <SectionCard title="Signals by League" description="Elevated, high & extreme markets">
          <SignalsByLeagueChart data={analytics.signalsByLeague} />
        </SectionCard>
        <SectionCard title="Signals by Severity" description="Current distribution across monitored markets">
          <SignalsBySeverityChart data={analytics.signalsBySeverity} />
        </SectionCard>
        <SectionCard title="Volume Distribution" description="Matched volume by sport">
          <VolumeDistributionChart data={analytics.volumeDistribution} />
        </SectionCard>
      </div>
    </div>
  );
}
