import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { marketDataProvider } from "@/services";
import { SectionCard } from "@/components/shared/section-card";
import { MarketHeader } from "@/features/market-detail/market-header";
import { StatBlocks } from "@/features/market-detail/stat-blocks";
import { OddsHistoryChart } from "@/features/market-detail/odds-history-chart";
import { VolumeHistoryChart } from "@/features/market-detail/volume-history-chart";
import { MoneyDistribution } from "@/features/market-detail/money-distribution";
import { AnomalyAnalysis } from "@/features/market-detail/anomaly-analysis";
import { AnomalyRadar } from "@/features/market-detail/anomaly-radar";

export default async function MarketDetailPage(props: PageProps<"/market/[id]">) {
  const { id } = await props.params;
  const row = await marketDataProvider.getMarket(id);
  if (!row) notFound();

  const { event, market, movementPercent } = row;

  return (
    <div className="space-y-4">
      <MarketHeader event={event} market={market} />
      <StatBlocks market={market} movementPercent={movementPercent} />

      <SectionCard title="Odds History" description="Price movement across each outcome">
        <OddsHistoryChart market={market} />
      </SectionCard>

      <SectionCard title="Volume History" description="Matched volume per 15-minute interval">
        <VolumeHistoryChart market={market} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Money Distribution" description="Share of matched money by outcome">
          <MoneyDistribution market={market} />
        </SectionCard>

        <SectionCard title="Anomaly Analysis" description="Statistical criteria contributing to this market's score">
          <AnomalyAnalysis reasons={market.signal.reasons} />
        </SectionCard>
      </div>

      <SectionCard title="Why This Score" description="Relative weight of each anomaly criterion">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
          <AnomalyRadar reasons={market.signal.reasons} />
          <div className="flex items-start gap-3 rounded-md border border-border/70 bg-secondary/30 p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <p>
              The Suspicion Score is a statistical measure of how unusual this market&apos;s odds and volume
              behavior is compared to typical activity. It reflects market anomaly signals only and is never a
              claim, finding, or evidence that a match is fixed or manipulated.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
