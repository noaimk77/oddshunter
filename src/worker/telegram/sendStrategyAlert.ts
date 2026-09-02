import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import { STRATEGY_DEFS, type StrategyName } from "../lib/strategyStats";

/**
 * Bilingual InPlay-Alerts-style pick renderer (Noaim, 2026-08-23, "on va
 * faire un bot comme celui de Inplay Alert"). Format calqué au caractère
 * près sur leurs alertes actuelles vérifiées live: pronostic + stratégie +
 * cote + match/ligue/minute + score live + premier but + taux + occurrences
 * + historique V/X + defaite_en_cours + "Bonne chance à tous", puis
 * séparateur, puis la même chose en anglais.
 *
 * Two entry points:
 *  - formatPickMessage(): pure formatter, testable without a bot.
 *  - deliverPick(): fan-out to every linked, entitled Telegram user with the
 *    same edit-in-place discipline as sendAlert.ts (existing messageRef
 *    edited if we ever re-touch the pick, not duplicated).
 */

export interface StrategyPickContext {
  id: string;
  strategyName: string;
  bookmakerOdds: number;
  bookmakerName: string | null;
  triggeredAtMinute: number;
  triggeredAtScore: string;
  firstGoalMinute: number | null;
  hitRateAtTrigger: number;
  occurrencesAtTrigger: number;
  historyStreak: string;
  currentLosingStreak: number;
  event: {
    homeTeam: string;
    awayTeam: string;
    kickoff: Date;
    status: string;
    competition: { country: string; name: string };
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Human labels — the pronostic line the reader sees. Kept distinct from the
 *  internal strategy identifiers (over_0_5_ht_by_league) so the internal id
 *  can change without breaking the visible product wording. */
const PRONOSTIC_LABEL_FR: Record<StrategyName, { pronostic: string; bet: string; strategy: string }> = {
  over_0_5_ht_by_league: {
    pronostic: "Over 0.5 HT Goals",
    bet: "Over 0.50 HT Live",
    strategy: "Value Bet By League",
  },
  over_1_5_ht_by_league: {
    pronostic: "Over 1.5 HT Goals",
    bet: "Over 1.50 HT Live",
    strategy: "Over 1.5HT HR by League",
  },
};

const PRONOSTIC_LABEL_EN: Record<StrategyName, { pronostic: string; bet: string; strategy: string }> = {
  over_0_5_ht_by_league: {
    pronostic: "Over 0.5 HT Goals",
    bet: "Over 0.50 HT Live",
    strategy: "Value Bet By League",
  },
  over_1_5_ht_by_league: {
    pronostic: "Over 1.5 HT Goals",
    bet: "Over 1.50 HT Live",
    strategy: "Over 1.5HT HR by League",
  },
};

function renderBlock(
  ctx: StrategyPickContext,
  flag: string,
  labels: { pronostic: string; bet: string; strategy: string },
  isEnglish: boolean,
): string {
  const strategyKey = ctx.strategyName as StrategyName;
  if (!(strategyKey in STRATEGY_DEFS)) {
    // Unknown strategy — should never happen in production (writer validates)
    // but guard so a stale row doesn't crash delivery.
    return `${flag} Pronostic : ${escapeHtml(ctx.strategyName)}`;
  }

  const oddsStr = ctx.bookmakerOdds.toFixed(2);
  const rateStr = ctx.hitRateAtTrigger.toFixed(2);
  const firstGoalLabel = isEnglish
    ? ctx.firstGoalMinute != null ? `${ctx.firstGoalMinute}'` : "None"
    : ctx.firstGoalMinute != null ? `${ctx.firstGoalMinute}'` : "Aucun";
  const streakLine = isEnglish
    ? `History : ${ctx.historyStreak || "—"}, defaite_en_cours = ${ctx.currentLosingStreak}`
    : `Historique : ${ctx.historyStreak || "—"}, defaite_en_cours = ${ctx.currentLosingStreak}`;

  const t = isEnglish
    ? {
        pronostic: "Bet",
        strategy: "Strategy",
        match: "Match",
        league: "League",
        minute: "Minute",
        liveScore: "Live score",
        firstGoal: "First goal",
        rate: "Combination Success Rate",
        occurrences: "Combination Occurrences",
        goodLuck: "Good luck everyone!",
      }
    : {
        pronostic: "Pronostic",
        strategy: "Stratégie",
        match: "Match",
        league: "Ligue",
        minute: "Minute",
        liveScore: "Live score",
        firstGoal: "Premier but",
        rate: "Taux de réussite combinaison",
        occurrences: "Occurrences combinaison",
        goodLuck: "Bonne chance à tous !",
      };

  const lines = [
    `${flag} 🎯 <b>${t.pronostic} : ${escapeHtml(labels.pronostic)}</b>`,
    `📊 <b>${t.strategy} :</b> ${escapeHtml(labels.strategy)}`,
    "",
    `🎯 <b>${escapeHtml(labels.bet)} :</b> ${oddsStr}`,
    "",
    `🏟 <b>${t.match} :</b> ${escapeHtml(ctx.event.homeTeam)} vs ${escapeHtml(ctx.event.awayTeam)}`,
    `🏆 <b>${t.league} :</b> ${escapeHtml(ctx.event.competition.country)} - ${escapeHtml(ctx.event.competition.name)}`,
    `⏱ <b>${t.minute} :</b> ${ctx.triggeredAtMinute}`,
    "",
    `⚽ <b>${t.liveScore} :</b> ${escapeHtml(ctx.triggeredAtScore)}`,
    `📖 <b>${t.firstGoal} :</b> ${escapeHtml(firstGoalLabel)}`,
    "",
    `✅ <b>${t.rate} :</b> ${rateStr}%`,
    `📅 <b>${t.occurrences} :</b> ${ctx.occurrencesAtTrigger}`,
    `📚 <b>${streakLine}</b>`,
    "",
    `☘️ ${t.goodLuck}`,
  ];
  return lines.join("\n");
}

export function formatPickMessage(ctx: StrategyPickContext): string {
  const strategyKey = ctx.strategyName as StrategyName;
  const labelsFr = PRONOSTIC_LABEL_FR[strategyKey];
  const labelsEn = PRONOSTIC_LABEL_EN[strategyKey];
  if (!labelsFr || !labelsEn) {
    return `[strategy inconnue] ${escapeHtml(ctx.strategyName)} — ${escapeHtml(ctx.event.homeTeam)} vs ${escapeHtml(ctx.event.awayTeam)}`;
  }

  const fr = renderBlock(ctx, "🇫🇷", labelsFr, false);
  const en = renderBlock(ctx, "🇬🇧", labelsEn, true);
  const separator = "————————————————";

  return [fr, "", separator, "", en, "", separator, `<i>✨ Odds Hunter — signal statistique, pas garantie de gain.</i>`].join("\n");
}

/** HT result message — posted separately (not an edit) so it appears in the
 *  channel timeline as a "the pick landed" moment, matching InPlay Alerts'
 *  `HT_SCORE RESULT !!` behaviour. The pick's original message stays intact
 *  above it in the chat history. */
export interface StrategyPickResultContext extends StrategyPickContext {
  htHomeGoals: number;
  htAwayGoals: number;
  hit: boolean;
}

export function formatPickResultMessage(ctx: StrategyPickResultContext): string {
  const strategyKey = ctx.strategyName as StrategyName;
  const labelsFr = PRONOSTIC_LABEL_FR[strategyKey];
  const labelsEn = PRONOSTIC_LABEL_EN[strategyKey];
  const result = ctx.hit ? "✅ Win" : "❌ Loss";
  const nextLine = ctx.hit ? "Enjoy !! 💰 Next now 🔥" : "On garde le rythme. 💪 Next now 🔥";

  const firstGoalFr = ctx.firstGoalMinute != null ? `${ctx.firstGoalMinute}'` : "Aucun";
  const firstGoalEn = ctx.firstGoalMinute != null ? `${ctx.firstGoalMinute}'` : "None";

  const fr = [
    `📊 <b>HT_SCORE RESULT !!</b>`,
    "",
    `🏟 <b>Match :</b> ${escapeHtml(ctx.event.homeTeam)} vs ${escapeHtml(ctx.event.awayTeam)}`,
    `⏱ <b>Alert Time :</b> ${ctx.triggeredAtMinute} min`,
    `🏆 <b>Ligue :</b> ${escapeHtml(ctx.event.competition.country)} - ${escapeHtml(ctx.event.competition.name)}`,
    `📊 <b>Stratégie :</b> ${escapeHtml(labelsFr?.strategy ?? ctx.strategyName)} => @${ctx.bookmakerOdds.toFixed(2)}`,
    `⏱ <b>Minute :</b> 45`,
    `⚽ <b>Live score :</b> ${ctx.htHomeGoals}-${ctx.htAwayGoals}`,
    `📖 <b>Premier but :</b> ${escapeHtml(firstGoalFr)}`,
    `🎯 <b>Hit ${labelsFr?.pronostic ?? ctx.strategyName} :</b> ${ctx.bookmakerOdds.toFixed(2)}`,
    "",
    `<b>Résultat :</b> ${result}`,
    "",
    nextLine,
  ].join("\n");

  const en = [
    `📊 <b>HT_SCORE RESULT !!</b>`,
    "",
    `🏟 <b>Match :</b> ${escapeHtml(ctx.event.homeTeam)} vs ${escapeHtml(ctx.event.awayTeam)}`,
    `⏱ <b>Alert Time :</b> ${ctx.triggeredAtMinute} min`,
    `🏆 <b>League :</b> ${escapeHtml(ctx.event.competition.country)} - ${escapeHtml(ctx.event.competition.name)}`,
    `📊 <b>Strategy :</b> ${escapeHtml(labelsEn?.strategy ?? ctx.strategyName)} => @${ctx.bookmakerOdds.toFixed(2)}`,
    `⏱ <b>Minute :</b> 45`,
    `⚽ <b>Live score :</b> ${ctx.htHomeGoals}-${ctx.htAwayGoals}`,
    `📖 <b>First goal :</b> ${escapeHtml(firstGoalEn)}`,
    `🎯 <b>Hit ${labelsEn?.pronostic ?? ctx.strategyName} :</b> ${ctx.bookmakerOdds.toFixed(2)}`,
    "",
    `<b>Result :</b> ${result}`,
    "",
    ctx.hit ? "Enjoy !! 💰 Next now 🔥" : "Keep going. 💪 Next now 🔥",
  ].join("\n");

  const separator = "————————————————";
  return [fr, "", separator, "", en].join("\n");
}

/** Delivers the initial pick to every entitled linked user. Same edit-in-
 *  place discipline as sendAlert.deliverSignal: an already-delivered pick
 *  that gets re-touched (rare — picks aren't updated once fired) edits the
 *  existing message rather than sending a duplicate. */
export async function deliverPick(db: PrismaClient, bot: Bot, ctx: StrategyPickContext): Promise<void> {
  const eligibleLinks = await db.telegramLink.findMany({
    where: { revokedAt: null, user: { entitlements: { some: { type: "BOT", status: "ACTIVE" } } } },
  });

  const text = formatPickMessage(ctx);

  for (const link of eligibleLinks) {
    const existing = await db.strategyPickDelivery.findUnique({
      where: { strategyPickId_userId_channel: { strategyPickId: ctx.id, userId: link.userId, channel: "TELEGRAM" } },
    });

    try {
      if (existing?.messageRef) {
        try {
          await bot.api.editMessageText(link.telegramChatId, Number(existing.messageRef), text, { parse_mode: "HTML" });
        } catch (editErr) {
          const isNoOpEdit =
            editErr instanceof GrammyError &&
            editErr.error_code === 400 &&
            editErr.description.includes("message is not modified");
          if (!isNoOpEdit) throw editErr;
        }
      } else {
        const sent = await bot.api.sendMessage(link.telegramChatId, text, { parse_mode: "HTML" });
        await db.strategyPickDelivery.upsert({
          where: { strategyPickId_userId_channel: { strategyPickId: ctx.id, userId: link.userId, channel: "TELEGRAM" } },
          create: {
            strategyPickId: ctx.id,
            userId: link.userId,
            channel: "TELEGRAM",
            messageRef: String(sent.message_id),
          },
          update: { messageRef: String(sent.message_id) },
        });
      }
    } catch (err) {
      console.error(`[strategy] failed to deliver pick ${ctx.id} to chat ${link.telegramChatId}`, err);
    }
  }
}

/** Posts the HT_SCORE RESULT !! as a NEW message (not an edit) — mirrors
 *  InPlay Alerts' behaviour of posting the result in the timeline rather
 *  than editing the original pick, so both entries coexist. Sets
 *  `resultPosted=true` on the delivery so a re-run of the tracker doesn't
 *  duplicate the result post. */
export async function postPickResult(db: PrismaClient, bot: Bot, ctx: StrategyPickResultContext): Promise<void> {
  const text = formatPickResultMessage(ctx);
  const deliveries = await db.strategyPickDelivery.findMany({
    where: { strategyPickId: ctx.id, channel: "TELEGRAM", resultPosted: false },
    include: { strategyPick: false },
  });
  const links = await db.telegramLink.findMany({ where: { userId: { in: deliveries.map((d) => d.userId) } } });
  const chatIdByUserId = new Map(links.map((l) => [l.userId, l.telegramChatId]));

  for (const delivery of deliveries) {
    const chatId = chatIdByUserId.get(delivery.userId);
    if (!chatId) continue;
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
      await db.strategyPickDelivery.update({ where: { id: delivery.id }, data: { resultPosted: true } });
    } catch (err) {
      console.error(`[strategy] failed to post result for pick ${ctx.id} to chat ${chatId}`, err);
    }
  }
}
