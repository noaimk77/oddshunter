import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { WatchlistView } from "@/features/watchlist/watchlist-view";

export default async function WatchlistPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Watchlist"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Your Watchlist
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Markets you're tracking closely, saved to your account."
      />
      {status.available ? <WatchlistBody hasVolumeData={status.hasVolumeData} /> : <LiveDataUnavailable />}
    </div>
  );
}

async function WatchlistBody({ hasVolumeData }: { hasVolumeData: boolean }) {
  const rows = await marketDataProvider.listMarkets();
  return <WatchlistView allRows={rows} hasVolumeData={hasVolumeData} />;
}
