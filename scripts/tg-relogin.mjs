#!/usr/bin/env node
/**
 * Standalone Telegram user-session generator (gramjs / MTProto).
 *
 * Regenerates a fresh TELEGRAM_USER_SESSION string for the tip-consensus
 * listener (see src/worker/telegram/userClient.ts). Run this whenever
 * gramjs errors with AUTH_KEY_DUPLICATED on Fly — that means the session
 * key has been invalidated on Telegram's side and needs to be reissued.
 *
 * Usage:
 *   cd ~/oddshunter
 *   node scripts/tg-relogin.mjs
 *
 * You will be prompted for:
 *   1. Your Telegram phone number (in international format, e.g. +33612345678)
 *   2. The 5-digit code Telegram sends you (either as an SMS or in the
 *      Telegram app on another logged-in device)
 *   3. Your 2FA password (if you have one set; blank if not)
 *
 * At the end the script prints the new session string between two clear
 * markers. Copy ONLY the line between the markers — never the whole log.
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function loadEnv(path) {
  const env = {};
  try {
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      if (!raw || raw.startsWith("#") || !raw.includes("=")) continue;
      const eq = raw.indexOf("=");
      const key = raw.slice(0, eq).trim();
      let val = raw.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch (err) {
    console.error(`Cannot read ${path}: ${err.message}`);
    process.exit(1);
  }
  return env;
}

function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    if (silent) {
      // Mask 2FA input by disabling echo (best-effort — some terminals still echo).
      const originalWrite = rl._writeToOutput?.bind(rl);
      if (originalWrite) {
        rl._writeToOutput = (str) => {
          if (str.includes(question)) originalWrite(str);
        };
      }
    }
    rl.question(question, (answer) => {
      rl.close();
      if (silent) console.log("");
      resolve(answer.trim());
    });
  });
}

const env = loadEnv(new URL("../.env", import.meta.url).pathname);

const apiId = Number.parseInt(env.TELEGRAM_API_ID ?? "", 10);
const apiHash = env.TELEGRAM_API_HASH ?? "";
if (!Number.isFinite(apiId) || !apiHash) {
  console.error("Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in .env — cannot proceed.");
  process.exit(1);
}

console.log("Reconnexion Telegram user (MTProto).");
console.log("");

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
});

try {
  await client.start({
    phoneNumber: () => ask("Numéro de téléphone (format international, ex: +33612345678) : "),
    phoneCode: () => ask("Code Telegram (reçu par SMS ou dans l'app) : "),
    password: () => ask("Mot de passe 2FA (laisser vide si aucun) : ", { silent: true }),
    onError: (err) => {
      console.error("Erreur Telegram :", err.message);
    },
  });

  const session = client.session.save();

  console.log("");
  console.log("=====================================================");
  console.log("SESSION_START");
  console.log(session);
  console.log("SESSION_END");
  console.log("=====================================================");
  console.log("");
  console.log(`Longueur : ${session.length} caractères.`);
  console.log("Copie UNIQUEMENT la ligne entre SESSION_START et SESSION_END.");
} finally {
  await client.disconnect();
  process.exit(0);
}
