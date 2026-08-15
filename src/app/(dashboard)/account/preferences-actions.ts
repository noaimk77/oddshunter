"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { fieldErrorsFrom } from "@/lib/validation";

const preferencesSchema = z.object({
  oddsFormat: z.enum(["decimal", "fractional", "american"]),
  currency: z.enum(["EUR", "GBP", "USD"]),
  timezone: z.string().min(1),
  inAppAlerts: z.coerce.boolean(),
});

export interface PreferencesState {
  success?: boolean;
  fieldErrors?: Record<string, string>;
}

export async function updatePreferencesAction(_prev: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const user = await requireAuth();

  const parsed = preferencesSchema.safeParse({
    oddsFormat: formData.get("oddsFormat"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    inAppAlerts: formData.get("inAppAlerts") === "on",
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await db.user.update({ where: { id: user.id }, data: parsed.data });
  return { success: true };
}
