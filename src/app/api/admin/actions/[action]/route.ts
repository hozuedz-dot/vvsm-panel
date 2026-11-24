/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs/promises";
import { spawn } from "child_process";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backups, cleanIps, inbounds, logs, nodes, tunnels, users } from "@/db/schema";
import { getAdmin, unauthorized } from "@/lib/auth";
import { applyCores, applyState, buildXrayConfig, previewConfig, scheduleApply } from "@/lib/cores";
import { sendTelegram, logEvent } from "@/lib/telegram";
import { backupPath, createBackup, deleteBackup, restoreBackup } from "@/lib/backup";
import { fulfillOrder } from "@/lib/payments";
import { clearDemo, ensureBootstrap } from "@/lib/bootstrap";
import { coreStatus, run } from "@/lib/system";
import { originOf } from "@/lib/http";
import { token, x25519, shortId } from "@/lib/keys";
import { nonXrayTunnelConfig } from "@/lib/tunnel-configs";
import { tunnelInstallKey, tunnelSideNeedsInstall, type TunnelSide } from "@/lib/tunnel-install";
import { scan } from "@/lib/scanner";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

const RESET_TABLES = ["subscriptions", "orders", "tunnels", "inbounds", "routing_rules", "traffic_stats", "vpn_sessions", "server_metrics", "clean_ips", "posts", "logs", "backups", "settings", "plans", "nodes", "users"];

async function spawnScript(script: string) {
  try {
    await fs.access(script);
  } catch {
    return false;
  }
  const p = spawn("bash", [script], { detached: true, stdio: "ignore" });
  p.unref();
  return true;
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { action } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const id = Number(b.id);
  switch (action) {
    case "apply": {
      const steps = await applyCores();
      return Response.json({ steps, state: applyState() });
    }
    case "apply-status":
      return Response.json(applyState());
    case "preview":
      return Response.json({ text: await previewConfig(String(b.core), b.nodeId ? Number(b.nodeId) : null) });
    case "test-telegram":
      return Response.json(await sendTelegram("✅ VVSM — Telegram notifications are working.", { botToken: b.botToken, chatId: b.chatId }));
    case "backup-create":
      return Response.json(await createBackup("manual"));
    case "backup-list":
      return Response.json(await db.select().from(backups).orderBy(desc(backups.createdAt)));
    case "backup-restore":
      return Response.json(await restoreBackup(id));
    case "backup-delete":
      await deleteBackup(id);
      return Response.json({ ok: true });
    case "check-updates": {
      const cores = await coreStatus();
      const repos: Record<string, string> = { xray: "XTLS/Xray-core", hysteria2: "apernet/hysteria" };
      const out: any[] = [];
      for (const [core, repo] of Object.entries(repos)) {
        let latest = "";
        try {
          const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { "user-agent": "vvsm-panel" }, signal: AbortSignal.timeout(8000) });
          const j = (await r.json()) as { tag_name?: string };
          latest = (j.tag_name || "").replace(/^app\//, "").replace(/^v/, "");
        } catch {}
        const installed = cores[core]?.version || "";
        out.push({ core, installed, latest, upToDate: !!installed && !!latest && installed === latest });
      }
      for (const core of ["wireguard", "openvpn", "nginx", "psiphon"]) out.push({ core, installed: cores[core]?.version || "", latest: "", upToDate: true });
      return Response.json({ items: out });
    }
    case "update-cores":
      return Response.json({ ok: await spawnScript("/opt/vvsm/scripts/update-cores.sh") });
    case "update-geo":
      return Response.json({ ok: await spawnScript("/opt/vvsm/scripts/update-geo.sh") });
    case "factory-reset": {
      if (b.confirm !== "RESET") return Response.json({ error: "confirmation_required" }, { status: 400 });
      for (const t of RESET_TABLES) await db.execute(sql.raw(`delete from ${t}`));
      process.env.SEED_DEMO = "false";
      (globalThis as any).__vvsmBooted = false;
      await ensureBootstrap();
      await logEvent("warn", "system", "factory reset performed");
      scheduleApply(500);
      return Response.json({ ok: true });
    }
    case "clear-demo":
      await clearDemo();
      return Response.json({ ok: true });
    case "confirm-order": {
      const r = await fulfillOrder(String(b.id));
      return Response.json({ ok: !!r });
    }
    case "reset-traffic":
      await db.update(users).set({ usedBytes: 0, monthUsedBytes: 0 }).where(eq(users.id, id));
      await db.update(users).set({ status: "active" }).where(sql`${users.id} = ${id} and ${users.status} = 'limited'`);
      scheduleApply();
      return Response.json({ ok: true });
    case "extend-user": {
      const days = Number(b.days) || 30;
      const [u] = await db.select().from(users).where(eq(users.id, id));
      if (!u) return Response.json({ error: "not_found" }, { status: 404 });
      const from = u.expiresAt && u.expiresAt > new Date() ? u.expiresAt : new Date();
      await db.update(users).set({ expiresAt: new Date(from.getTime() + days * 86400000), status: "active", notifiedExpiry: false }).where(eq(users.id, id));
      scheduleApply();
      return Response.json({ ok: true });
    }
    case "regen-token":
      await db.update(users).set({ subToken: token(24) }).where(eq(users.id, id));
      return Response.json({ ok: true });
    case "toggle-user": {
      const [u] = await db.select().from(users).where(eq(users.id, id));
      if (!u) return Response.json({ error: "not_found" }, { status: 404 });
      await db.update(users).set({ status: u.status === "disabled" ? "active" : "disabled" }).where(eq(users.id, id));
      scheduleApply();
      return Response.json({ ok: true });
    }
    case "node-script": {
      const [n] = await db.select().from(nodes).where(eq(nodes.id, id));
      if (!n) return Response.json({ error: "not_found" }, { status: 404 });
      const cmd = `curl -fsSL "${originOf(req)}/api/node/script?token=${n.agentToken}" | sudo bash`;
      return Response.json({ text: cmd });
    }
    case "tunnel-install": {
      const [t] = await db.select().from(tunnels).where(eq(tunnels.id, id));
      if (!t) return Response.json({ error: "not_found" }, { status: 404 });
      const side: TunnelSide = b.side === "exit" ? "exit" : "entry";
      const nodeId = side === "entry" ? t.entryNodeId : t.exitNodeId;
      const allNodes = await db.select().from(nodes);
      const node = nodeId ? allNodes.find((n) => n.id === nodeId) : allNodes.find((n) => n.isLocal);
      if (!node) return Response.json({ error: "node_required" }, { status: 400 });
      const where = `${side === "entry" ? "ENTRY (ورودی)" : "EXIT (خروجی)"} server: ${node.name}${node.isLocal ? " — MAIN panel server" : ""} (${node.ip || node.domain || "?"})`;
      const xraySide = !tunnelSideNeedsInstall(t, side);
      if (!xraySide && node.isLocal) return Response.json({ text: `# ${where}\n# ✔ Nothing to run by hand: sides on the MAIN server are installed and updated automatically when you press Apply.\n# (Apply → step "tunnels (main server)")` });
      if (xraySide) {
        if (t.carrier === "psiphon") return Response.json({ text: `# ${where}\n# Psiphon tunnels have no exit server — the Psiphon network is the exit. Nothing to install here.` });
        if (node.isLocal) return Response.json({ text: `# ${where}\n# Nothing to install: this side runs inside Xray on the main server and is configured by the Apply button.\n# Press Apply in the header after saving the tunnel.` });
        return Response.json({ text: `# ${where}\n# This side runs inside Xray via the VVSM node agent (install once per server, it serves every tunnel on it):\ncurl -fsSL "${originOf(req)}/api/node/script?token=${node.agentToken}" | sudo bash` });
      }
      const key = tunnelInstallKey(t.id, side);
      return Response.json({ text: `# ${where}\n# Run as root on that server:\ncurl -fsSL "${originOf(req)}/api/tunnel/script?tunnel=${t.id}&side=${side}&key=${key}" | sudo bash` });
    }
    case "tunnel-config": {
      const [t] = await db.select().from(tunnels).where(eq(tunnels.id, id));
      if (!t) return Response.json({ error: "not_found" }, { status: 404 });
      if (!["vless", "vmess", "trojan"].includes(t.carrier)) {
        const [entryNode] = t.entryNodeId ? await db.select().from(nodes).where(eq(nodes.id, t.entryNodeId)).limit(1) : [];
        const [exitNode] = t.exitNodeId ? await db.select().from(nodes).where(eq(nodes.id, t.exitNodeId)).limit(1) : [];
        return Response.json({ text: nonXrayTunnelConfig(t, entryNode, exitNode) });
      }
      const entry = await buildXrayConfig(t.entryNodeId);
      const exit = await buildXrayConfig(t.exitNodeId);
      return Response.json({ text: `// ===== ENTRY node (${t.mode === "reverse" ? "portal" : "client"}) =====\n${entry}\n\n// ===== EXIT node (${t.mode === "reverse" ? "bridge" : "server"}) =====\n${exit}` });
    }
    case "regen-keys": {
      const [i] = await db.select().from(inbounds).where(eq(inbounds.id, id));
      if (!i) return Response.json({ error: "not_found" }, { status: 404 });
      const k = x25519();
      if (i.protocol === "wireguard") await db.update(inbounds).set({ privateKey: k.privateKey, publicKey: k.publicKey }).where(eq(inbounds.id, id));
      else await db.update(inbounds).set({ privateKey: k.privateKeyUrl, publicKey: k.publicKeyUrl, shortId: shortId() }).where(eq(inbounds.id, id));
      scheduleApply();
      return Response.json({ ok: true });
    }
    case "regen-path": {
      const p = `/${token(10).toLowerCase()}`;
      await db.update(inbounds).set({ path: p, serviceName: p.slice(1) }).where(eq(inbounds.id, id));
      scheduleApply();
      return Response.json({ ok: true, path: p });
    }
    case "recheck-clean-ip": {
      const [c] = await db.select().from(cleanIps).where(eq(cleanIps.id, id));
      if (!c) return Response.json({ error: "not_found" }, { status: 404 });
      const [r] = await scan({ ranges: [`${c.ip}/32`], ports: [c.port], sni: "speed.cloudflare.com", timeoutMs: 3000, concurrency: 1, sample: 1, rounds: 3 });
      if (r) await db.update(cleanIps).set({ latencyMs: r.latencyMs, lossPct: r.lossPct, status: r.status, checkedAt: new Date() }).where(eq(cleanIps.id, id));
      return Response.json({ ok: true });
    }
    case "delete-blocked-ips":
      await db.delete(cleanIps).where(eq(cleanIps.status, "blocked"));
      return Response.json({ ok: true });
    case "clear-logs":
      await db.delete(logs);
      return Response.json({ ok: true });
    case "kernel-info": {
      const r = await run("uname", ["-a"]);
      return Response.json({ text: r.out });
    }
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}

export async function GET(req: Request, ctx: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { action } = await ctx.params;
  if (action === "download-backup") {
    const p = await backupPath(Number(new URL(req.url).searchParams.get("id")));
    if (!p) return Response.json({ error: "not_found" }, { status: 404 });
    const data = await fs.readFile(p.file).catch(() => null);
    if (!data) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(new Uint8Array(data), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${p.b.filename}"` } });
  }
  if (action === "download-config") {
    const core = new URL(req.url).searchParams.get("core") || "xray";
    const text = await previewConfig(core);
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${core}.conf"` } });
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
