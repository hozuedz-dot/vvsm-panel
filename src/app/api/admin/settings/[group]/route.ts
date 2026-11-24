import { getAdmin, unauthorized } from "@/lib/auth";
import { isIP } from "node:net";
import { SETTING_GROUPS, getSettings, saveSettings, type Group } from "@/lib/settings";
import { scheduleApply } from "@/lib/cores";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ group: string }> };
const APPLY = ["security", "obfuscation", "routing", "dns", "hidden", "psiphon", "wireguard", "cleanip"];

function validCidr(value: string) {
  const [ip, prefix, extra] = value.trim().split("/");
  const family = isIP(ip);
  return !extra && !!family && prefix !== undefined && Number.isInteger(Number(prefix)) && Number(prefix) >= 0 && Number(prefix) <= (family === 4 ? 32 : 128);
}
function validateWireguard(input: Record<string, unknown>) {
  if (input.interfaceAddress !== undefined && !validCidr(String(input.interfaceAddress))) return "invalid_interface_address";
  if (input.clientDns !== undefined && !String(input.clientDns).split(",").map((v) => v.trim()).every((v) => isIP(v) !== 0)) return "invalid_client_dns";
  if (input.allowedIps !== undefined && !String(input.allowedIps).split(",").map((v) => v.trim()).every(validCidr)) return "invalid_allowed_ips";
  const mtu = Number(input.mtu);
  if (input.mtu !== undefined && (!Number.isInteger(mtu) || mtu < 576 || mtu > 9000)) return "invalid_mtu";
  const keepalive = Number(input.persistentKeepalive);
  if (input.persistentKeepalive !== undefined && (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 3600)) return "invalid_keepalive";
  if (input.endpointOverride !== undefined && !/^[a-zA-Z0-9.-]{0,253}$/.test(String(input.endpointOverride).trim())) return "invalid_endpoint";
  return null;
}

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { group } = await ctx.params;
  if (!SETTING_GROUPS.includes(group as Group)) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(await getSettings(group as Group));
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { group } = await ctx.params;
  if (!SETTING_GROUPS.includes(group as Group)) return Response.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "invalid_input" }, { status: 400 });
  if (group === "wireguard") {
    const issue = validateWireguard(body as Record<string, unknown>);
    if (issue) return Response.json({ error: issue }, { status: 400 });
  }
  if (group === "security") {
    const domains = (body as Record<string, unknown>).domainsPorts as Record<string, unknown> | undefined;
    if (domains && typeof domains === "object") {
      for (const key of ["panelDomain", "subDomain"] as const) {
        if (typeof domains[key] === "string") {
          domains[key] = domains[key].trim().replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/\.$/, "").toLowerCase();
        }
      }
      if (typeof domains.acmeEmail === "string") domains.acmeEmail = domains.acmeEmail.trim().toLowerCase();
      if (domains.subDomain && !/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(String(domains.subDomain))) {
        return Response.json({ error: "invalid_subdomain" }, { status: 400 });
      }
    }
  }
  const saved = await saveSettings(group as Group, body);
  await logEvent("info", "settings", `settings "${group}" updated`);
  if (APPLY.includes(group)) scheduleApply();
  return Response.json(saved);
}
