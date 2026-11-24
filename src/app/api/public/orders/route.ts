import { clientIp, getPortalUser, strongEnough } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createOrder } from "@/lib/payments";
import { rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`order:${clientIp(req)}`, 12)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string | number>;
  const planId = Number(b.planId);
  const currency = String(b.currency || "");
  if (!planId || !currency) return Response.json({ error: "invalid_input" }, { status: 400 });
  let kind: "new" | "renew" = "new";
  let userId: number | null = null;
  if (b.kind === "renew") {
    const u = await getPortalUser();
    if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
    kind = "renew";
    userId = u.id;
  } else {
    const email = String(b.email || "").trim();
    const username = String(b.username || "").trim();
    const password = String(b.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) return Response.json({ error: "invalid_username" }, { status: 400 });
    const access = (await getSettings("security")).access;
    if (!strongEnough(password, Math.max(10, access.minPasswordLength), access.requireComplex)) return Response.json({ error: "weak_password" }, { status: 400 });
  }
  try {
    const o = await createOrder({ kind, planId, userId, email: String(b.email || ""), username: String(b.username || ""), password: kind === "new" ? String(b.password || "") : undefined, currency });
    return Response.json({ id: o.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
