import { Send } from "lucide-react";
import { marketDataProvider } from "@/services";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AlertFeed } from "@/features/alerts/alert-feed";

export default async function AlertsPage() {
  const alerts = await marketDataProvider.getAlerts();

  return (
    <div>
      <PageHeader
        eyebrow="Alert Center"
        title="Alert History"
        description="Every market anomaly OddScope has flagged, most recent first."
        action={
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
            <Send className="h-3.5 w-3.5" />
            Telegram delivery — coming soon
          </div>
        }
      />
      <SectionCard bodyClassName="p-2 sm:p-3">
        <AlertFeed alerts={alerts} />
      </SectionCard>
    </div>
  );
}
