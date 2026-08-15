import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { AlertFeed } from "@/features/alerts/alert-feed";
import { AlertRulesPanel } from "@/features/alerts/alert-rules-panel";

export default async function AlertsPage() {
  const [status, filterOptions] = await Promise.all([
    marketDataProvider.getStatus(),
    marketDataProvider.getFilterOptions(),
  ]);
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Alert Center"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Alerts
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Create alert rules and review every market anomaly Odds Hunter has flagged."
      />

      <SectionCard className="mb-4">
        <AlertRulesPanel options={filterOptions} />
      </SectionCard>

      <SectionCard title="Alert History" bodyClassName={status.available ? "p-2 sm:p-3" : undefined}>
        {status.available ? <AlertHistory /> : <LiveDataUnavailable title="No live alert history yet" />}
      </SectionCard>
    </div>
  );
}

async function AlertHistory() {
  const alerts = await marketDataProvider.getAlerts();
  return <AlertFeed alerts={alerts} />;
}
