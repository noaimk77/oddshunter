import type { ReactNode } from "react";
import { Activity, Bell, Radar } from "lucide-react";
import { Wordmark } from "@/components/shared/wordmark";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";

const CAPABILITIES = [
  { icon: Radar, label: "Market scanning across every monitored competition" },
  { icon: Activity, label: "Odds movement, matched volume, and money flow" },
  { icon: Bell, label: "Custom alert rules on price and volume anomalies" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden border-r border-border/70 bg-surface-1 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--color-gold) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <Wordmark />
        </div>

        <div className="relative flex flex-1 items-center justify-center py-16">
          <OddsHunterMascot />
        </div>

        <div className="relative space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Market intelligence terminal
          </p>
          <ul className="space-y-2.5">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 lg:hidden">
          <Wordmark />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
