import path from "node:path";
import { getAdmin, unauthorized } from "@/lib/auth";
import { subscriptionOriginOf } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { run } from "@/lib/system";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function status(req: Request) {
  const sec = await getSettings("security");
  const domain = sec.domainsPorts.subDomain.trim().toLowerCase();
  const origin = await subscriptionOriginOf(req);
  let diagnostics: Record<string, string> | null = null;
  if (domain && process.env.E2B_SANDBOX !== "true") {
    const result = await run("bash", [path.join(process.cwd(), "scripts", "configure-subdomain.sh"), "status", domain, sec.domainsPorts.acmeEmail || "unused@example.com"], 20000);
    if (result.ok) {
      diagnostics = {};
      for (const line of result.out.split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) diagnostics[line.slice(0, i)] = line.slice(i + 1);
      }
    }
  }
  return { domain, origin, https: !!domain && origin === `https://${domain}`, preview: process.env.E2B_SANDBOX === "true", acmeEmailConfigured: !!sec.domainsPorts.acmeEmail.trim(), diagnostics };
}

export async function GET(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  return Response.json(await status(req), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return unauthorized();
  if (process.env.E2B_SANDBOX === "true") return Response.json({ error: "server_only" }, { status: 403 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "test" && action !== "activate") return Response.json({ error: "invalid_action" }, { status: 400 });
  const sec = await getSettings("security");
  const domain = sec.domainsPorts.subDomain.trim().toLowerCase();
  const email = sec.domainsPorts.acmeEmail.trim();
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(domain)) return Response.json({ error: "invalid_subdomain" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "invalid_acme_email" }, { status: 400 });
  const result = await run("bash", [path.join(process.cwd(), "scripts", "configure-subdomain.sh"), action, domain, email], 170000);
  await logEvent(result.ok ? "info" : "warn", "tls", `admin ${admin.username} ${action} subscription domain ${domain}: ${result.ok ? "ok" : "failed"}`);
  return Response.json({ ok: result.ok, output: result.out.slice(-4000), ...(await status(req)) }, { status: result.ok ? 200 : 422 });
}
