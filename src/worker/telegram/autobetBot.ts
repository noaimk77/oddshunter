import { Bot } from "grammy";
import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { fetchWalletBalances, withdrawUsdc } from "../lib/polygonWallet";
import { fetchPolymarketBankrollUsd } from "../autobet/bankroll";
import { onboardDeposit, swapUsdceToNativeUsdc } from "../autobet/usdcBridge";
import { resolvePolymarketBet } from "../autobet/polymarketMatcher";
import { autobetOnConsensus } from "../autobet/router";
import { slugTeam } from "./tipParser";
import type { ConfidenceTier } from "../autobet/confidenceTier";
import type { AutobetCandidate } from "../autobet/types";

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
        "/paris — 10 derniers tickets (foot -> PS3838, e-sport -> Polymarket)\n" +
        "/preparer <montant> — convertit l'USDC déposé en USDC.e et active Polymarket (2 étapes)\n" +
        "/miser <home> | <away> | <marché> | <sélection> | <tier> — pari manuel Polymarket (2 étapes)\n\n" +
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
      const statusIcon: Record<string, string> = { SIMULATED: "🧪", PLACED: "✅", REJECTED: "🚫", FAILED: "❌", CLOSED: "🔒" };
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
      const usdce = await fetchPolymarketBankrollUsd();
      // Plain text on purpose: Telegram's MarkdownV2 requires escaping most
      // punctuation, and a parse error here would silently break the one
      // command that shows where to send money.
      await ctx.reply(
        `💰 ${formatUsd(usdc)} USDC (natif — c'est ici que tu déposes depuis Kraken)\n` +
          `🎯 ${formatUsd(usdce ?? 0)} USDC.e (celui que Polymarket utilise — via /preparer)\n` +
          `⛽ ${pol.toFixed(4)} POL (gas)\n\n📥 Adresse de dépôt (réseau Polygon UNIQUEMENT) :\n${address}`,
      );
    } catch (err) {
      await ctx.reply(`❌ Erreur solde : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Same 2-step confirm pattern as /retirer — this sends real on-chain
  // transactions (a swap + up to 4 approvals), so a fat-fingered amount
  // must not execute on the first message.
  bot.command("preparer", async (ctx) => {
    const parts = (ctx.match ?? "").trim().split(/\s+/);
    const amount = Number(parts[0]?.replace(",", "."));
    const confirmed = parts[1]?.toLowerCase() === "confirme";

    if (!parts[0] || !Number.isFinite(amount) || amount <= 0) {
      await ctx.reply("Usage : /preparer <montant>  (ex: /preparer 100 — convertit 100 USDC natif en USDC.e)");
      return;
    }

    if (!confirmed) {
      try {
        const { usdc } = await fetchWalletBalances();
        if (amount > usdc) {
          await ctx.reply(`❌ Solde insuffisant : ${formatUsd(usdc)} USDC natif disponibles.`);
          return;
        }
        await ctx.reply(
          `⚠️ Confirme : convertir ${formatUsd(amount)} USDC (natif) en USDC.e et activer les autorisations Polymarket.\n` +
            `Ça envoie plusieurs transactions on-chain (petits frais en POL).\n\nEnvoie exactement :\n/preparer ${parts[0]} confirme`,
        );
      } catch (err) {
        await ctx.reply(`❌ Erreur : ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    try {
      await ctx.reply("⏳ Conversion en cours (plusieurs transactions, ça peut prendre une minute)...");
      const { swap, prepare } = await onboardDeposit(amount);
      if (!swap.swapped) {
        await ctx.reply(`❌ Conversion échouée : ${swap.reason ?? "raison inconnue"}`);
        return;
      }
      let msg = `✅ ${formatUsd(swap.amountInUsdc)} USDC convertis en USDC.e.\nNouveau solde USDC.e : ${formatUsd(swap.amountOutUsdce ?? 0)}\nhttps://polygonscan.com/tx/${swap.txHash}\n`;
      if (prepare) {
        msg += prepare.ok ? "\n✅ Wallet prêt à trader sur Polymarket." : `\n⚠️ Autorisations Polymarket incomplètes : ${prepare.error}`;
        msg += `\n${prepare.steps.map((s) => `• ${s}`).join("\n")}`;
      }
      await ctx.reply(msg);
    } catch (err) {
      await ctx.reply(`❌ Échoué : ${err instanceof Error ? err.message : String(err)}`);
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

    // Polymarket winnings land as USDC.e, not the native USDC this command
    // withdraws — so a shortfall in native USDC is topped up automatically
    // from USDC.e first, rather than making Noaim learn a separate command
    // just to move his own winnings.
    if (!confirmed) {
      try {
        const { usdc } = await fetchWalletBalances();
        if (amount > usdc) {
          const usdce = (await fetchPolymarketBankrollUsd()) ?? 0;
          if (amount > usdc + usdce) {
            await ctx.reply(`❌ Solde insuffisant : ${formatUsd(usdc)} USDC + ${formatUsd(usdce)} USDC.e (gains Polymarket) disponibles.`);
            return;
          }
          await ctx.reply(
            `⚠️ ${formatUsd(usdc)} USDC dispo, le reste (${formatUsd(amount - usdc)}) sera converti depuis tes gains Polymarket (USDC.e) d'abord.\n\n` +
              `Confirme le retrait de ${formatUsd(amount)} USDC vers Kraken.\n\nEnvoie exactement :\n/retirer ${parts[0]} confirme`,
          );
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
      const { usdc } = await fetchWalletBalances();
      if (amount > usdc) {
        const shortfall = amount - usdc;
        await ctx.reply(`⏳ Conversion de ${formatUsd(shortfall)} USDC.e (gains Polymarket) vers USDC...`);
        const bridged = await swapUsdceToNativeUsdc(shortfall);
        if (!bridged.swapped) {
          await ctx.reply(`❌ Conversion échouée, retrait annulé : ${bridged.reason ?? "raison inconnue"}`);
          return;
        }
      }
      await ctx.reply("⏳ Envoi en cours...");
      const { txHash, to } = await withdrawUsdc(amount);
      await ctx.reply(
        `✅ ${formatUsd(amount)} USDC envoyés vers ${to}\n\nhttps://polygonscan.com/tx/${txHash}`,
      );
    } catch (err) {
      await ctx.reply(`❌ Retrait échoué : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Manual override for a pick the automatic pipeline hasn't (yet, or won't)
  // catch on its own — e.g. verifying the machine works, or a tip whose
  // consensus fingerprint doesn't fire automatically. Same stateless 2-step
  // confirm pattern as /retirer/preparer: "/miser A | B | 1X2 | A" previews
  // the resolved Polymarket market + price, the real order only fires on
  // "... | confirme". Esports/Polymarket only — football (PS3838) is
  // disabled outright (see router.ts), so this always forces
  // isTrustedEsportsSource so the router doesn't fall through to the
  // disabled football path just because the team names carry no esports
  // keyword (real case: "Sementes do Mal", "Damajuanaa", "Megoshort" — none
  // of them match looksLikeEsports's keyword scan).
  bot.command("miser", async (ctx) => {
    const raw = (ctx.match ?? "").trim();
    const confirmed = /\|\s*confirme\s*$/i.test(raw);
    const body = confirmed ? raw.replace(/\|\s*confirme\s*$/i, "") : raw;
    const parts = body.split("|").map((s) => s.trim());
    const [home, away, marketRaw, selectionRaw, tierRaw] = parts;

    if (!home || !away || !marketRaw || !selectionRaw) {
      await ctx.reply(
        "Usage : /miser <home> | <away> | <marché> | <sélection> | <tier optionnel>\n" +
          "Marché : 1X2, OVER_UNDER, OVER_UNDER_HT, HANDICAP, BTTS, DOUBLE_CHANCE\n" +
          "Sélection : \"home\"/\"away\" pour 1X2, sinon le code exact (ex: OVER_2_5, HOME_-1.5)\n" +
          "Tier : 1, 2, 3 ou max (défaut : 3 si omis, comme une alerte sans tier)\n\n" +
          "Ex : /miser Sementes do Mal | Damajuanaa | 1X2 | away | 2",
      );
      return;
    }

    const market = marketRaw.toUpperCase().replace(/\s+/g, "_");
    let selection = selectionRaw;
    const selLower = selectionRaw.toLowerCase();
    if (market === "1X2" || market === "DOUBLE_CHANCE") {
      if (selLower === "home") selection = slugTeam(home);
      else if (selLower === "away") selection = slugTeam(away);
      else selection = slugTeam(selectionRaw);
    }

    let confidenceTier: ConfidenceTier | null = null;
    if (tierRaw) {
      const t = tierRaw.toLowerCase();
      if (t === "max") confidenceTier = "max";
      else if (t === "1") confidenceTier = "1/3";
      else if (t === "2") confidenceTier = "2/3";
      else if (t === "3") confidenceTier = "3/3";
      else {
        await ctx.reply(`❌ Tier "${tierRaw}" invalide — utilise 1, 2, 3 ou max.`);
        return;
      }
    }

    const fixture = { homeTeam: home, awayTeam: away };

    if (!confirmed) {
      try {
        const resolved = await resolvePolymarketBet(fixture, market, selection);
        if (!resolved.ok) {
          await ctx.reply(`❌ Marché introuvable sur Polymarket : ${resolved.reason}`);
          return;
        }
        const { outcome, market: pm } = resolved.match;
        await ctx.reply(
          `⚠️ Confirme : ${home} vs ${away} — ${market} ${selection}\n` +
            `Marché Polymarket : ${pm.question}\n` +
            `Prix actuel : ${outcome.price}\n` +
            `Tier : ${confidenceTier ?? "3/3 (défaut)"}\n\n` +
            `Envoie exactement :\n/miser ${parts.slice(0, 4).join(" | ")}${tierRaw ? ` | ${tierRaw}` : ""} | confirme`,
        );
      } catch (err) {
        await ctx.reply(`❌ Erreur résolution : ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    try {
      await ctx.reply("⏳ Pari en cours...");
      const fingerprint = `manual:${slugTeam(home)}|${slugTeam(away)}|${market}|${selection}|${Date.now()}`;
      const tip: AutobetCandidate = {
        homeTeam: home,
        awayTeam: away,
        market,
        selection,
        fingerprint,
        groupCount: 1,
        confidenceTier,
        isTrustedEsportsSource: true,
      };
      const result = await autobetOnConsensus(consensusDb, tip, fingerprint);
      const statusIcon: Record<string, string> = { SIMULATED: "🧪", PLACED: "✅", REJECTED: "🚫", FAILED: "❌", CLOSED: "🔒" };
      await ctx.reply(
        `${statusIcon[result.status] ?? "•"} ${result.status} — ${result.broker} — ${formatUsd(result.stakeEur)}€` +
          `${result.oddsAtBet ? ` @ ${result.oddsAtBet}` : ""}${result.reason ? `\n↳ ${result.reason}` : ""}`,
      );
    } catch (err) {
      await ctx.reply(`❌ Échoué : ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return bot;
}
