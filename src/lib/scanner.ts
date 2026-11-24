import tls from "tls";

export type ScanResult = { ip: string; port: number; latencyMs: number; lossPct: number; provider: string; colo: string; status: "clean" | "blocked" };

const FALLBACK: Record<string, string[]> = {
  cloudflare: ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"],
  fastly: ["23.235.32.0/20", "43.249.72.0/22", "103.244.50.0/24", "103.245.222.0/23", "103.245.224.0/24", "104.156.80.0/20", "140.248.64.0/18", "140.248.128.0/17", "146.75.0.0/17", "151.101.0.0/16", "157.52.64.0/18", "167.82.0.0/17", "172.111.64.0/18", "185.31.16.0/22", "199.27.72.0/21", "199.232.0.0/16"],
};

export async function resolveSourceRanges(sources: string[], manual: string[]) {
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  const ranges: string[] = [];
  const valid = (c: string) => /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(c);
  if (sources.includes("manual")) {
    const m = manual.filter(valid);
    ranges.push(...m);
    counts.manual = m.length;
  }
  for (const src of ["cloudflare", "fastly"]) {
    if (!sources.includes(src)) continue;
    let list: string[] = [];
    try {
      if (src === "cloudflare") list = (await (await fetch("https://www.cloudflare.com/ips-v4", { signal: AbortSignal.timeout(6000) })).text()).split(/\s+/).filter(valid);
      else list = ((await (await fetch("https://api.fastly.com/public-ip-list", { signal: AbortSignal.timeout(6000) })).json()) as { addresses?: string[] }).addresses?.filter(valid) || [];
    } catch {
      warnings.push(`${src}: live list unreachable — built-in list used`);
    }
    if (!list.length) list = FALLBACK[src];
    ranges.push(...list);
    counts[src] = list.length;
  }
  return { ranges: [...new Set(ranges)], counts, warnings };
}

const ipToInt = (ip: string) => ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

function sampleIps(ranges: string[], total: number): { ip: string; provider: string }[] {
  const out = new Map<string, string>();
  const parsed = ranges.map((r) => {
    const [ip, p] = r.split("/");
    const prefix = Math.min(32, Math.max(8, Number(p ?? 32)));
    const size = 2 ** (32 - prefix);
    return { base: (ipToInt(ip) & (prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0)) >>> 0, size, provider: guessProvider(ip) };
  });
  let guard = 0;
  while (out.size < total && guard++ < total * 20 && parsed.length) {
    const r = parsed[Math.floor(Math.random() * parsed.length)];
    const off = r.size <= 2 ? 0 : 1 + Math.floor(Math.random() * (r.size - 2));
    out.set(intToIp((r.base + off) >>> 0), r.provider);
  }
  return [...out].map(([ip, provider]) => ({ ip, provider }));
}

function guessProvider(ip: string) {
  const n = ipToInt(ip);
  const inR = (list: string[]) => list.some((c) => { const [b, p] = c.split("/"); const m = (0xffffffff << (32 - Number(p))) >>> 0; return ((n & m) >>> 0) === ((ipToInt(b) & m) >>> 0); });
  return inR(FALLBACK.cloudflare) ? "cloudflare" : inR(FALLBACK.fastly) ? "fastly" : "custom";
}

function probe(ip: string, port: number, sni: string, timeoutMs: number, wantColo: boolean): Promise<{ ok: boolean; ms: number; colo: string }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (ok: boolean, colo = "") => { if (done) return; done = true; sock.destroy(); resolve({ ok, ms: Date.now() - t0, colo }); };
    const sock = tls.connect({ host: ip, port, servername: sni, rejectUnauthorized: false, timeout: timeoutMs, ALPNProtocols: ["http/1.1"] }, () => {
      const ms = Date.now() - t0;
      if (!wantColo) { done = true; sock.destroy(); return resolve({ ok: true, ms, colo: "" }); }
      let buf = "";
      sock.on("data", (d) => { buf += d.toString(); const m = /colo=([A-Z]{3})/.exec(buf); if (m) { done = true; sock.destroy(); resolve({ ok: true, ms, colo: m[1] }); } });
      sock.write(`GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${sni}\r\nConnection: close\r\n\r\n`);
      setTimeout(() => { if (!done) { done = true; sock.destroy(); resolve({ ok: true, ms, colo: "" }); } }, timeoutMs);
    });
    sock.on("timeout", () => finish(false));
    sock.on("error", () => finish(false));
  });
}

export async function scan(o: { ranges: string[]; ports: number[]; sni: string; timeoutMs: number; concurrency: number; sample: number; rounds: number }): Promise<ScanResult[]> {
  const ips = sampleIps(o.ranges, Math.min(2000, Math.max(1, o.sample)));
  const jobs = ips.flatMap((x) => (o.ports.length ? o.ports : [443]).map((port) => ({ ...x, port })));
  const results: ScanResult[] = [];
  let i = 0;
  const rounds = Math.min(4, Math.max(1, o.rounds));
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      const times: number[] = [];
      let colo = "";
      for (let r = 0; r < rounds; r++) {
        const p = await probe(j.ip, j.port, o.sni, o.timeoutMs, r === 0);
        if (p.ok) { times.push(p.ms); colo ||= p.colo; } else if (r === 0) break;
      }
      const lossPct = Math.round(((rounds - times.length) / rounds) * 100);
      results.push({ ip: j.ip, port: j.port, provider: j.provider, colo, latencyMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0, lossPct, status: times.length ? "clean" : "blocked" });
    }
  };
  await Promise.all(Array.from({ length: Math.min(200, Math.max(1, o.concurrency)) }, worker));
  return results.sort((a, b) => (a.status === b.status ? a.latencyMs - b.latencyMs : a.status === "clean" ? -1 : 1));
}
