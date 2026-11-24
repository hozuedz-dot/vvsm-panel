import crypto from "crypto";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, users } from "@/db/schema";

/**
 * Preview-only switch: PREVIEW_NO_LOGIN=true or the hosted E2B sandbox opens the
 * admin panel and portal without signing in. An explicit PREVIEW_NO_LOGIN=false
 * always disables this fallback. Passwords, 2FA, lockout and IP allow-list remain
 * in the code and are required on normal Linux installations.
 */
export const previewNoLogin = () =>
  process.env.PREVIEW_NO_LOGIN === "true" ||
  (process.env.PREVIEW_NO_LOGIN !== "false" && process.env.E2B_SANDBOX === "true");

const secret = () => process.env.SESSION_SECRET || process.env.DATABASE_URL || "vvsm-dev-secret";

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${h}`;
}

export function verifyPassword(pw: string, stored: string) {
  if (!stored) return false;
  const [alg, salt, h] = stored.split("$");
  if (alg !== "scrypt" || !salt || !h) return false;
  const calc = crypto.scryptSync(pw, salt, 64);
  const orig = Buffer.from(h, "hex");
  return orig.length === calc.length && crypto.timingSafeEqual(orig, calc);
}

export function sign(payload: Record<string, unknown>, ttlSec: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(tok: string | undefined | null): Record<string, unknown> | null {
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  const exp = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export async function setSessionCookie(name: string, value: string, maxAgeSec: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: maxAgeSec,
  });
}

export async function clearSessionCookie(name: string) {
  (await cookies()).set(name, "", { path: "/", maxAge: 0 });
}

export async function getAdmin() {
  const c = (await cookies()).get("vvsm_admin")?.value;
  const p = verifyToken(c);
  if (p && p.t === "admin") {
    const rows = await db.select().from(admins).where(eq(admins.id, Number(p.id))).limit(1);
    if (rows[0]) return rows[0];
  }
  if (previewNoLogin()) {
    const rows = await db.select().from(admins).orderBy(asc(admins.id)).limit(1);
    return rows[0] ?? null;
  }
  return null;
}

export async function getPortalUser() {
  const c = (await cookies()).get("vvsm_user")?.value;
  const p = verifyToken(c);
  if (p && p.t === "user") {
    const rows = await db.select().from(users).where(eq(users.id, Number(p.id))).limit(1);
    if (rows[0]) return rows[0];
  }
  if (previewNoLogin()) {
    const rows = await db.select().from(users).where(eq(users.status, "active")).orderBy(asc(users.id)).limit(1);
    return rows[0] ?? null;
  }
  return null;
}

export function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function strongEnough(pw: string, min: number, complex: boolean) {
  if (pw.length < min) return false;
  if (complex && !(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw))) return false;
  return true;
}
