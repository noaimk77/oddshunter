import { CheckCircle2, XCircle } from "lucide-react";
import { formatClock } from "@/lib/format";

export interface SyncJournalData {
  ok: boolean;
  startedAt: string;
  finishedAt: string | null;
  fixturesSynced: number;
  competitionsSynced: number;
  oddsFetched: number;
  requestsUsed: number;
  errorMessage: string | null;
}

/**
 * The technical journal requested alongside the sync rework: last outcome,
 * counts, errors — read straight from SyncLog, never the API key (this
 * component never receives it, so there's nothing to leak even by mistake).
 */
export function SyncJournal({ log }: { log: SyncJournalData | null }) {
  if (!log) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-4 py-3 text-xs text-muted-foreground">
        Aucune synchronisation n&apos;a encore été exécutée.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/70 bg-card/40 px-4 py-3 text-xs">
      <div className="flex items-center gap-1.5">
        {log.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-signal-high" />
        )}
        <span className="font-medium text-foreground">{log.ok ? "Dernière synchro réussie" : "Dernière synchro en erreur"}</span>
        <span className="text-muted-foreground">à {formatClock(log.startedAt)}</span>
      </div>
      <span className="text-muted-foreground">
        <span className="font-mono text-foreground">{log.fixturesSynced}</span> matchs
      </span>
      <span className="text-muted-foreground">
        <span className="font-mono text-foreground">{log.competitionsSynced}</span> compétitions
      </span>
      <span className="text-muted-foreground">
        <span className="font-mono text-foreground">{log.oddsFetched}</span> cotes récupérées
      </span>
      <span className="text-muted-foreground">
        <span className="font-mono text-foreground">{log.requestsUsed}</span> requêtes API utilisées
      </span>
      {log.errorMessage && <span className="text-signal-high">{log.errorMessage}</span>}
    </div>
  );
}
