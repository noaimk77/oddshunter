import { marketDataProvider } from "@/services";
import { db } from "@/lib/db";
import { PROVIDER_NAME } from "@/services/api-football-sync";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { LiveDataUnavailable } from "@/components/shared/live-data-unavailable";
import { FixturesView } from "@/features/fixtures/fixtures-view";
import { SyncJournal, type SyncJournalData } from "@/features/fixtures/sync-journal";
import { SyncNowButton } from "@/features/fixtures/sync-now-button";

export default async function FixturesPage() {
  const status = await marketDataProvider.getStatus();
  const isDemo = status.providerName === "mock-dev";
  const isApiFootball = status.providerName === "api-football";

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
        description="Tous les matchs réellement accessibles via l'API, regroupés par pays et compétition — aucune compétition n'est filtrée à l'avance."
        action={isApiFootball ? <SyncNowButton /> : undefined}
      />
      {isApiFootball && (
        <div className="mb-4">
          <SyncJournal log={await getLatestSyncLog()} />
        </div>
      )}
      {status.available ? <FixturesBody isDemo={isDemo} /> : <LiveDataUnavailable />}
    </div>
  );
}

async function FixturesBody({ isDemo }: { isDemo: boolean }) {
  const rows = await marketDataProvider.getFixtures();
  return <FixturesView rows={rows} isDemo={isDemo} />;
}

async function getLatestSyncLog(): Promise<SyncJournalData | null> {
  const provider = await db.provider.findUnique({ where: { name: PROVIDER_NAME } });
  if (!provider) return null;
  const log = await db.syncLog.findFirst({ where: { providerId: provider.id }, orderBy: { startedAt: "desc" } });
  if (!log) return null;
  return {
    ok: log.ok,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt?.toISOString() ?? null,
    fixturesSynced: log.fixturesSynced,
    competitionsSynced: log.competitionsSynced,
    oddsFetched: log.oddsFetched,
    requestsUsed: log.requestsUsed,
    errorMessage: log.errorMessage,
  };
}
