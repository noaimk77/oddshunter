import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * MTProto client authenticated as Noaim's personal Telegram account — the
 * only way to read messages from groups the bot (grammy, bot API) was never
 * added to. Session was generated once via a manual login flow (see
 * scripts/telegram-login in the mission notes) and stored as
 * TELEGRAM_USER_SESSION; this file never triggers a new login itself.
 */
export function createUserClient(): TelegramClient {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID ?? "", 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionString = process.env.TELEGRAM_USER_SESSION;

  if (!apiId || !apiHash || !sessionString) {
    throw new Error(
      "TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_USER_SESSION ne sont pas tous configurés — le tip listener ne peut pas démarrer.",
    );
  }

  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    // 24/7 service: the MTProto link WILL drop over days of uptime (network
    // blips, Telegram DC restarts). With the old `connectionRetries: 5`,
    // gramjs gave up after 5 failed retries on a single incident and the
    // NewMessage listener died silently — the process stayed alive (so Fly
    // never restarted it) but ingested nothing until the next deploy. That
    // was the root cause of "it works today, stops firing tomorrow". Retry
    // forever with a short backoff, and keep autoReconnect on so a dropped
    // socket is re-established without human intervention. A watchdog in
    // index.ts is the backstop if even this gets wedged.
    connectionRetries: Infinity,
    retryDelay: 2000,
    autoReconnect: true,
    // One image at a time keeps memory flat on the 512MB Fly box during OCR.
    maxConcurrentDownloads: 1,
  });
}

export function isUserClientConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_USER_SESSION);
}
