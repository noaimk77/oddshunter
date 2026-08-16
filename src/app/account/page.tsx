import { Building2, Mail, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { isStripeConfigured } from "@/lib/stripe";
import { getPlanDisplays } from "@/lib/plans";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { LogoutButton } from "@/features/account/logout-button";
import { PlansAccess } from "@/features/billing/plans-access";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";

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
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <PageHeader eyebrow="Compte" title="Mon compte" description="Ton profil et tes abonnements Odds Hunter." />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Profil" className="lg:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold/10 font-mono text-lg font-semibold text-gold ring-1 ring-gold/25">
                  {initials(user.email)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Membre depuis {user.createdAt.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
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
                  <Building2 className="h-4 w-4" /> Espace
                </span>
                <span className="text-sm text-foreground">Personnel</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" /> Statut
                </span>
                <span className="text-sm text-foreground">
                  {entitlementRows.some((e) => e.status === "ACTIVE") ? "Abonné" : "Aucun abonnement actif"}
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Changer le mot de passe">
            <ChangePasswordForm />
          </SectionCard>

          <SectionCard title="Abonnements" description="Groupe VIP et Bot, facturés par Stripe." className="lg:col-span-3">
            <PlansAccess
              plans={plans}
              entitlements={entitlements}
              billingConfigured={isStripeConfigured()}
              hasCustomer={Boolean(user.stripeCustomerId)}
            />
          </SectionCard>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
