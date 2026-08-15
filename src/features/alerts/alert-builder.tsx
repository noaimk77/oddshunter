"use client";

import { useState } from "react";
import { Bell, Mail, Plus, Send, Smartphone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SPORT_LABELS } from "@/features/scanner/filter-types";
import type { FilterOptions } from "@/services";
import type { Sport } from "@/types";

const CHANNELS = [
  { id: "web", label: "Web Alert", icon: Bell, available: true },
  { id: "telegram", label: "Telegram Alert", icon: Send, available: false },
  { id: "email", label: "Email Alert", icon: Mail, available: false },
  { id: "push", label: "Push Notification", icon: Smartphone, available: false },
] as const;

const CONDITIONS = [
  { value: "ODDS_DROP_PERCENT", label: "Odds drop", unit: "%" },
  { value: "ODDS_RISE_PERCENT", label: "Odds rise", unit: "%" },
  { value: "MATCHED_VOLUME_ABOVE", label: "Matched volume above", unit: "€" },
  { value: "MONEYWAY_PERCENT_ABOVE", label: "Moneyway concentration above", unit: "%" },
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function AlertBuilder({ options, onCreated }: { options: FilterOptions; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [sport, setSport] = useState<Sport | "all">("all");
  const [competition, setCompetition] = useState("all");
  const [marketType, setMarketType] = useState("all");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]["value"]>("ODDS_DROP_PERCENT");
  const [threshold, setThreshold] = useState("10");
  const [timeWindowMin, setTimeWindowMin] = useState("");
  const [matchPhase, setMatchPhase] = useState<"any" | "preMatch" | "live">("any");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["id"]>("web");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conditionMeta = CONDITIONS.find((c) => c.value === condition)!;

  const reset = () => {
    setSport("all");
    setCompetition("all");
    setMarketType("all");
    setCondition("ODDS_DROP_PERCENT");
    setThreshold("10");
    setTimeWindowMin("");
    setMatchPhase("any");
    setName("");
    setError(null);
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${conditionMeta.label} ${threshold}${conditionMeta.unit}`,
          sport: sport === "all" ? undefined : sport,
          competition: competition === "all" ? undefined : competition,
          marketType: marketType === "all" ? undefined : marketType,
          condition,
          threshold: Number(threshold),
          timeWindowMin: timeWindowMin ? Number(timeWindowMin) : undefined,
          preMatchOnly: matchPhase === "preMatch",
          liveOnly: matchPhase === "live",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save that alert rule.");
        return;
      }
      reset();
      setOpen(false);
      onCreated?.();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        New Alert Rule
      </Button>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto border-border/70 bg-popover">
        <SheetHeader>
          <SheetTitle>New Alert Rule</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <Field label="Name (optional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${conditionMeta.label} ${threshold}${conditionMeta.unit}`}
              className="h-9"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport">
              <Select value={sport} onValueChange={(v) => setSport((v ?? "all") as Sport | "all")}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any sport</SelectItem>
                  {options.sports.map((s) => (
                    <SelectItem key={s} value={s}>{SPORT_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Competition">
              <Select value={competition} onValueChange={(v) => setCompetition(v ?? "all")}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any competition</SelectItem>
                  {options.competitions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Market">
              <Select value={marketType} onValueChange={(v) => setMarketType(v ?? "all")}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any market</SelectItem>
                  {options.marketNames.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Match phase">
              <Select value={matchPhase} onValueChange={(v) => setMatchPhase((v ?? "any") as typeof matchPhase)}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Pre-match & live</SelectItem>
                  <SelectItem value="preMatch">Pre-match only</SelectItem>
                  <SelectItem value="live">Live only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <Select value={condition} onValueChange={(v) => v && setCondition(v as typeof condition)}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Threshold (${conditionMeta.unit})`}>
              <Input
                type="number"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="Time window (minutes, optional)">
              <Input
                type="number"
                min="1"
                placeholder="e.g. 15"
                value={timeWindowMin}
                onChange={(e) => setTimeWindowMin(e.target.value)}
                className="h-9"
              />
            </Field>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Delivery channel</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const active = channel === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.available}
                    onClick={() => c.available && setChannel(c.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      active ? "border-gold/40 bg-gold/10 text-gold" : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{c.label}</span>
                    {!c.available && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground">
                        Soon
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-signal-extreme">{error}</p>}

          <Button className="w-full" disabled={submitting} onClick={handleSave}>
            {submitting ? "Saving…" : "Save Alert Rule"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
