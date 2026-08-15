import { SatelliteDish } from "lucide-react";

/**
 * Shown instead of page content whenever no real market data provider is
 * configured — never replaced with mock data outside local development.
 * See src/services/index.ts for the selection logic.
 */
export function LiveDataUnavailable({
  title = "Live market data unavailable",
  description = "Odds Hunter isn't connected to a live odds provider yet. Once Betfair (or another supported source) is configured, real fixtures and market data will appear here automatically.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-6 py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal-watch/10">
        <SatelliteDish className="h-5 w-5 text-signal-watch" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
