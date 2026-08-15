"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updatePreferencesAction, type PreferencesState } from "@/app/(dashboard)/account/preferences-actions";

const initialState: PreferencesState = {};

interface Preferences {
  oddsFormat: string;
  currency: string;
  timezone: string;
  inAppAlerts: boolean;
}

const TIMEZONES = ["Europe/Paris", "Europe/London", "America/New_York", "UTC"];

export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const [state, formAction, pending] = useActionState(updatePreferencesAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Odds format</Label>
          <Select name="oddsFormat" defaultValue={preferences.oddsFormat}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="decimal">Decimal</SelectItem>
              <SelectItem value="fractional">Fractional</SelectItem>
              <SelectItem value="american">American</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select name="currency" defaultValue={preferences.currency}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="GBP">GBP (£)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Timezone</Label>
          <Select name="timezone" defaultValue={preferences.timezone}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2.5">
        <div>
          <p className="text-sm text-foreground">In-app alerts</p>
          <p className="text-xs text-muted-foreground">Show new market signals in the Alert Center.</p>
        </div>
        <Switch name="inAppAlerts" defaultChecked={preferences.inAppAlerts} size="sm" />
      </div>

      {state.success && <p className="text-xs text-positive">Preferences saved.</p>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
