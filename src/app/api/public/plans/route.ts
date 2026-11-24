import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getSettings, DEFAULTS } from "@/lib/settings";
import { paymentOptions } from "@/lib/payments";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const safe = async <T,>(name: string, p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    await logEvent("error", "public", `plans api: ${name} failed: ${e instanceof Error ? e.message : e}`);
    return fallback;
  }
};

// Plans are always returned; a broken payment/settings config never hides the pricing cards.
export async function GET() {
  const rows = await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder), asc(plans.id));
  const [pay, g, m] = await Promise.all([
    safe("payments", paymentOptions(), { enabled: false, provider: null, testMode: false, allowNew: false, allowRenew: false, currencies: [], error: "payments_config_error" } as Awaited<ReturnType<typeof paymentOptions>> & { error?: string }),
    safe("general", getSettings("general"), DEFAULTS.general),
    safe("maintenance", getSettings("maintenance"), DEFAULTS.maintenance),
  ]);
  return Response.json(
    {
      plans: rows.map((p) => ({ id: p.id, name: p.name, description: p.description, priceUsd: p.priceUsd, durationDays: p.durationDays, dataLimitGb: p.dataLimitGb, speedLimitMbps: p.speedLimitMbps, deviceLimit: p.deviceLimit, protocols: p.protocols, featured: p.featured })),
      payment: pay,
      site: { name: g.siteName, domain: g.domain, supportUrl: g.supportUrl, supportEmail: g.supportEmail, defaultLanguage: g.defaultLanguage },
      maintenance: m.enabled ? m.message || "maintenance" : null,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
