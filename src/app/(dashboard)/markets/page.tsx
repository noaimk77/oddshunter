import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { MarketsView } from "@/features/markets/markets-view";

export default async function MarketsPage() {
  const rows = await marketDataProvider.listMarkets();

  return (
    <div>
      <PageHeader
        eyebrow="Markets"
        title="All Markets"
        description="Browse every market OddScope currently monitors, grouped by sport."
      />
      <MarketsView rows={rows} />
    </div>
  );
}
