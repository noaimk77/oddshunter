import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { MoneywayView } from "@/features/moneyway/moneyway-view";

export default async function MoneywayPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Moneyway"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Moneyway
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Where the matched money is flowing across every monitored selection."
      />
      {status.available ? <MoneywayBody /> : <LiveDataUnavailable />}
    </div>
  );
}

async function MoneywayBody() {
  const rows = await marketDataProvider.listMoneyway();
  return <MoneywayView rows={rows} />;
}
