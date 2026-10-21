import { AgentMailClient } from "agentmail";

/**
 * Constructed lazily, same reasoning as src/lib/stripe.ts: throwing at
 * import time would crash every page that imports this file, including
 * ones that correctly check `isEmailConfigured()` first.
 */
let client: AgentMailClient | null = null;

function getClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_AGENTMAIL_API_KEY;
  if (!apiKey) {
    throw new Error("AGENTMAIL_AGENTMAIL_API_KEY is not set — check isEmailConfigured() before sending email.");
  }
  if (!client) client = new AgentMailClient({ apiKey });
  return client;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_AGENTMAIL_API_KEY && process.env.AGENTMAIL_INBOX_ID);
}

/**
 * Sends the password-reset link as real email via AgentMail (provisioned
 * through Stripe Projects, free tier). Callers must check
 * isEmailConfigured() first and fall back to the dev-mode on-screen link
 * when it's false — this function assumes both env vars are present.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const inboxId = process.env.AGENTMAIL_INBOX_ID!;
  await getClient().inboxes.messages.send(inboxId, {
    to: [to],
    subject: "Reset your Odds Hunter password",
    text: `Reset your password by opening this link (valid for 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Reset your Odds Hunter password by clicking the link below. This link is valid for 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });
}

/** Reminder that a prepaid crypto month ends soon, with the page to renew. */
export async function sendCryptoRenewalReminder(to: string, plan: string, endsAt: Date, accountUrl: string): Promise<void> {
  const inboxId = process.env.AGENTMAIL_INBOX_ID!;
  const date = endsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  await getClient().inboxes.messages.send(inboxId, {
    to: [to],
    subject: `Ton accès Odds Hunter ${plan} se termine le ${date}`,
    text: `Ton mois payé en crypto se termine le ${date}. Pour garder ton accès, renouvelle-le depuis ton compte :\n\n${accountUrl}\n\nSans paiement, l'accès s'arrête automatiquement à cette date.`,
    html: `<p>Ton mois payé en crypto se termine le <strong>${date}</strong>.</p><p>Pour garder ton accès, renouvelle-le depuis ton compte : <a href="${accountUrl}">${accountUrl}</a></p><p>Sans paiement, l'accès s'arrête automatiquement à cette date.</p>`,
  });
}
