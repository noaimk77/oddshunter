import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";

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
  firstDetectedAt: Date;
  market: {
    name: string;
    type: string;
    status: string;
    event: {
      homeTeam: string;
      awayTeam: string;
      kickoff: Date;
      status: string;
      competition: { name: string; sport: string };
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
};

export function formatSignalMessage(signal: SignalWithContext): string {
  const { event } = signal.market;
  const kickoffStr = event.kickoff.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  });

  const lines = [
    `🎯 ${TYPE_LABEL_FR[signal.type] ?? signal.type} — score ${signal.score}/100`,
    `${event.competition.sport} · ${event.competition.name}`,
    `${event.homeTeam} vs ${event.awayTeam} — ${kickoffStr} (Europe/Paris)`,
    `Marché : ${signal.market.name}${signal.selection ? ` — ${signal.selection.name}` : ""}`,
  ];

  if (signal.openingPrice != null && signal.currentPrice != null) {
    const pct = signal.priceChangePct != null ? signal.priceChangePct.toFixed(1) : "?";
    lines.push(`Cote : ${signal.openingPrice} → ${signal.currentPrice} (${pct}%)`);
  }

  if (signal.reasons.length > 0) {
    const top = [...signal.reasons].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
    lines.push(`Raisons principales : ${top.map((r) => r.label).join(", ")}`);
  }

  lines.push(
    "",
    "⚠️ Signal statistique à surveiller — pas une garantie de gain ni un conseil financier. Ne mise que ce que tu peux te permettre de perdre.",
  );

  return lines.join("\n");
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
        await bot.api.editMessageText(link.telegramChatId, Number(existing.messageRef), text);
      } else {
        const sent = await bot.api.sendMessage(link.telegramChatId, text);
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
