import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cleanIps } from "@/db/schema";
import { getAdmin, unauthorized } from "@/lib/auth";
import { resolveSourceRanges, scan } from "@/lib/scanner";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = await getSettings("cleanip");
  const manual = String(b.ranges || "").split(/[\n,\s]+/).filter(Boolean);
  const sources = Array.isArray(b.sources) ? b.sources.filter((s): s is string => typeof s === "string" && ["manual", "cloudflare", "fastly"].includes(s)) : settings.sources;
  const resolved = await resolveSourceRanges(sources, manual);
  const ports = String(b.ports || "443").split(/[\n,\s]+/).map(Number).filter((n) => n > 0 && n < 65536);
  if (!resolved.ranges.length) return Response.json({ error: "sources_unavailable", warnings: resolved.warnings }, { status: 400 });
  const probed = await scan({
    ranges: resolved.ranges,
    ports,
    sni: String(b.sni || "speed.cloudflare.com"),
    timeoutMs: Number(b.timeoutMs) || 2500,
    concurrency: Number(b.concurrency) || 60,
    sample: Number(b.sample) || 80,
    rounds: Number(b.rounds) || 2,
  });
  const maxLatency = Math.max(1, Number(b.maxLatencyMs) || settings.maxLatencyMs);
  const maxLoss = Math.min(100, Math.max(0, Number(b.maxLossPct ?? settings.maxLossPct)));
  const results = probed.map((entry) => ({ ...entry, status: entry.status === "clean" && entry.latencyMs <= maxLatency && entry.lossPct <= maxLoss ? "clean" as const : "blocked" as const }));
  let saved = 0;
  if (b.save) {
    for (const r of results.filter((x) => x.status === "clean").slice(0, Number(b.keep) || 30)) {
      await db.delete(cleanIps).where(and(eq(cleanIps.ip, r.ip), eq(cleanIps.port, r.port)));
      await db.insert(cleanIps).values({ ip: r.ip, port: r.port, latencyMs: r.latencyMs, lossPct: r.lossPct, provider: r.provider, status: r.status, note: r.colo ? `colo ${r.colo}` : "" });
      saved++;
    }
    await logEvent("info", "tools", `clean-ip scan finished: ${results.length} probed, ${saved} saved`);
  }
  return Response.json({ results, saved, clean: results.filter((x) => x.status === "clean").length, sources: resolved.counts, warnings: resolved.warnings });
}
