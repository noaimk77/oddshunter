// Points the bot's webhook at this deployment and checks it has the admin
// rights the VIP channel flow needs. Run once per environment:
//   node --env-file=.env scripts/telegram-setup.mjs
const { TELEGRAM_BOT_TOKEN, TELEGRAM_VIP_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL } = process.env;

for (const [name, value] of Object.entries({ TELEGRAM_BOT_TOKEN, TELEGRAM_VIP_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL })) {
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
}

async function call(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.error_code} ${body.description}`);
  return body.result;
}

const me = await call("getMe");
const member = await call("getChatMember", { chat_id: TELEGRAM_VIP_CHAT_ID, user_id: me.id });
const missing = [
  member.status !== "administrator" && "administrator",
  !member.can_invite_users && "can_invite_users",
  !member.can_restrict_members && "can_restrict_members",
].filter(Boolean);
if (missing.length) {
  console.error(`@${me.username} lacks in the VIP channel: ${missing.join(", ")}`);
  process.exit(1);
}

const url = new URL("/api/telegram/webhook", NEXT_PUBLIC_APP_URL).toString();
await call("setWebhook", {
  url,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["chat_join_request"],
});
console.log(`@${me.username} is admin of the VIP channel; webhook set to ${url}`);
