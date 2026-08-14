import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { ScannerView } from "@/features/scanner/scanner-view";

export default async function ScannerPage() {
  const [rows, filterOptions] = await Promise.all([
    marketDataProvider.listMarkets(),
    marketDataProvider.getFilterOptions(),
  ]);

  const marketTypes = [...new Set(rows.map((r) => r.market.name))];

  return (
    <div>
      <PageHeader
        eyebrow="Live Scanner"
        title="Live Market Scanner"
        description="Monitoring thousands of betting markets for unusual price and volume activity."
      />
      <ScannerView initialRows={rows} filterOptions={filterOptions} marketTypes={marketTypes} />
    </div>
  );
}
