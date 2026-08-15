"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPlanPrice, type PlanDisplay } from "@/lib/plans";

const PLAN_LABEL: Record<PlanDisplay["type"], string> = { VIP: "VIP Access", BOT: "Bot Access" };

function PlanCard({
  plan,
  status,
  billingConfigured,
}: {
  plan: PlanDisplay;
  status?: string;
  billingConfigured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const isActive = status === "ACTIVE";

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: plan.priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      window.alert(data.error ?? "Something went wrong starting checkout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{PLAN_LABEL[plan.type]}</h3>
        {status && (
          <Badge
            className={cn(
              "border",
              isActive
                ? "border-positive/20 bg-positive/10 text-positive"
                : "border-signal-high/20 bg-signal-high/10 text-signal-high"
            )}
          >
            {status}
          </Badge>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{formatPlanPrice(plan)}</p>
      <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

      {isActive ? (
        <p className="mt-4 text-xs text-positive">Active — manage it with &quot;Manage billing&quot; below.</p>
      ) : (
        <Button className="mt-4 w-full" disabled={!billingConfigured || loading} onClick={handleCheckout}>
          {!billingConfigured ? "Billing not configured" : loading ? "Redirecting…" : `Get ${PLAN_LABEL[plan.type]}`}
        </Button>
      )}
    </div>
  );
}

export function PlansAccess({
  plans,
  entitlements,
  billingConfigured,
  hasCustomer,
}: {
  plans: PlanDisplay[];
  entitlements: Record<string, string>;
  billingConfigured: boolean;
  hasCustomer: boolean;
}) {
  const [portalLoading, setPortalLoading] = useState(false);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      window.alert(data.error ?? "Something went wrong opening the billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No plans are configured yet.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.type} plan={plan} status={entitlements[plan.type]} billingConfigured={billingConfigured} />
        ))}
      </div>
      {hasCustomer && (
        <Button variant="outline" className="mt-4" disabled={portalLoading} onClick={handlePortal}>
          {portalLoading ? "Opening…" : "Manage billing"}
        </Button>
      )}
    </div>
  );
}
