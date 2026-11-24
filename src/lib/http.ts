import fs from "fs";
import { getSettings } from "@/lib/settings";

export function originOf(req: Request): string {
  const env = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host && !/^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/.test(host)) {
    const proto = (h.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")).split(",")[0].trim();
    return `${proto}://${host}`;
  }
  if (env) return env;
  return new URL(req.url).origin;
}

/**
 * Origin used in subscription links. When a dedicated subscription domain is
 * configured AND it has a certificate, links use https://<subDomain>.
 */
export async function subscriptionOriginOf(req: Request): Promise<string> {
  try {
    const sec = await getSettings("security");
    const sub = String(sec.domainsPorts.subDomain || "").trim().toLowerCase();
    if (sub && fs.existsSync(`/etc/letsencrypt/live/${sub}/fullchain.pem`)) return `https://${sub}`;
  } catch {
    /* fall back */
  }
  return originOf(req);
}

const g = globalThis as unknown as { __vvsmRl?: Map<string, { n: number; reset: number }> };
/** Simple in-memory fixed-window rate limiter (per process). */
export function rateLimit(key: string, perMinute: number): boolean {
  g.__vvsmRl ??= new Map();
  const now = Date.now();
  const e = g.__vvsmRl.get(key);
  if (!e || e.reset < now) {
    g.__vvsmRl.set(key, { n: 1, reset: now + 60000 });
    if (g.__vvsmRl.size > 5000) for (const [k, v] of g.__vvsmRl) if (v.reset < now) g.__vvsmRl.delete(k);
    return true;
  }
  e.n++;
  return e.n <= perMinute;
}
