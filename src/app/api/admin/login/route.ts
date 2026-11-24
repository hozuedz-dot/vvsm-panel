import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { clientIp, setSessionCookie, sign, verifyPassword } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { verifyTotp } from "@/lib/totp";
import { logEvent, notify } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { username, password, code } = (await req.json().catch(() => ({}))) as { username?: string; password?: string; code?: string };
  const sec = (await getSettings("security")).access;
  const ip = clientIp(req);
  const allow = sec.ipAllowlist.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  if (allow.length && !allow.includes(ip)) return Response.json({ error: "ip_not_allowed" }, { status: 403 });
  if (!username || !password) return Response.json({ error: "invalid_credentials" }, { status: 400 });
  const [a] = await db.select().from(admins).where(eq(admins.username, username)).limit(1);
  if (a?.lockedUntil && a.lockedUntil > new Date()) return Response.json({ error: "account_locked" }, { status: 429 });
  if (!a || !verifyPassword(password, a.passwordHash)) {
    if (a) {
      const fails = a.failedAttempts + 1;
      await db
        .update(admins)
        .set({ failedAttempts: fails >= sec.maxAttempts ? 0 : fails, lockedUntil: fails >= sec.maxAttempts ? new Date(Date.now() + sec.lockMinutes * 60000) : null })
        .where(eq(admins.id, a.id));
    }
    await logEvent("warn", "auth", `failed admin login for "${String(username).slice(0, 40)}" from ${ip}`);
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (a.totpEnabled && a.totpSecret) {
    if (!code) return Response.json({ need2fa: true }, { status: 200 });
    if (!verifyTotp(a.totpSecret, code)) return Response.json({ error: "invalid_code", need2fa: true }, { status: 401 });
  }
  await db.update(admins).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(admins.id, a.id));
  await setSessionCookie("vvsm_admin", sign({ t: "admin", id: a.id }, sec.sessionHours * 3600), sec.sessionHours * 3600);
  await logEvent("info", "auth", `admin "${a.username}" signed in from ${ip}`);
  await notify("adminLogin", `🔐 Admin <b>${a.username}</b> signed in from ${ip}`);
  return Response.json({ ok: true });
}
