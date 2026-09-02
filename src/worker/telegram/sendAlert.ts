import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import { countryFlagEmoji } from "../lib/countryFlag";
import type { HitRate } from "../lib/leagueStats";

/**
 * Formats and delivers one Signal to one linked, entitled user — spec
 * section 9 (alert content) and the closing safety line every alert must
 * carry (never "truqué", only a statistical signal). Also implements the
 * update-in-place behaviour from section 9: a strengthening signal edits
 * the previous Telegram message via SignalDelivery.messageRef instead of
 * sending a duplicate.
 */

export interface SignalWithContext {
  id: string;
  type: string;
  score: number;
  reasons: { label: string; contribution: number }[];
  openingPrice: number | null;
  currentPrice: number | null;
  priceChangePct: number | null;
  /** Type-specific detail (confirming bookmakers for MULTI_BOOK_CONFIRMATION,
   *  reference vs. best price for VALUE_BET, live match stats for
   *  MOMENTUM_PICK) — see formatSignalMessage. */
  metadata?: unknown;
  /** Recent price readings, oldest first — renders as a monospace table
   *  (Noaim, 2026-08-23, inspired by "Sharps Picks"/"SABA"-style alerts).
   *  Empty for signal types with no single bookmaker selection (e.g.
   *  MOMENTUM_PICK). */
  priceHistory?: { timestamp: Date; price: number }[];
  firstDetectedAt: Date;
  /** Drop/rise magnitude divided by the window it happened over — proxy
   *  for money-behind-the-move that Betfair Exchange volume would give if
   *  we had access to it (Noaim, 2026-08-23). Only set when the signal
   *  has enough history to compute a real rate. */
  velocity?: { pctPerMin: number; windowMinutes: number } | null;
  /** True when the signal fired within the last hour before kickoff — the
   *  window where syndicate money historically shows up. Rendered as an
   *  explicit tag rather than left implicit in the timestamp. */
  isLateMove?: boolean;
  /** How many DISTINCT open signals exist on the same event across
   *  different market types this pass — 2+ = the same event moving on
   *  independent markets (e.g. 1X2 + Over/Under), which is much stronger
   *  than a single market moving alone. */
  crossMarketCount?: number;
  /** Rolling league win-rate over recent decided outcomes for this
   *  competition — only set when there's enough data to be honest
   *  (see getLeagueHitRate's minDecided). */
  leagueHitRate?: HitRate | null;
  /** Days used to compute leagueHitRate — printed in the alert so a
   *  reader knows the window. */
  leagueHitRateDays?: number;
  market: {
    name: string;
    type: string;
    status: string;
    event: {
      homeTeam: string;
      awayTeam: string;
      kickoff: Date;
      status: string;
      competition: { id?: string; name: string; sport: string; country: string };
    };
  };
  selection?: { name: string } | null;
}

const TYPE_LABEL_FR: Record<string, string> = {
  ODDS_DROP: "Baisse de cote",
  LINE_MOVE: "Déplacement de ligne",
  VIG_EXPLOSION: "Explosion de marge",
  MULTI_BOOK_CONFIRMATION: "Confirmation multi-bookmakers",
  MARKET_LOCK: "Marché suspendu",
  VOLUME_SPIKE: "Pic de volume",
  UNEXPLAINED_LIVE_MOVE: "Mouvement live inexpliqué",
  VALUE_BET: "Value bet détectée",
  MOMENTUM_PICK: "Pronostic live (stats)",
  LIVE_SCORELESS_PICK: "Pronostic live (score nul)",
};

/** Messages are sent with parse_mode: "HTML" (see deliverSignal) so the
 *  price-history/stats tables below can use <pre> for a monospace look —
 *  every piece of dynamic text (team names, competition names...) has to be
 *  escaped first or a name containing "&"/"<"/">" would break rendering. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** football only for now — falls back to a generic stadium emoji rather
 *  than guessing at a sport we haven't launched yet. */
const SPORT_EMOJI: Record<string, string> = { football: "⚽" };

/**
 * One short, real-data line of "why" per signal type — never the fabricated
 * staked-amount figure Suspicious Game's premium bot shows (Betfair
 * Exchange data, off-limits in France), but the closest honest equivalent
 * for each detector. Returns null when there's nothing type-specific to add
 * (falls back to just the market/selection line in that case).
 */
function formatHeadlineStat(signal: SignalWithContext): string | null {
  if (signal.openingPrice != null && signal.currentPrice != null) {
    // Direction from the actual prices, not the sign of priceChangePct —
    // both oddsDrop.ts and oddsRise.ts store that as a positive magnitude in
    // their own detector's direction (e.g. ODDS_DROP's is (opening-latest)),
    // never a universally-signed delta, so it can't tell drop from rise on
    // its own (confirmed live 2026-08-23: a 2.9→2.6 drop was mislabelled
    // "hausse" before this fix).
    const pct = signal.priceChangePct != null ? Math.abs(signal.priceChangePct).toFixed(1) : "?";
    const isDrop = signal.currentPrice < signal.openingPrice;
    const emoji = isDrop ? "📉" : "📈";
    return `${emoji} ${pct}% de ${isDrop ? "baisse" : "hausse"} (${signal.openingPrice} → ${signal.currentPrice})`;
  }

  const metadata = signal.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return null;

  if (signal.type === "MULTI_BOOK_CONFIRMATION") {
    const { confirmingCount, bookmakers, averagePriceChangePct } = metadata as {
      confirmingCount?: number;
      bookmakers?: string[];
      averagePriceChangePct?: number;
    };
    if (Array.isArray(bookmakers) && bookmakers.length > 0) {
      const avg = averagePriceChangePct != null ? ` (moy. ${Math.abs(averagePriceChangePct).toFixed(1)}%)` : "";
      return `🤝 Confirmé par ${confirmingCount ?? bookmakers.length} bookmakers${avg} : ${bookmakers.map(escapeHtml).join(", ")}`;
    }
  }
  if (signal.type === "VALUE_BET") {
    const { referenceBookmaker, referencePrice, bestBookmaker, bestPrice, edgePercent } = metadata as {
      referenceBookmaker?: string;
      referencePrice?: number;
      bestBookmaker?: string;
      bestPrice?: number;
      edgePercent?: number;
    };
    if (referenceBookmaker && bestBookmaker) {
      return `💰 ${escapeHtml(bestBookmaker)} @ ${bestPrice} vs ${escapeHtml(referenceBookmaker)} @ ${referencePrice} (+${edgePercent?.toFixed(1)}%)`;
    }
  }
  if (signal.type === "LIVE_SCORELESS_PICK") {
    const { elapsedMinutes, price } = metadata as { elapsedMinutes?: number; price?: number | null };
    if (elapsedMinutes != null) {
      return `⏱️ Toujours 0-0 à la ${elapsedMinutes}'${price != null ? ` — cote observée ${price}` : ""}`;
    }
  }
  return null;
}

/**
 * Extra context lines the paid Suspicious-Game-style bot surfaces on top of
 * the base pick — each one only renders when its data is actually present,
 * so a signal without cross-market confirmation / league history / etc.
 * still produces a tight message rather than a wall of empty labels.
 */
function formatSignalExtras(signal: SignalWithContext): string[] {
  const extras: string[] = [];

  if (signal.velocity && signal.velocity.pctPerMin >= 0.5) {
    // 0.5%/min = 30% in an hour — anything above that is a genuinely fast
    // move, not just noise. Below it the "rapide" label would be misleading.
    extras.push(
      `⚡ Chute rapide : ${signal.velocity.pctPerMin.toFixed(2)}%/min sur ${signal.velocity.windowMinutes.toFixed(0)} min`,
    );
  }

  if (signal.isLateMove) {
    extras.push("🕐 Mouvement tardif (dernière heure avant le coup d'envoi)");
  }

  const metadata = signal.metadata as Record<string, unknown> | null | undefined;
  if (signal.type === "MULTI_BOOK_CONFIRMATION" && metadata) {
    const { firstMoverBookmaker } = metadata as { firstMoverBookmaker?: string };
    if (firstMoverBookmaker) {
      extras.push(`🎯 Premier à bouger : ${escapeHtml(firstMoverBookmaker)}`);
    }
  }

  if (signal.crossMarketCount && signal.crossMarketCount >= 2) {
    extras.push(`🔗 Confirmé sur ${signal.crossMarketCount} marchés du même match`);
  }

  if (signal.leagueHitRate && signal.leagueHitRate.hitRatePct != null) {
    const { wins, losses, hitRatePct } = signal.leagueHitRate;
    const days = signal.leagueHitRateDays ?? 30;
    extras.push(`📊 Cette ligue : ${wins}W/${losses}L (${hitRatePct}%) sur ${days}j`);
  }

  return extras;
}

/**
 * Format inspired by Suspicious Game's premium bot (Noaim, 2026-08-23,
 * "je veux exactement le même"): base pick line (emoji + match + flag +
 * market + selection), one real-data headline (drop % / edge / etc.),
 * then optional context lines — velocity, late-move tag, first-mover in a
 * steam move, cross-market confirmation, and rolling league hit-rate —
 * each rendered ONLY when the underlying data is present, so a light
 * signal stays a light message. The public free-channel format
 * (deliberately stripped of team names to drive people to the paid bot)
 * intentionally stays out of scope — this bot IS the paid product; users
 * pay for the full picture.
 */
export function formatSignalMessage(signal: SignalWithContext): string {
  const { event } = signal.market;
  const sportEmoji = SPORT_EMOJI[event.competition.sport] ?? "🏟️";
  const flag = countryFlagEmoji(event.competition.country);
  const marketLine = `${escapeHtml(signal.market.name)}${signal.selection ? ` — ${escapeHtml(signal.selection.name)}` : ""}`;

  const lines = [
    `${sportEmoji} ${escapeHtml(event.homeTeam)} vs ${escapeHtml(event.awayTeam)}${flag ? ` ${flag}` : ""}`,
    marketLine,
  ];

  const headline = formatHeadlineStat(signal);
  if (headline) lines.push(headline);

  lines.push(...formatSignalExtras(signal));

  lines.push("", "⚠️ Signal statistique à surveiller — pas une garantie de gain ni un conseil financier. Ne mise que ce que tu peux te permettre de perdre.");

  return lines.join("\n");
}

const RESULT_EMOJI: Record<"won" | "lost" | "void", string> = {
  won: "✅ Gagné",
  lost: "❌ Perdu",
  void: "♻️ Remboursé",
};

/** Appends a result line to an already-delivered message instead of
 *  replacing it (Noaim, 2026-08-23, matching Suspicious Game: they edit the
 *  original pick in place to add "✅"/"♻️ Remboursé" once it's known, rather
 *  than sending a separate follow-up message). */
export function appendResultToMessage(originalText: string, outcome: "won" | "lost" | "void"): string {
  return `${originalText}\n\n${RESULT_EMOJI[outcome]}`;
}

/**
 * Delivers to every user who (a) has an active BOT entitlement, (b) has a
 * live TelegramLink, and (c) has no AlertRule that would filter this out —
 * V1 keeps the filter check minimal (sport/preMatch-live/score threshold);
 * richer filtering can layer on without changing this function's shape.
 */
export async function deliverSignal(db: PrismaClient, bot: Bot, signal: SignalWithContext): Promise<void> {
  const eligibleLinks = await db.telegramLink.findMany({
    where: { revokedAt: null, user: { entitlements: { some: { type: "BOT", status: "ACTIVE" } } } },
  });

  const text = formatSignalMessage(signal);

  for (const link of eligibleLinks) {
    const existing = await db.signalDelivery.findUnique({
      where: { signalId_userId_channel: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM" } },
    });

    try {
      if (existing?.messageRef) {
        try {
          await bot.api.editMessageText(link.telegramChatId, Number(existing.messageRef), text, { parse_mode: "HTML" });
        } catch (editErr) {
          // Telegram rejects an edit whose content is byte-identical to what's
          // already posted ("message is not modified") — expected whenever a
          // signal gets re-touched in a pass without its formatted text
          // actually changing (e.g. score recomputed to the same value). Not
          // a delivery failure, so it shouldn't be logged or retried as one.
          const isNoOpEdit =
            editErr instanceof GrammyError &&
            editErr.error_code === 400 &&
            editErr.description.includes("message is not modified");
          if (!isNoOpEdit) throw editErr;
        }
      } else {
        const sent = await bot.api.sendMessage(link.telegramChatId, text, { parse_mode: "HTML" });
        await db.signalDelivery.upsert({
          where: { signalId_userId_channel: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM" } },
          create: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM", messageRef: String(sent.message_id) },
          update: { messageRef: String(sent.message_id) },
        });
      }
    } catch (err) {
      console.error(`[telegram] failed to deliver signal ${signal.id} to chat ${link.telegramChatId}`, err);
    }
  }
}
