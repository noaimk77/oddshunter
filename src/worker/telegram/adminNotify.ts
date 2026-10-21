/**
 * Best-effort DM to Noaim via the private autobet bot (same token/chat as
 * ./autobetBot.ts, but a plain HTTP call — no grammy Bot instance needed,
 * so this works even if the long-poll bot isn't running). Never throws:
 * a notification failure must not take down the caller.
 *
 * Built for the trusted single-source esports channel ("Vip ESPORTS"):
 * unlike a 2-group consensus, a single-source pick has no second tip to
 * re-trigger a retry if `applyConsensusAndAlert` bails (quality gate,
 * suppressed as finished/in-play, or the VIP send itself failing) — before
 * this, that pick just vanished with nothing but a `console.log` line no
 * one was watching (confirmed case: "Bushido Wildcats vs Leo", 2026-09-28,
 * scraped but no ConsensusAlert/AutobetTicket row at all). Noaim can now
 * act on it manually the moment it happens instead of finding out when the
 * match is already over.
 */
export async function notifyAutobetAdmin(text: string): Promise<void> {
  const token = process.env.AUTOBET_BOT_TOKEN;
  const chatId = process.env.AUTOBET_ADMIN_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`[adminNotify] Telegram sendMessage HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[adminNotify] failed to reach Telegram:", err);
  }
}
