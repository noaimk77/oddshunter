import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { ScannerView } from "@/features/scanner/scanner-view";

export default async function ScannerPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Scanner"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Market Scanner
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Monitoring betting markets for unusual price and volume activity."
      />
      {status.available ? (
        <ScannerBody isDemo={isDemo} hasVolumeData={status.hasVolumeData} />
      ) : (
        <LiveDataUnavailable />
      )}
    </div>
  );
}

async function ScannerBody({ isDemo, hasVolumeData }: { isDemo: boolean; hasVolumeData: boolean }) {
  const [rows, filterOptions] = await Promise.all([
    marketDataProvider.listMarkets(),
    marketDataProvider.getFilterOptions(),
  ]);
  return <ScannerView initialRows={rows} filterOptions={filterOptions} isDemo={isDemo} hasVolumeData={hasVolumeData} />;
}
