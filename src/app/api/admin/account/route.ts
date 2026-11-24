import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { getAdmin, hashPassword, strongEnough, unauthorized, verifyPassword } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await getAdmin();
  if (!a) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const sec = (await getSettings("security")).access;
  switch (b.action) {
    case "change-password": {
      if (!verifyPassword(b.current || "", a.passwordHash)) return Response.json({ error: "invalid_credentials" }, { status: 400 });
      if (!strongEnough(b.next || "", sec.minPasswordLength, sec.requireComplex)) return Response.json({ error: "weak_password" }, { status: 400 });
      await db.update(admins).set({ passwordHash: hashPassword(b.next), mustChange: false }).where(eq(admins.id, a.id));
      await logEvent("info", "auth", `admin "${a.username}" changed password`);
      return Response.json({ ok: true });
    }
    case "change-username": {
      const u = (b.username || "").trim().slice(0, 40);
      if (u.length < 3) return Response.json({ error: "invalid_input" }, { status: 400 });
      await db.update(admins).set({ username: u }).where(eq(admins.id, a.id));
      return Response.json({ ok: true });
    }
    case "2fa-setup": {
      const secret = generateTotpSecret();
      await db.update(admins).set({ totpSecret: secret, totpEnabled: false }).where(eq(admins.id, a.id));
      return Response.json({ secret, url: otpauthUrl(a.username, secret, (await getSettings("general")).siteName) });
    }
    case "2fa-enable": {
      if (!a.totpSecret || !verifyTotp(a.totpSecret, b.code || "")) return Response.json({ error: "invalid_code" }, { status: 400 });
      await db.update(admins).set({ totpEnabled: true }).where(eq(admins.id, a.id));
      await logEvent("info", "auth", `2FA enabled for "${a.username}"`);
      return Response.json({ ok: true });
    }
    case "2fa-disable": {
      if (!verifyPassword(b.password || "", a.passwordHash)) return Response.json({ error: "invalid_credentials" }, { status: 400 });
      if (a.totpEnabled && a.totpSecret && !verifyTotp(a.totpSecret, b.code || "")) return Response.json({ error: "invalid_code" }, { status: 400 });
      await db.update(admins).set({ totpEnabled: false, totpSecret: null }).where(eq(admins.id, a.id));
      await logEvent("warn", "auth", `2FA disabled for "${a.username}"`);
      return Response.json({ ok: true });
    }
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
