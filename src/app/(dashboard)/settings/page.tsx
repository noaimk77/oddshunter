import { Bell, Database, Moon, Send } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

function SettingRow({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" description="Configure how Odds Hunter monitors markets and notifies you." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Data Source" className="lg:col-span-2">
          <div className="divide-y divide-border/70">
            <SettingRow
              icon={Database}
              title="Mock Market Data"
              description="Realistic simulated odds and volume, used for this preview build."
              control={<Badge className="bg-positive/10 text-positive border-positive/20">Active</Badge>}
            />
            <SettingRow
              icon={Database}
              title="Betfair Exchange"
              description="Live odds and matched volume streamed directly from Betfair."
              control={<Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>}
            />
          </div>
        </SectionCard>

        <SectionCard title="Notifications">
          <div className="divide-y divide-border/70">
            <SettingRow
              icon={Bell}
              title="In-app alerts"
              description="Show new market signals in the Alert Center."
              control={<Switch defaultChecked size="sm" />}
            />
            <SettingRow
              icon={Send}
              title="Telegram delivery"
              description="Forward high and extreme signals to a Telegram chat."
              control={<Switch disabled size="sm" />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Appearance">
          <SettingRow
            icon={Moon}
            title="Dark mode"
            description="Odds Hunter is designed dark-first for extended monitoring sessions."
            control={<Switch defaultChecked disabled size="sm" />}
          />
        </SectionCard>
      </div>
    </div>
  );
}
