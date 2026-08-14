import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { WatchlistView } from "@/features/watchlist/watchlist-view";

export default async function WatchlistPage() {
  const rows = await marketDataProvider.listMarkets();

  return (
    <div>
      <PageHeader
        eyebrow="Watchlist"
        title="Your Watchlist"
        description="Markets you're tracking closely, saved locally to this browser."
      />
      <WatchlistView allRows={rows} />
    </div>
  );
}
