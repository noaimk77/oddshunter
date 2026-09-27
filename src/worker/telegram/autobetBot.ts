import { Bot } from "grammy";
import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { fetchWalletBalances, withdrawUsdc } from "../lib/polygonWallet";

/**
 * Private bot — Noaim's own dashboard/remote-control for the auto-betting
 * pipeline (PS3838 / Polymarket), never public. Separate bot token and
 * separate process from the VIP signals bot (./bot.ts) since they serve
 * unrelated audiences and a leaked token here has real-money consequences.
 * Every handler checks AUTOBET_ADMIN_CHAT_ID and silently ignores anyone
 * else — there's no legitimate second user, so no user-facing rejection
 * message either.
 *
 * The wallet (USDC on Polygon) is the shared "warehouse" funding both
 * AsianConnect and Polymarket manually for now — this bot does not place
 * bets, it only reports the balance and moves funds to ONE fixed address
 * (AUTOBET_WITHDRAW_ADDRESS, Noaim's Kraken deposit address). Withdrawals
 * never take a destination from the Telegram message: if the bot token or
 * chat is ever compromised, funds can still only leave to that one address.
 */

function isAdmin(chatId: number): boolean {
  const adminChatId = process.env.AUTOBET_ADMIN_CHAT_ID;
  return !!adminChatId && String(chatId) === adminChatId;
}

function formatUsd(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function createAutobetBot(consensusDb: PrismaClient): Bot {
  const token = process.env.AUTOBET_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "AUTOBET_BOT_TOKEN n'est pas configuré — crée le bot via @BotFather puis ajoute le token en secret Fly.",
    );
  }
  if (!process.env.AUTOBET_ADMIN_CHAT_ID) {
    throw new Error("AUTOBET_ADMIN_CHAT_ID n'est pas configuré — le bot ne saurait à qui répondre.");
  }

  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    if (!ctx.chat || !isAdmin(ctx.chat.id)) return;
    await next();
  });

  bot.command("start", async (ctx) => {
    const live = process.env.AUTOBET_LIVE_ENABLED === "true";
    await ctx.reply(
      "🤖 Autobet en ligne.\n\nCommandes disponibles :\n" +
        "/solde — bankroll (USDC + POL pour le gas) et adresse de dépôt\n" +
        "/retirer <montant> — envoyer des USDC vers Kraken (2 étapes)\n" +
        "/paris — 10 derniers tickets (foot -> PS3838, e-sport -> Polymarket)\n\n" +
        `Mode: ${live ? "⚠️ RÉEL — de l'argent part vraiment" : "🧪 SIMULATION — rien n'est engagé"}.`,
    );
  });

  bot.command("paris", async (ctx) => {
    try {
      const tickets = await consensusDb.autobetTicket.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
      if (tickets.length === 0) {
        await ctx.reply("Aucun ticket pour l'instant.");
        return;
      }
      const statusIcon: Record<string, string> = { SIMULATED: "🧪", PLACED: "✅", REJECTED: "🚫", FAILED: "❌" };
      const lines = tickets.map((t) => {
        const when = t.createdAt.toISOString().slice(5, 16).replace("T", " ");
        return (
          `${statusIcon[t.status] ?? "•"} ${when} — ${t.broker} — ${t.homeTeam} vs ${t.awayTeam}\n` +
          `   ${t.market} ${t.selection} — ${formatUsd(t.stakeEur)}€${t.oddsAtBet ? ` @ ${t.oddsAtBet}` : ""}` +
          `${t.reason ? `\n   ↳ ${t.reason}` : ""}`
        );
      });
      await ctx.reply(lines.join("\n\n"));
    } catch (err) {
      await ctx.reply(`❌ Erreur : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("solde", async (ctx) => {
    try {
      const { address, usdc, pol } = await fetchWalletBalances();
      // Plain text on purpose: Telegram's MarkdownV2 requires escaping most
      // punctuation, and a parse error here would silently break the one
      // command that shows where to send money.
      await ctx.reply(
        `💰 ${formatUsd(usdc)} USDC\n⛽ ${pol.toFixed(4)} POL (gas)\n\n📥 Adresse de dépôt (réseau Polygon UNIQUEMENT) :\n${address}`,
      );
    } catch (err) {
      await ctx.reply(`❌ Erreur solde : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Two-step confirm, stateless on purpose (no session storage to get out of
  // sync with): "/retirer 50" shows a preview, the real send only happens on
  // "/retirer 50 confirme" — retyping the amount is the confirmation, so a
  // single fat-fingered tap can never move funds.
  bot.command("retirer", async (ctx) => {
    const parts = (ctx.match ?? "").trim().split(/\s+/);
    const amount = Number(parts[0]?.replace(",", "."));
    const confirmed = parts[1]?.toLowerCase() === "confirme";

    if (!parts[0] || !Number.isFinite(amount) || amount <= 0) {
      await ctx.reply("Usage : /retirer <montant>  (ex: /retirer 50)");
      return;
    }

    if (!confirmed) {
      try {
        const { usdc } = await fetchWalletBalances();
        if (amount > usdc) {
          await ctx.reply(`❌ Solde insuffisant : ${formatUsd(usdc)} USDC disponibles.`);
          return;
        }
        await ctx.reply(
          `⚠️ Confirme le retrait de ${formatUsd(amount)} USDC vers Kraken.\n\nEnvoie exactement :\n/retirer ${parts[0]} confirme`,
        );
      } catch (err) {
        await ctx.reply(`❌ Erreur : ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    try {
      await ctx.reply("⏳ Envoi en cours...");
      const { txHash, to } = await withdrawUsdc(amount);
      await ctx.reply(
        `✅ ${formatUsd(amount)} USDC envoyés vers ${to}\n\nhttps://polygonscan.com/tx/${txHash}`,
      );
    } catch (err) {
      await ctx.reply(`❌ Retrait échoué : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return bot;
}
