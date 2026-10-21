import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { POST } from "./route";

const EMAIL_PREFIX = "telegram-webhook-test";
const CHAT_ID = -1001234567890;
const SECRET = "telegram-test-secret";

function joinRequestUpdate(fromId: number, inviteLink: string | null, chatId = CHAT_ID) {
  return {
    update_id: 1,
    chat_join_request: {
      chat: { id: chatId },
      from: { id: fromId },
      ...(inviteLink ? { invite_link: { invite_link: inviteLink } } : {}),
    },
  };
}

function telegramRequest(update: unknown, secret: string | null = SECRET): Request {
  return new Request("http://localhost:3000/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(update),
  });
}

/** Records Telegram Bot API calls and answers them with `{ ok: true }`. */
function mockTelegramApi() {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const method = String(input).split("/").pop()!;
    calls.push({ method, params: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  });
  return calls;
}

async function createUser(suffix: string, vipStatus: string | null) {
  const link = `https://t.me/+${suffix}-${crypto.randomUUID()}`;
  const user = await db.user.create({
    data: { email: `${EMAIL_PREFIX}-${suffix}@oddshunter.dev`, telegramInviteLink: link },
  });
  if (vipStatus) await db.entitlement.create({ data: { userId: user.id, type: "VIP", status: vipStatus } });
  return { user, link };
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test-token");
    vi.stubEnv("TELEGRAM_VIP_CHAT_ID", String(CHAT_ID));
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
    await cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(cleanup);

  it("rejects an update without the shared secret token", async () => {
    const calls = mockTelegramApi();
    const res = await POST(telegramRequest(joinRequestUpdate(1, null), null));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("rejects an update with the wrong secret token", async () => {
    const calls = mockTelegramApi();
    const res = await POST(telegramRequest(joinRequestUpdate(1, null), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("approves an active VIP's join request and binds their Telegram account", async () => {
    const { user, link } = await createUser("active", "ACTIVE");
    const calls = mockTelegramApi();

    const res = await POST(telegramRequest(joinRequestUpdate(555, link)));

    expect(res.status).toBe(200);
    expect(calls).toEqual([{ method: "approveChatJoinRequest", params: { chat_id: CHAT_ID, user_id: 555 } }]);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.telegramUserId).toBe("555");
  });

  it("declines a different Telegram account using an already-bound link", async () => {
    const { user, link } = await createUser("shared", "ACTIVE");
    await db.user.update({ where: { id: user.id }, data: { telegramUserId: "555" } });
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(999, link)));

    expect(calls).toEqual([{ method: "declineChatJoinRequest", params: { chat_id: CHAT_ID, user_id: 999 } }]);
    const unchanged = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.telegramUserId).toBe("555");
  });

  it("re-approves the bound Telegram account after it left the channel", async () => {
    const { user, link } = await createUser("rejoin", "ACTIVE");
    await db.user.update({ where: { id: user.id }, data: { telegramUserId: "555" } });
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(555, link)));

    expect(calls[0].method).toBe("approveChatJoinRequest");
  });

  it("declines when the link owner's VIP subscription is no longer active", async () => {
    const { link } = await createUser("canceled", "CANCELED");
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(555, link)));

    expect(calls[0].method).toBe("declineChatJoinRequest");
  });

  it("declines a user who never had a VIP subscription", async () => {
    const { link } = await createUser("novip", null);
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(555, link)));

    expect(calls[0].method).toBe("declineChatJoinRequest");
  });

  it("declines a join request through a link we didn't issue", async () => {
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(555, "https://t.me/+not-ours")));

    expect(calls[0].method).toBe("declineChatJoinRequest");
  });

  it("declines a Telegram account already bound to another user", async () => {
    const { user: first } = await createUser("owner", "ACTIVE");
    await db.user.update({ where: { id: first.id }, data: { telegramUserId: "555" } });
    const { user: second, link } = await createUser("second", "ACTIVE");
    const calls = mockTelegramApi();

    await POST(telegramRequest(joinRequestUpdate(555, link)));

    expect(calls[0].method).toBe("declineChatJoinRequest");
    const unbound = await db.user.findUniqueOrThrow({ where: { id: second.id } });
    expect(unbound.telegramUserId).toBeNull();
  });

  it("ignores join requests for other chats", async () => {
    const { link } = await createUser("otherchat", "ACTIVE");
    const calls = mockTelegramApi();

    const res = await POST(telegramRequest(joinRequestUpdate(555, link, -100999)));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});
