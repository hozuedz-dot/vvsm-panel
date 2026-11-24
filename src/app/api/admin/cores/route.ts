import fs from "node:fs/promises";
import path from "node:path";
import { getAdmin, unauthorized } from "@/lib/auth";
import { applyCores, CONF } from "@/lib/cores";
import { coreStatus, run, SERVICES } from "@/lib/system";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Core = "xray" | "hysteria2" | "wireguard" | "openvpn" | "psiphon" | "nginx";
const CONFIG: Record<Core, string> = { xray: CONF.xray, hysteria2: CONF.hysteria, wireguard: CONF.wg, openvpn: CONF.ovpn, psiphon: CONF.psiphon, nginx: CONF.nginx };
const INSTALLABLE = new Set<Core>(["xray", "hysteria2", "wireguard", "openvpn", "psiphon"]);
const isCore = (value: string): value is Core => value in CONFIG;
const short = (value: string) => value.slice(-3200).replace(/(privateKey|password|secret|token|apiKey)\s*[:=]\s*\S+/gi, "$1=<redacted>");

async function fileInfo(file: string) {
  try {
    const stat = await fs.stat(file);
    return { exists: true, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch { return { exists: false }; }
}

async function inspect(core: Core) {
  const service = SERVICES[core];
  const [state, log, config] = await Promise.all([
    run("systemctl", ["is-active", service.unit], 3000),
    run("journalctl", ["-u", service.unit, "-n", "20", "--no-pager", "--output=cat"], 5000),
    fileInfo(CONFIG[core]),
  ]);
  let validation: { ok: boolean; output: string } | null = null;
  if (core === "xray" && config.exists) {
    const result = await run("xray", ["run", "-test", "-config", CONF.xray], 15000);
    validation = { ok: result.ok, output: short(result.out) };
  } else if (core === "nginx") {
    const result = await run("nginx", ["-t"], 8000);
    validation = { ok: result.ok, output: short(result.out) };
  } else if (core === "hysteria2" && config.exists) {
    const yaml = await fs.readFile(CONF.hysteria, "utf8").catch(() => "");
    const port = Number(/^listen:\s*:(\d+)/m.exec(yaml)?.[1] || 0);
    const cert = /^\s+cert:\s*(\S+)/m.exec(yaml)?.[1] || "";
    const key = /^\s+key:\s*(\S+)/m.exec(yaml)?.[1] || "";
    const [certFile, keyFile, sockets] = await Promise.all([fileInfo(cert), fileInfo(key), run("ss", ["-H", "-ulnp"], 4000)]);
    const listening = !!port && sockets.out.split("\n").some((row) => new RegExp(`:${port}(?:\\s|$)`).test(row));
    validation = { ok: !!port && certFile.exists && keyFile.exists && listening, output: `UDP port ${port || "missing"}: ${listening ? "listening locally" : "NOT listening"}; TLS cert: ${certFile.exists ? "found" : "missing"}; key: ${keyFile.exists ? "found" : "missing"}. Check firewall and reachability from the actual client network separately.` };
  } else if (core === "wireguard" && config.exists) {
    const result = await run("awg-quick", ["strip", "awg0"], 5000);
    const [handshakes, listen, endpoints] = await Promise.all([
      run("awg", ["show", "awg0", "latest-handshakes"], 3000),
      run("awg", ["show", "awg0", "listen-port"], 3000),
      run("awg", ["show", "awg0", "endpoints"], 3000),
    ]);
    const nowSec = Math.floor(Date.now() / 1000);
    const hs = handshakes.ok ? handshakes.out.split("\n").filter(Boolean).map((row) => Number(row.split(/\s+/)[1] || 0)) : [];
    const recent = hs.filter((ts) => ts > 0 && nowSec - ts < 180).length;
    validation = { ok: result.ok, output: result.ok ? `awg0.conf parsed (AmneziaWG userspace); listen port ${listen.out.trim() || "?"}; peers ${hs.length}; recent handshakes (<3 min) ${recent}; endpoints seen ${endpoints.ok ? endpoints.out.split("\n").filter(Boolean).length : 0}. Zero recent handshakes usually means wrong client endpoint/public key, blocked UDP, or the client profile was not refreshed.` : short(result.out) };
  } else if (core === "psiphon") {
    const s = await getSettings("psiphon");
    const fields = ["Propagation Channel ID", "Sponsor ID", "signed server list URL or target server entry"].filter((_, i) => [s.propagationChannelId, s.sponsorId, (s.remoteServerListUrl && s.remoteServerListSignaturePublicKey) || s.targetServerEntry][i] ? false : true);
    validation = { ok: fields.length === 0, output: fields.length ? `Missing: ${fields.join(", ")}` : "Credentials and server list configured. Start the service to verify connectivity." };
  }
  const assets = core === "xray" ? {
    geoip: await fileInfo("/usr/local/share/xray/geoip.dat"),
    geosite: await fileInfo("/usr/local/share/xray/geosite.dat"),
  } : undefined;
  const wg = core === "wireguard" ? await run("awg", ["show", "awg0", "peers"], 3000) : null;
  return {
    core,
    unit: service.unit,
    status: !state.ok && /Failed to connect|not been booted|ENOENT|not found/i.test(state.out) ? "unavailable" : state.out.split("\n")[0] || "unavailable",
    config,
    validation,
    assets,
    peers: wg?.ok ? wg.out.split("\n").filter(Boolean).length : null,
    journal: short(log.out),
  };
}

export async function GET(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const core = new URL(req.url).searchParams.get("core") || "";
  if (core && !isCore(core)) return Response.json({ error: "unknown_core" }, { status: 400 });
  const cores = await coreStatus();
  for (const info of Object.values(cores)) if (/Failed to connect|not been booted|ENOENT|not found/i.test(info.status)) info.status = "unavailable";
  return Response.json({ cores, detail: core && isCore(core) ? await inspect(core) : null, preview: process.env.E2B_SANDBOX === "true" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return unauthorized();
  if (process.env.E2B_SANDBOX === "true") return Response.json({ error: "Core operations require the installed Linux server" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { core?: string; action?: string };
  const core = body.core || "";
  const action = body.action || "";
  if (!isCore(core)) return Response.json({ error: "unknown_core" }, { status: 400 });
  if (action === "apply") {
    const steps = await applyCores();
    await logEvent("info", "cores", `admin ${admin.username} applied core configurations`);
    return Response.json({ ok: !steps.some((s) => s.status === "error"), steps, detail: await inspect(core) });
  }
  if (action === "update-geo" && core === "xray") {
    const r = await run("bash", [path.join(process.cwd(), "scripts", "update-geo.sh")], 200000);
    await logEvent(r.ok ? "info" : "warn", "cores", `admin ${admin.username} updated geo assets: ${r.ok ? "ok" : "failed"}`);
    return Response.json({ ok: r.ok, output: short(r.out), detail: await inspect(core) });
  }
  if ((action === "install" || action === "update") && INSTALLABLE.has(core)) {
    const r = await run("bash", [path.join(process.cwd(), "scripts", "manage-core.sh"), core, action], 200000);
    await logEvent(r.ok ? "info" : "warn", "cores", `admin ${admin.username} ${action} ${core}: ${r.ok ? "ok" : "failed"}`);
    return Response.json({ ok: r.ok, output: short(r.out), detail: await inspect(core) });
  }
  if (["start", "stop", "restart"].includes(action) && (core !== "nginx" || action === "restart")) {
    if ((action === "start" || action === "restart") && core === "xray") {
      const test = await run("xray", ["run", "-test", "-config", CONF.xray], 15000);
      if (!test.ok) return Response.json({ ok: false, error: "xray_validation_failed", output: short(test.out), detail: await inspect(core) }, { status: 422 });
    }
    if (action === "restart" && core === "nginx") {
      const test = await run("nginx", ["-t"], 8000);
      if (!test.ok) return Response.json({ ok: false, error: "nginx_validation_failed", output: short(test.out), detail: await inspect(core) }, { status: 422 });
    }
    const r = await run("systemctl", [action, SERVICES[core].unit], 20000);
    await logEvent(r.ok ? "info" : "warn", "cores", `admin ${admin.username} ${action} ${core}: ${r.ok ? "ok" : "failed"}`);
    return Response.json({ ok: r.ok, output: short(r.out), detail: await inspect(core) });
  }
  return Response.json({ error: "unsupported_action" }, { status: 400 });
}
