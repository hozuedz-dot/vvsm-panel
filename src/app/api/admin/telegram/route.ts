import { getAdmin, unauthorized } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/settings";
import { sendTelegram, telegramCall } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const BOT_TARGET_ERROR = "chat_id_is_bot: The configured Chat ID is the BOT itself. Send /start from your personal Telegram account, use Find chat IDs, then save your personal/group chat ID—not the bot ID.";

export async function POST(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { action?: string; chatId?: string };
  const { action } = body;
  const settings = await getSettings("notifications");
  const { botToken, chatId } = settings.telegram;
  if (!botToken || !/^\d+:[a-zA-Z0-9_-]+$/.test(botToken)) return Response.json({ ok: false, error: "invalid_bot_token" }, { status: 400 });
  if (action === "test") {
    if (String(chatId).trim() === botToken.split(":")[0]) return Response.json({ ok: false, error: BOT_TARGET_ERROR }, { status: 400 });
    const me = await telegramCall("getMe");
    if (me.ok) {
      const bot = me.result as { id?: number; username?: string };
      const target = String(chatId).trim();
      if (target === String(bot?.id || "") || target.replace(/^@/, "").toLowerCase() === String(bot?.username || "").toLowerCase()) {
        return Response.json({ ok: false, error: BOT_TARGET_ERROR }, { status: 400 });
      }
    }
    const result = await sendTelegram("✅ VVSM — Telegram notifications are working.");
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  if (action !== "verify" && action !== "chats" && action !== "set-chat") return Response.json({ error: "invalid_action" }, { status: 400 });
  const me = await telegramCall("getMe");
  if (!me.ok) return Response.json({ ok: false, error: me.error }, { status: 502 });
  const bot = me.result as { id?: number; username?: string; first_name?: string };
  const botId = String(bot?.id || botToken.split(":")[0]);
  const targetIsBot = !!chatId && (String(chatId).trim() === botId || String(chatId).trim().replace(/^@/, "").toLowerCase() === String(bot?.username || "").toLowerCase());
  if (action === "verify") {
    return Response.json({
      ok: true,
      bot: { id: bot?.id, username: bot?.username, firstName: bot?.first_name },
      chatIdConfigured: !!chatId,
      configuredChatId: chatId || "",
      targetIsBot,
      warning: targetIsBot ? BOT_TARGET_ERROR : undefined,
    });
  }
  if (action === "set-chat") {
    const selected = String(body.chatId || "").trim();
    if (!/^-?\d{5,}$/.test(selected) || selected === botId) return Response.json({ ok: false, error: BOT_TARGET_ERROR }, { status: 400 });
    await saveSettings("notifications", { ...settings, telegram: { ...settings.telegram, chatId: selected, enabled: true } });
    return Response.json({ ok: true, chatId: selected });
  }
  const result = await telegramCall("getUpdates");
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 502 });
  const updates = Array.isArray(result.result) ? result.result : [];
  const chats = new Map<string, { id: string; name: string; type: string }>();
  for (const item of updates as Record<string, unknown>[]) {
    const msg = (item.message || item.channel_post || item.edited_message || item.callback_query) as Record<string, unknown> | undefined;
    const chat = (msg?.chat || (msg?.message as Record<string, unknown> | undefined)?.chat) as Record<string, unknown> | undefined;
    if (chat?.id !== undefined) {
      const id = String(chat.id);
      if (id === botId) continue; // A bot cannot DM itself; never offer its own ID as a target.
      chats.set(id, { id, name: String(chat.title || chat.username || chat.first_name || id), type: String(chat.type || "private") });
    }
  }
  return Response.json({ ok: true, bot: { id: bot?.id, username: bot?.username, firstName: bot?.first_name }, chats: [...chats.values()], chatIdConfigured: chatId || "", targetIsBot });
}
