import { Building2, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ACCOUNT_EMAIL = "noaim.k77@gmail.com";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export default function AccountPage() {
  return (
    <div>
      <PageHeader eyebrow="Account" title="Account" description="Your OddScope workspace and access level." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-lg font-semibold text-primary ring-1 ring-primary/25">
              {initials(ACCOUNT_EMAIL)}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{ACCOUNT_EMAIL}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">Professional</Badge>
                <Badge variant="outline" className="text-muted-foreground">Preview build</Badge>
              </div>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border/70 border-t border-border/70">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" /> Email
              </span>
              <span className="text-sm text-foreground">{ACCOUNT_EMAIL}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" /> Workspace
              </span>
              <span className="text-sm text-foreground">Personal</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Access level
              </span>
              <span className="text-sm text-foreground">Administrator</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Billing">
          <p className="text-sm text-muted-foreground">
            Payments and plan management aren&apos;t part of this preview build yet.
          </p>
          <Button variant="outline" disabled className="mt-4 w-full">
            Manage billing — coming soon
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}
