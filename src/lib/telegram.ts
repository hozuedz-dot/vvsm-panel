import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { db } from "@/db";
import { logs } from "@/db/schema";
import { getSettings } from "@/lib/settings";

export async function logEvent(level: "info" | "warn" | "error", category: string, message: string) {
  try {
    await db.insert(logs).values({ level, category, message: message.slice(0, 2000) });
  } catch (e) {
    console.error("[vvsm] log failed", e);
  }
}

type TgResult = { ok: boolean; result?: unknown; error?: string };

function agentFor(proxy: string) {
  if (!proxy) return undefined;
  if (/^socks/i.test(proxy)) return new SocksProxyAgent(proxy);
  return new HttpsProxyAgent(proxy);
}

function post(url: string, body: unknown, proxy: string): Promise<TgResult> {
  return new Promise((resolve) => {
    const data = JSON.stringify(body ?? {});
    const req = https.request(url, { method: "POST", agent: agentFor(proxy), timeout: 12000, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try {
          const j = JSON.parse(buf) as { ok: boolean; result?: unknown; description?: string };
          resolve(j.ok ? { ok: true, result: j.result } : { ok: false, error: j.description || `HTTP ${res.statusCode}` });
        } catch {
          resolve({ ok: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout (api.telegram.org unreachable — set a proxy)")));
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.end(data);
  });
}

export async function telegramCall(method: string, params: Record<string, unknown> = {}, override?: { botToken?: string; proxy?: string }): Promise<TgResult> {
  const s = (await getSettings("notifications")).telegram;
  const botToken = override?.botToken || s.botToken;
  if (!botToken) return { ok: false, error: "telegram_not_configured" };
  return post(`https://api.telegram.org/bot${botToken}/${method}`, params, override?.proxy ?? (s.proxy || process.env.TELEGRAM_PROXY || ""));
}

export async function sendTelegram(text: string, override?: { botToken?: string; chatId?: string }): Promise<TgResult> {
  const s = (await getSettings("notifications")).telegram;
  const chatId = override?.chatId || s.chatId;
  if (!(override?.botToken || s.botToken) || !chatId) return { ok: false, error: "telegram_not_configured" };
  return telegramCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }, { botToken: override?.botToken });
}

export type NotifyEvent = "newOrder" | "renewal" | "userExpiring" | "userExpired" | "limitReached" | "nodeOffline" | "highCpu" | "backup" | "adminLogin";

export async function notify(event: NotifyEvent, html: string) {
  try {
    const s = await getSettings("notifications");
    if (!s.telegram.enabled || !(s.events as Record<string, boolean>)[event]) return;
    const r = await sendTelegram(html);
    if (!r.ok) await logEvent("warn", "telegram", `notify ${event} failed: ${r.error}`);
  } catch {
    /* never break callers */
  }
}
