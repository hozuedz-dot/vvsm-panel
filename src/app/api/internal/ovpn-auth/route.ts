import { verifyPassword } from "@/lib/auth";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { internalKey } from "@/lib/cores";
import { isUsable } from "@/lib/users";

export const dynamic = "force-dynamic";

// Called by /opt/vvsm/scripts/ovpn-auth.sh (OpenVPN auth-user-pass-verify) on localhost only.
export async function POST(req: Request) {
  if (req.headers.get("x-internal-key") !== internalKey()) return new Response("forbidden", { status: 403 });
  const form = new URLSearchParams(await req.text());
  const username = form.get("username") || "";
  const password = form.get("password") || "";
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u || !isUsable(u)) return new Response("denied", { status: 403 });
  const a = Buffer.from(u.vpnPassword);
  const b = Buffer.from(password);
  // accept the VPN password shown on the subscription page OR the customer's account password
  const okVpn = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!okVpn && !verifyPassword(password, u.passwordHash)) return new Response("denied", { status: 403 });
  return new Response("ok");
}
