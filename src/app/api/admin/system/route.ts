import { asc, gt } from "drizzle-orm";
import { db } from "@/db";
import { serverMetrics } from "@/db/schema";
import { getAdmin, unauthorized } from "@/lib/auth";
import { coreStatus, sampleSystem } from "@/lib/system";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const sample = await sampleSystem();
  const out: Record<string, unknown> = { now: sample };
  if (sp.get("cores")) out.cores = await coreStatus();
  const h = Number(sp.get("history") || 0);
  if (h > 0) {
    const rows = await db
      .select()
      .from(serverMetrics)
      .where(gt(serverMetrics.ts, new Date(Date.now() - Math.min(h, 1440) * 60000)))
      .orderBy(asc(serverMetrics.ts));
    out.history = rows.map((r) => ({ ts: r.ts.getTime(), cpu: r.cpu, mem: r.mem, disk: r.disk, rx: r.rxBps, tx: r.txBps, load: r.load1 }));
  }
  return Response.json(out);
}
