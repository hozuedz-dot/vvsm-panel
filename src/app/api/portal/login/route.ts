import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, setSessionCookie, sign, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`plogin:${clientIp(req)}`, 10)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { username?: string; password?: string; key?: string };
  let user;
  if (b.key) {
    [user] = await db.select().from(users).where(eq(users.subToken, b.key.trim().split("/").pop() || "")).limit(1);
  } else if (b.username && b.password) {
    [user] = await db.select().from(users).where(or(eq(users.username, b.username.trim().toLowerCase()), eq(users.email, b.username.trim()))).limit(1);
    if (user && !verifyPassword(b.password, user.passwordHash)) user = undefined;
  }
  if (!user) return Response.json({ error: "invalid_credentials" }, { status: 401 });
  await setSessionCookie("vvsm_user", sign({ t: "user", id: user.id }, 7 * 86400), 7 * 86400);
  return Response.json({ ok: true });
}
