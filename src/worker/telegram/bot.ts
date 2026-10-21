import { Bot } from "grammy";
import { db } from "@/lib/db";
import { getActiveEntitlements } from "@/lib/guards";
import { consumeTelegramLinkToken } from "./linking";
import { getUserHitRate, countUserAlerts, getGlobalPerformance, getPremiumPerformance } from "../lib/leagueStats";

/**
 * Command surface from spec section 8. `/trial` is intentionally omitted —
 * whether a trial period exists at all is still an open product decision
 * (section 20, Q7); add it once that's confirmed instead of guessing a
 * duration. `/settings` is used rather than `/edit` — also still open, easy
 * to alias later with `bot.command("edit", ...)` pointing at the same
 * handler once BotFather naming is finalized.
 */

function siteUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://oddshunter98.vercel.app"}${path}`;
}

async function findLinkedUserId(telegramChatId: string): Promise<string | null> {
  const link = await db.telegramLink.findUnique({ where: { telegramChatId } });
  return link && !link.revokedAt ? link.userId : null;
}

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN n'est pas configuré — crée le bot via @BotFather puis ajoute le token via `stripe projects`.",
    );
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const payloadToken = ctx.match?.toString().trim();
    const chatId = String(ctx.chat.id);

    if (payloadToken) {
      const result = await consumeTelegramLinkToken(db, payloadToken, chatId, ctx.from?.username);
      if (result.ok) {
        await ctx.reply("✅ Ton compte Odds Hunter est lié. Tu recevras les signaux ici dès qu'ils seront activés.");
        return;
      }
      const reasons: Record<typeof result.reason, string> = {
        not_found: "Ce lien n'est pas valide.",
        expired: "Ce lien a expiré (valable 15 minutes) — régénère-le depuis ton compte.",
        already_used: "Ce lien a déjà été utilisé.",
      };
      await ctx.reply(`❌ ${reasons[result.reason]} Génère un nouveau lien depuis ${siteUrl("/account")}.`);
      return;
    }

    await ctx.reply(
      `Bienvenue sur Odds Hunter 🎯\n\nPour lier ce compte Telegram à ton abonnement, ouvre ${siteUrl(
        "/account",
      )} et clique sur "Lier mon compte Telegram".\n\n/help pour la liste des commandes.`,
    );
  });

  bot.command("subscribe", async (ctx) => {
    await ctx.reply(`Abonnement Bot automatisé (75€/mois) : ${siteUrl("/#abonnement")}`);
  });

  bot.command("status", async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const active = await getActiveEntitlements(userId);
    const botActive = active.has("BOT");
    await ctx.reply(
      [
        `Compte : lié ✅`,
        `Abonnement Bot : ${botActive ? "actif ✅" : "inactif ❌"}`,
        botActive ? "" : `Réactive-le sur ${siteUrl("/account")}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  bot.command(["settings", "edit"], async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const rules = await db.alertRule.findMany({ where: { userId, enabled: true } });
    if (rules.length === 0) {
      await ctx.reply(
        "Aucun filtre configuré pour l'instant — tu recevras tous les signaux autorisés par ton abonnement.\n" +
          "La gestion fine des filtres (sport, cote min/max, score minimal…) arrive dans une prochaine version.",
      );
      return;
    }
    const lines = rules.map((r) => `• ${r.name} — ${r.condition} ≥ ${r.threshold}${r.sport ? ` (${r.sport})` : ""}`);
    await ctx.reply(`Tes filtres actifs :\n${lines.join("\n")}`);
  });

  bot.command("history", async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const deliveries = await db.signalDelivery.findMany({
      where: { userId, channel: "TELEGRAM" },
      orderBy: { sentAt: "desc" },
      take: 10,
      include: { signal: true },
    });
    if (deliveries.length === 0) {
      await ctx.reply("Aucune alerte reçue pour l'instant.");
      return;
    }
    const lines = deliveries.map(
      (d) => `• ${d.sentAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — ${d.signal.type} (score ${d.signal.score})`,
    );
    await ctx.reply(`Tes 10 dernières alertes :\n${lines.join("\n")}`);
  });

  bot.command("stats", async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const [received30, hitRate30, received7, hitRate7] = await Promise.all([
      countUserAlerts(db, userId, 30),
      getUserHitRate(db, userId, 30),
      countUserAlerts(db, userId, 7),
      getUserHitRate(db, userId, 7),
    ]);
    if (received30 === 0) {
      await ctx.reply("Aucune alerte reçue pour l'instant — reviens ici après quelques signaux pour voir tes stats.");
      return;
    }
    const formatWindow = (label: string, received: number, hr: typeof hitRate30) => {
      const decided = hr.wins + hr.losses;
      if (received === 0) return `${label} — aucune alerte reçue`;
      if (decided === 0) return `${label} — ${received} alerte(s), aucune encore résolue`;
      const rate = hr.hitRatePct ?? 0;
      const voidsSuffix = hr.voids > 0 ? ` (${hr.voids} remboursées)` : "";
      return `${label} — ${received} reçues, ${hr.wins}W/${hr.losses}L (${rate}%)${voidsSuffix}`;
    };
    await ctx.reply(
      [
        "📊 <b>Tes stats Odds Hunter</b>",
        "",
        formatWindow("30 derniers jours", received30, hitRate30),
        formatWindow("7 derniers jours", received7, hitRate7),
        "",
        "<i>Hit-rate calculé sur les alertes déjà résolues (matchs terminés). Les remboursements (push, DNB sur nul) sont exclus du dénominateur.</i>",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  /**
   * PUBLIC — no account needed, no subscription needed. This is the sales
   * pitch: a prospect messages the bot, types /perf, and sees the actual
   * track record of every signal fired over the last 7 / 30 / 90 days,
   * with a flat-1€ ROI on top. Same source of truth as /stats — no
   * cherry-picking, no marketing figures. If we ever lie here, we lose
   * the whole point of the command; the numbers are computed from
   * SignalOutcome rows directly. See getGlobalPerformance.
   */
  bot.command("perf", async (ctx) => {
    let allWindows, premWindows;
    try {
      [allWindows, premWindows] = await Promise.all([
        Promise.all([getGlobalPerformance(db, 7), getGlobalPerformance(db, 30), getGlobalPerformance(db, 90)]),
        Promise.all([getPremiumPerformance(db, 7), getPremiumPerformance(db, 30), getPremiumPerformance(db, 90)]),
      ]);
    } catch (err) {
      console.error("[bot] /perf failed", err);
      await ctx.reply("Les stats sont temporairement indisponibles — réessaie dans quelques minutes.");
      return;
    }

    type Perf = Awaited<ReturnType<typeof getGlobalPerformance>>;
    const line = (label: string, p: Perf): string => {
      if (p.hitRate.decided === 0) {
        return `<b>${label}</b> — ${p.totalFired} signaux, aucun résolu pour l'instant`;
      }
      const roi = p.roi.roiPct == null ? "?" : (p.roi.roiPct > 0 ? "+" : "") + p.roi.roiPct + "%";
      const units = (p.roi.units > 0 ? "+" : "") + p.roi.units.toFixed(2) + "€";
      return (
        `<b>${label}</b> — ${p.totalFired} signaux · ` +
        `${p.hitRate.wins}✅ / ${p.hitRate.losses}❌ (${p.hitRate.hitRatePct}%) · ` +
        `ROI ${roi} (${units} à 1€/pari)`
      );
    };

    await ctx.reply(
      [
        "🎯 <b>Track record Odds Hunter</b>",
        "",
        "📊 <b>Tous signaux</b>",
        line("7 j", allWindows[0]),
        line("30 j", allWindows[1]),
        line("90 j", allWindows[2]),
        "",
        "⭐ <b>Signaux Premium</b> — mouvement corroboré par plusieurs bookmakers",
        line("7 j", premWindows[0]),
        line("30 j", premWindows[1]),
        line("90 j", premWindows[2]),
        "",
        "<i>Chaque signal est jugé une fois le match terminé, prix à l'instant de l'alerte. Les remboursements (push, DNB sur nul) sont exclus.</i>",
        "",
        `S'abonner → ${siteUrl("/#abonnement")}`,
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "/start — accueil et liaison du compte",
        "/perf — track record du bot (public, 7/30/90j)",
        "/subscribe — voir l'abonnement Bot",
        "/settings — voir tes filtres",
        "/status — état de ton compte et de l'abonnement",
        "/history — tes 10 dernières alertes",
        "/stats — hit-rate de tes alertes (7j et 30j)",
        "/help — cette liste",
      ].join("\n"),
    );
  });

  return bot;
}
