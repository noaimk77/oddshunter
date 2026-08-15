"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { FilterOptions } from "@/services";
import { AlertBuilder } from "./alert-builder";

interface AlertRuleDto {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  sport?: string | null;
  competition?: string | null;
  _count?: { triggers: number };
}

const CONDITION_LABEL: Record<string, string> = {
  ODDS_DROP_PERCENT: "odds drop >",
  ODDS_RISE_PERCENT: "odds rise >",
  MATCHED_VOLUME_ABOVE: "matched volume >",
  MONEYWAY_PERCENT_ABOVE: "moneyway >",
};

const CONDITION_UNIT: Record<string, string> = {
  ODDS_DROP_PERCENT: "%",
  ODDS_RISE_PERCENT: "%",
  MATCHED_VOLUME_ABOVE: "€",
  MONEYWAY_PERCENT_ABOVE: "%",
};

export function AlertRulesPanel({ options }: { options: FilterOptions }) {
  const [rules, setRules] = useState<AlertRuleDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(() => {
    return fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => setRules(Array.isArray(d.rules) ? d.rules : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const toggleRule = async (id: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
  };

  const deleteRule = async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/alerts/${id}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Alert Rules</h2>
        <AlertBuilder options={options} onCreated={refresh} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          No alert rules yet — create one to get notified automatically once live data is connected.
        </p>
      ) : (
        <div className="divide-y divide-border/70 rounded-lg border border-border/70">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{rule.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {CONDITION_LABEL[rule.condition]} {rule.threshold}
                  {CONDITION_UNIT[rule.condition]}
                  {rule.sport ? ` · ${rule.sport}` : ""}
                  {rule.competition ? ` · ${rule.competition}` : ""} · {rule._count?.triggers ?? 0} triggers
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={rule.enabled} onCheckedChange={(v) => toggleRule(rule.id, Boolean(v))} size="sm" />
                <Button variant="ghost" size="icon-sm" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
