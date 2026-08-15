import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { FixturesView } from "@/features/fixtures/fixtures-view";

export default async function FixturesPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Fixtures"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Fixtures
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Every match Odds Hunter is tracking, grouped by competition."
      />
      {status.available ? <FixturesBody /> : <LiveDataUnavailable />}
    </div>
  );
}

async function FixturesBody() {
  const rows = await marketDataProvider.listMarkets();
  return <FixturesView rows={rows} />;
}
