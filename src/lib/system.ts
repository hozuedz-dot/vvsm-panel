import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";

export type RunResult = { ok: boolean; out: string; code: number | null };

export function run(cmd: string, args: string[] = [], timeoutMs = 10000, input?: string): Promise<RunResult> {
  return new Promise((resolve) => {
    try {
      const p = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } }, (err, stdout, stderr) => {
        const out = `${stdout || ""}${stderr ? (stdout ? "\n" : "") + stderr : ""}`.trim();
        if (err) resolve({ ok: false, out: out || err.message, code: typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : null });
        else resolve({ ok: true, out, code: 0 });
      });
      if (input !== undefined) {
        p.stdin?.write(input);
        p.stdin?.end();
      }
    } catch (e) {
      resolve({ ok: false, out: e instanceof Error ? e.message : String(e), code: null });
    }
  });
}

export const SERVICES: Record<string, { unit: string; version: [string, string[]] }> = {
  xray: { unit: "xray", version: ["xray", ["version"]] },
  hysteria2: { unit: "hysteria-server", version: ["hysteria", ["version"]] },
  wireguard: { unit: "awg-quick@awg0", version: ["awg", ["--version"]] },
  openvpn: { unit: "openvpn-server@vvsm", version: ["openvpn", ["--version"]] },
  psiphon: { unit: "vvsm-psiphon", version: ["psiphon-tunnel-core", ["--version"]] },
  nginx: { unit: "nginx", version: ["nginx", ["-v"]] },
  postgresql: { unit: "postgresql", version: ["psql", ["--version"]] },
};

const cache: { at: number; data: Record<string, { status: string; version: string }> | null } = { at: 0, data: null };

export async function coreStatus(): Promise<Record<string, { status: string; version: string }>> {
  if (cache.data && Date.now() - cache.at < 4000) return structuredClone(cache.data);
  const out: Record<string, { status: string; version: string }> = {};
  await Promise.all(
    Object.entries(SERVICES).map(async ([k, s]) => {
      const [st, ver] = await Promise.all([run("systemctl", ["is-active", s.unit], 3000), run(s.version[0], s.version[1], 3000)]);
      let status = st.out.split("\n")[0].trim() || "unavailable";
      if (!ver.ok && /ENOENT|not found/i.test(ver.out) && status !== "active") status = "unavailable";
      if (/ENOENT|Failed to connect|not been booted|System has not/i.test(st.out)) status = ver.ok ? "unknown" : "unavailable";
      const m = ver.ok || /version/i.test(ver.out) ? /(\d+\.\d+(?:\.\d+)?)/.exec(ver.out) : null;
      out[k] = { status, version: m ? m[1] : "" };
    })
  );
  cache.at = Date.now();
  cache.data = out;
  return structuredClone(out);
}

let prevCpu: { idle: number; total: number } | null = null;
let prevNet: { rx: number; tx: number; t: number } | null = null;

async function cpuPercent() {
  try {
    const line = (await fs.readFile("/proc/stat", "utf8")).split("\n")[0];
    const v = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = v[3] + (v[4] || 0);
    const total = v.reduce((a, b) => a + b, 0);
    const p = prevCpu;
    prevCpu = { idle, total };
    if (!p) return Math.min(100, (os.loadavg()[0] / os.cpus().length) * 100);
    const dt = total - p.total;
    return dt > 0 ? Math.max(0, Math.min(100, (1 - (idle - p.idle) / dt) * 100)) : 0;
  } catch {
    return Math.min(100, (os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100);
  }
}

async function netTotals() {
  try {
    const rows = (await fs.readFile("/proc/net/dev", "utf8")).split("\n").slice(2);
    let rx = 0, tx = 0;
    for (const r of rows) {
      const [name, rest] = r.split(":");
      if (!rest || name.trim() === "lo") continue;
      const f = rest.trim().split(/\s+/).map(Number);
      rx += f[0];
      tx += f[8];
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

async function diskUsage() {
  try {
    const s = await fs.statfs("/");
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, used: total - free };
  } catch {
    return { total: 0, used: 0 };
  }
}

export async function sampleSystem() {
  const [cpu, net, disk] = await Promise.all([cpuPercent(), netTotals(), diskUsage()]);
  const now = Date.now();
  let rxBps = 0, txBps = 0;
  if (prevNet && now > prevNet.t) {
    const dt = (now - prevNet.t) / 1000;
    rxBps = Math.max(0, (net.rx - prevNet.rx) / dt);
    txBps = Math.max(0, (net.tx - prevNet.tx) / dt);
  }
  prevNet = { ...net, t: now };
  const memTotal = os.totalmem();
  let memAvail = os.freemem();
  try {
    const mi = await fs.readFile("/proc/meminfo", "utf8");
    const m = /MemAvailable:\s+(\d+)/.exec(mi);
    if (m) memAvail = Number(m[1]) * 1024;
  } catch {}
  const memUsed = memTotal - memAvail;
  return {
    ts: now,
    cpu: Math.round(cpu * 10) / 10,
    mem: Math.round((memUsed / memTotal) * 1000) / 10,
    memUsed,
    memTotal,
    disk: disk.total ? Math.round((disk.used / disk.total) * 1000) / 10 : 0,
    diskUsed: disk.used,
    diskTotal: disk.total,
    rxBps: Math.round(rxBps),
    txBps: Math.round(txBps),
    rxTotal: net.rx,
    txTotal: net.tx,
    load: os.loadavg().map((l) => Math.round(l * 100) / 100),
    cores: os.cpus().length,
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
  };
}
