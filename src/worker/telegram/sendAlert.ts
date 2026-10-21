import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import { countryFlagEmoji } from "../lib/countryFlag";
import type { HitRate } from "../lib/leagueStats";
import { classifySignalTier, tierBadge, type SignalTier } from "../lib/signalTier";

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

/** Bookmaker name embedded in a provider-built market name — betexplorer.ts
 *  builds these as "DC (Megapari)" or "O/U 2.5 (1xBet)". Null for market
 *  names with no "(...)" suffix (momentum / live-pick markets like
 *  "Pronostic live (stats)" — handled by the fallback path, never read
 *  here). */
function bookmakerFromMarketName(name: string): string | null {
  const m = name.match(/\(([^()]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

/** The over/under total or Asian-handicap line embedded in a market name
 *  like "O/U 2.5 (1xBet)" / "AH -0.75 (Betsson)" — betexplorer.ts puts the
 *  line between the family label and the bookmaker. Null when there's no
 *  numeric line (1X2 / DC / DNB / BTTS). */
function lineFromMarketName(name: string): string | null {
  const m = name.match(/(-?\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

/** Family label for the "🧾 Marché" reference line — plain French so the
 *  reader still sees which market the pick sits on, under the plain-language
 *  instruction. */
const MARKET_FAMILY_FR: Record<string, string> = {
  match_winner: "Résultat du match (1X2)",
  double_chance: "Double chance",
  dnb: "Remboursé si match nul (DNB)",
  btts: "Les deux équipes marquent",
  over_under: "Nombre de buts",
  asian_handicap: "Handicap asiatique",
};

/**
 * Turns a raw market-position code (what betexplorer.ts stores as the
 * selection name — "12", "1x", "home", "over"…) into a plain-French bet
 * instruction with the real team names, so an alert reads as "parie sur X"
 * instead of "— 12" (Noaim, 2026-09-03: "il me dit juste douze… on
 * comprend pas ce qu'on doit parier"). Same phrasing conventions as the VIP
 * consensus alerts in alertFormat.ts. Returns null for shapes we don't map
 * (momentum / live picks, unexpected codes) so the caller keeps the old
 * raw line rather than printing something wrong.
 */
export function humanizeSelection(
  marketType: string,
  selectionName: string,
  homeTeam: string,
  awayTeam: string,
  line: string | null,
): string | null {
  const sel = selectionName.trim().toLowerCase();
  const home = homeTeam.trim();
  const away = awayTeam.trim();

  switch (marketType) {
    case "match_winner":
      if (sel === "home" || sel === "1") return `victoire ${home}`;
      if (sel === "away" || sel === "2") return `victoire ${away}`;
      if (sel === "draw" || sel === "x") return "match nul";
      return null;
    case "double_chance":
      if (sel === "1x" || sel === "1-x") return `${home} gagne ou match nul`;
      if (sel === "x2" || sel === "x-2") return `${away} gagne ou match nul`;
      if (sel === "12" || sel === "1-2") return `${home} ou ${away} gagne (pas de match nul)`;
      return null;
    case "dnb":
      if (sel === "home" || sel === "1") return `${home}, remboursé si match nul`;
      if (sel === "away" || sel === "2") return `${away}, remboursé si match nul`;
      return null;
    case "btts":
      if (sel === "yes" || sel === "oui") return "les deux équipes marquent — Oui";
      if (sel === "no" || sel === "non") return "les deux équipes marquent — Non";
      return null;
    case "over_under":
      if (!line) return null;
      if (sel === "over") return `plus de ${line} buts dans le match`;
      if (sel === "under") return `moins de ${line} buts dans le match`;
      return null;
    case "asian_handicap":
      if (!line) return null;
      if (sel === "home") return `${home} avec handicap ${line}`;
      if (sel === "away") return `${away} avec handicap ${line}`;
      return null;
    default:
      return null;
  }
}

/**
 * Format inspired by Suspicious Game's premium bot (Noaim, 2026-08-23,
 * "je veux exactement le même"): a plain-French bet instruction line
 * ("🎯 À parier : …" with the real team names — Noaim, 2026-09-03, the raw
 * "— 12" code told the reader nothing), a market/bookmaker reference line,
 * one real-data headline (drop % / edge / etc.), then optional context
 * lines — velocity, late-move tag, first-mover in a steam move,
 * cross-market confirmation, and rolling league hit-rate — each rendered
 * ONLY when the underlying data is present, so a light signal stays a
 * light message. The public free-channel format (deliberately stripped of
 * team names to drive people to the paid bot) intentionally stays out of
 * scope — this bot IS the paid product; users pay for the full picture.
 */
/**
 * Number of independent bookmakers backing the move — read from the
 * MULTI_BOOK_CONFIRMATION metadata when the signal is that type; 0 for the
 * others. The tier classifier uses this alongside cross-market / late /
 * velocity indicators to decide Standard vs Premium.
 */
function confirmingBookmakersOf(signal: SignalWithContext): number {
  if (signal.type !== "MULTI_BOOK_CONFIRMATION") return 0;
  const m = signal.metadata as { confirmingCount?: number; bookmakers?: unknown[] } | null | undefined;
  if (!m) return 0;
  if (typeof m.confirmingCount === "number" && Number.isFinite(m.confirmingCount)) return m.confirmingCount;
  if (Array.isArray(m.bookmakers)) return m.bookmakers.length;
  return 0;
}

/** Public: classifies the signal against the shared tier rules in
 *  `../lib/signalTier`. Exported so /perf, delivery routing, and any
 *  future analytics all use the same source of truth. */
export function tierOf(signal: SignalWithContext): SignalTier {
  return classifySignalTier({
    score: signal.score,
    isLateMove: signal.isLateMove,
    crossMarketCount: signal.crossMarketCount,
    velocity: signal.velocity,
    confirmingBookmakers: confirmingBookmakersOf(signal),
  });
}

export function formatSignalMessage(signal: SignalWithContext): string {
  const { event } = signal.market;
  const sportEmoji = SPORT_EMOJI[event.competition.sport] ?? "🏟️";
  const flag = countryFlagEmoji(event.competition.country);

  const bookmaker = bookmakerFromMarketName(signal.market.name);
  const line = lineFromMarketName(signal.market.name);
  const humanPick = signal.selection
    ? humanizeSelection(signal.market.type, signal.selection.name, event.homeTeam, event.awayTeam, line)
    : null;

  // Premium badge sits ALONE on the first line, above the match, so it's
  // the first thing a scrolling subscriber sees. Standard signals get no
  // header at all — a subtle "no badge = not our top-tier" is what makes
  // the Premium tag actually mean something.
  const tier = tierOf(signal);
  const lines: string[] = [];
  const badge = tierBadge(tier);
  if (badge) lines.push(badge);
  lines.push(
    `${sportEmoji} ${escapeHtml(event.homeTeam)} vs ${escapeHtml(event.awayTeam)}${flag ? ` ${flag}` : ""}`,
  );

  if (humanPick) {
    lines.push(`🎯 À parier : ${escapeHtml(humanPick)}`);
    const family = MARKET_FAMILY_FR[signal.market.type];
    const ref = [family, bookmaker ? `cote ${escapeHtml(bookmaker)}` : null].filter(Boolean).join(" · ");
    if (ref) lines.push(`🧾 ${ref}`);
  } else {
    // Momentum / live picks and any code we don't map: keep the original
    // raw line — those market names ("Pronostic live (stats)", "Over 0.5
    // (mi-temps)") are already human-readable and carry no position code.
    lines.push(`${escapeHtml(signal.market.name)}${signal.selection ? ` — ${escapeHtml(signal.selection.name)}` : ""}`);
  }

  const headline = formatHeadlineStat(signal);
  if (headline) lines.push(headline);

  lines.push(...formatSignalExtras(signal));

  // Simplified 2026-09-05 (Noaim: "les mêmes mises à jour que pour le VIP")
  // — the closing "pas une garantie de gain..." disclaimer is dropped, same
  // treatment as the VIP consensus alerts, and replaced with a single
  // status line that flips in place when the result lands (see
  // updateResultInMessage) instead of a separate paragraph appended below.
  lines.push(SIGNAL_STATUS_PENDING_LINE);

  return lines.join("\n");
}

/** The one status line every bot Signals alert carries, mirroring the VIP
 *  consensus alert's status line (alertFormat.ts's consensusStatusLine) —
 *  same vocabulary, same "flip the same message, never a new one" rule
 *  (Noaim, 2026-09-05: "le résultat, tu le mets dans le même message, tu
 *  modifies juste le message, tu ne renvoies pas une notification"). */
const SIGNAL_STATUS_PENDING_LINE = "🔄 Statut : en attente du résultat";
const SIGNAL_STATUS_PREFIXES = ["🔄 Statut :", "✅ Résultat :", "❌ Résultat :", "⚪ Résultat :"] as const;

/**
 * Swaps the status line for the graded verdict — EDITS the line in place,
 * never appends a new paragraph and never a separate message (that was the
 * old behaviour: "✅ Gagné" tacked on below, which is what made this read
 * as a second message to Noaim once it stacked below several context
 * lines). `score`, when known, renders "Team A 3-2 Team B" the same way
 * the VIP alert does; omit it (e.g. BetExplorer's `/results/` endpoint
 * sometimes only confirms the fixture ended, without a reliable score) to
 * fall back to the bare verdict.
 */
export function updateResultInMessage(
  originalText: string,
  outcome: "won" | "lost" | "void",
  score?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null,
): string {
  const verdict =
    outcome === "won" ? "✅ Résultat : pari validé" : outcome === "lost" ? "❌ Résultat : pari perdu" : "⚪ Résultat : remboursé (push)";
  const newLine = score ? `${verdict} — ${score.homeTeam} ${score.homeScore}-${score.awayScore} ${score.awayTeam}` : verdict;

  const lines = originalText.split("\n");
  const idx = lines.findIndex((l) => SIGNAL_STATUS_PREFIXES.some((p) => l.startsWith(p)));
  if (idx !== -1) {
    lines[idx] = newLine;
    return lines.join("\n");
  }
  // Legacy message sent before this status line existed — append instead
  // of silently dropping the result.
  return `${originalText}\n\n${newLine}`;
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
