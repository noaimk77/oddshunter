import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { EmptyState } from "@/components/shared/empty-state";
import { TopMovementsTable } from "@/features/overview/top-movements-table";
import { LineChart } from "lucide-react";

export default async function MouvementsPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";

  return (
    <div>
      <PageHeader
        eyebrow="Mouvements de cotes"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Mouvements de cotes
            {isDemo && <DemoDataBadge />}
          </span>
        }
        description="Écarts entre la cote d'ouverture et la cote actuelle, calculés à partir de vraies cotes bookmaker. API-Football ne fournit aucun montant réellement misé — aucun volume ni « money flow » n'est donc affiché ici."
      />
      {status.available ? <MouvementsBody hasVolumeData={status.hasVolumeData} /> : <LiveDataUnavailable />}
    </div>
  );
}

async function MouvementsBody({ hasVolumeData }: { hasVolumeData: boolean }) {
  const rows = await marketDataProvider.getTopMovements(100);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="Aucun mouvement de cote pour l'instant"
        description="Les cotes n'ont pas encore bougé depuis la dernière synchronisation, ou aucune cote réelle n'a encore été récupérée pour les matchs suivis."
      />
    );
  }
  return <TopMovementsTable rows={rows} hasVolumeData={hasVolumeData} />;
}
