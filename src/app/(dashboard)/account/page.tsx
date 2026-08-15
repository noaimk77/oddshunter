import { Building2, Mail, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { isStripeConfigured } from "@/lib/stripe";
import { getPlanDisplays } from "@/lib/plans";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { PreferencesForm } from "@/features/account/preferences-form";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { LogoutButton } from "@/features/account/logout-button";
import { PlansAccess } from "@/features/billing/plans-access";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export default async function AccountPage() {
  const sessionUser = await requireAuth();
  const [user, entitlementRows, plans] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: sessionUser.id } }),
    db.entitlement.findMany({ where: { userId: sessionUser.id } }),
    getPlanDisplays(),
  ]);

  const entitlements = Object.fromEntries(entitlementRows.map((e) => [e.type, e.status]));

  return (
    <div>
      <PageHeader eyebrow="Account" title="Account" description="Your Odds Hunter workspace and access level." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Profile" className="lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold/10 font-mono text-lg font-semibold text-gold ring-1 ring-gold/25">
                {initials(user.email)}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Member since {user.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
            <LogoutButton />
          </div>

          <div className="mt-6 divide-y divide-border/70 border-t border-border/70">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" /> Email
              </span>
              <span className="text-sm text-foreground">{user.email}</span>
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
              <span className="text-sm text-foreground">
                {entitlementRows.some((e) => e.status === "ACTIVE") ? "Subscriber" : "Free"}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Change Password">
          <ChangePasswordForm />
        </SectionCard>

        <SectionCard title="Preferences" className="lg:col-span-2">
          <PreferencesForm
            preferences={{
              oddsFormat: user.oddsFormat,
              currency: user.currency,
              timezone: user.timezone,
              inAppAlerts: user.inAppAlerts,
            }}
          />
        </SectionCard>

        <SectionCard title="Plans & Access" description="VIP and Bot access, billed by Stripe." className="lg:col-span-3">
          <PlansAccess
            plans={plans}
            entitlements={entitlements}
            billingConfigured={isStripeConfigured()}
            hasCustomer={Boolean(user.stripeCustomerId)}
          />
        </SectionCard>
      </div>
    </div>
  );
}
