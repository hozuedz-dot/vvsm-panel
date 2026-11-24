import { NextResponse, type NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";

// Request gatekeeper: maintenance mode + cover site (DPI camouflage).
// Never touches /api, /admin, /sub (VPN clients), static assets.

type State = { m: Awaited<ReturnType<typeof getSettings<"maintenance">>>; c: Awaited<ReturnType<typeof getSettings<"cover">>>; at: number };
let cache: State | null = null;

async function state(): Promise<State | null> {
  if (cache && Date.now() - cache.at < 5000) return cache;
  try {
    const [m, c] = await Promise.all([getSettings("maintenance"), getSettings("cover")]);
    cache = { m, c, at: Date.now() };
  } catch {
    cache = cache ? { ...cache, at: Date.now() } : null;
  }
  return cache;
}

const SHOP = ["/", "/buy", "/pay", "/apps", "/blog", "/portal"];
const isShop = (p: string) => SHOP.some((x) => p === x || (x !== "/" && p.startsWith(`${x}/`)));

export async function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p.startsWith("/api/") || p.startsWith("/admin") || p.startsWith("/sub/") || p.startsWith("/_next")) return NextResponse.next();
  const s = await state();
  if (!s) return NextResponse.next();
  const { m, c } = s;
  const isAdmin = !!req.cookies.get("vvsm_admin")?.value;

  // secret entry link for customers when the cover site is active
  if (c.enabled && c.shopPath && p === `/${c.shopPath}`) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("vvsm_shop", "1", { maxAge: 180 * 86400, httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  }

  if (m.enabled && !isAdmin && p !== "/maintenance") {
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
    const allowed = m.allowIps.split(/[\s,]+/).filter(Boolean).includes(ip);
    const keep = (m.keepSubscriptions && p.startsWith("/s/")) || (m.keepPortal && p.startsWith("/portal"));
    if (!allowed && !keep) {
      const until = Date.parse(m.endsAt);
      const retry = Number.isFinite(until) && until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 1800;
      return NextResponse.rewrite(new URL("/maintenance", req.url), { status: 503, headers: { "Retry-After": String(retry), "Cache-Control": "no-store" } });
    }
  }

  if (c.enabled && !isAdmin && !req.cookies.get("vvsm_shop")?.value && p !== "/cover") {
    if (p === "/" || (c.hideShop && isShop(p))) return NextResponse.rewrite(new URL("/cover", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon-|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|txt|xml)$).*)"],
};
