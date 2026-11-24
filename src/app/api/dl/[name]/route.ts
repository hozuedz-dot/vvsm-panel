import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { downloadKey } from "@/lib/tunnel-install";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Mirror of OFFICIAL core downloads for servers that cannot reach GitHub (typical in Iran).
// Integrity is still verified on the target by scripts/vvsm-core.sh (checksums come from the same official releases).
const GH = "https://github.com";
const goJson = async () => (await (await fetch("https://go.dev/dl/?mode=json", { signal: AbortSignal.timeout(20000) })).json()) as { version: string; files: { filename: string; os: string; arch: string; kind: string }[] }[];
const goFile = (arch: string) => async () => `https://go.dev/dl/${(await goJson())[0].files.find((f) => f.os === "linux" && f.arch === arch && f.kind === "archive")!.filename}`;

const SOURCES: Record<string, string | (() => Promise<string>)> = {
  "Xray-linux-64.zip": `${GH}/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip`,
  "Xray-linux-64.zip.dgst": `${GH}/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip.dgst`,
  "Xray-linux-arm64-v8a.zip": `${GH}/XTLS/Xray-core/releases/latest/download/Xray-linux-arm64-v8a.zip`,
  "Xray-linux-arm64-v8a.zip.dgst": `${GH}/XTLS/Xray-core/releases/latest/download/Xray-linux-arm64-v8a.zip.dgst`,
  "hysteria-linux-amd64": `${GH}/HyNetworks/hysteria/releases/latest/download/hysteria-linux-amd64`,
  "hysteria-linux-arm64": `${GH}/HyNetworks/hysteria/releases/latest/download/hysteria-linux-arm64`,
  "hysteria-hashes.txt": `${GH}/HyNetworks/hysteria/releases/latest/download/hashes.txt`,
  "amneziawg-tools.zip": `${GH}/amnezia-vpn/amneziawg-tools/releases/latest/download/ubuntu-22.04-amneziawg-tools.zip`,
  "amneziawg-tools-src.tar.gz": `${GH}/amnezia-vpn/amneziawg-tools/archive/refs/heads/master.tar.gz`,
  "amneziawg-go-src.tar.gz": `${GH}/amnezia-vpn/amneziawg-go/archive/refs/heads/master.tar.gz`,
  "go-versions.json": "https://go.dev/dl/?mode=json",
  "go-linux-amd64.tar.gz": goFile("amd64"),
  "go-linux-arm64.tar.gz": goFile("arm64"),
  "openvpn-repo-public.gpg": "https://swupdate.openvpn.net/repos/repo-public.gpg",
  "psiphon-x86_64": `${GH}/Psiphon-Labs/psiphon-tunnel-core-binaries/raw/master/linux/psiphon-tunnel-core-x86_64`,
  "psiphon-arm64": `${GH}/Psiphon-Labs/psiphon-tunnel-core-binaries/raw/master/linux/psiphon-tunnel-core-arm64`,
  "geoip.dat": "https://raw.githubusercontent.com/Chocolate4U/Iran-v2ray-rules/release/geoip.dat",
  "geosite.dat": "https://raw.githubusercontent.com/Chocolate4U/Iran-v2ray-rules/release/geosite.dat",
};
// served from disk only (built/published by the panel's own vvsm-core run, or shipped with the panel)
const LOCAL: Record<string, string[]> = {
  "vvsm-core.sh": [path.join(process.cwd(), "scripts", "vvsm-core.sh")],
  "amneziawg-go-linux-amd64": [path.join(process.cwd(), "data", "cache", "amneziawg-go-linux-amd64")],
  "amneziawg-go-linux-arm64": [path.join(process.cwd(), "data", "cache", "amneziawg-go-linux-arm64")],
  "geoip.dat": ["/usr/local/share/xray/geoip.dat"],
  "geosite.dat": ["/usr/local/share/xray/geosite.dat"],
};
const CACHE = path.join(process.cwd(), "data", "cache", "mirror");
const inflight = new Map<string, Promise<string | null>>();

async function ensure(name: string): Promise<string | null> {
  for (const f of LOCAL[name] || []) if (fs.existsSync(f)) return f;
  const src = SOURCES[name];
  if (!src) return null;
  const file = path.join(CACHE, name);
  const st = await fsp.stat(file).catch(() => null);
  const maxAge = name.endsWith(".json") || name.endsWith(".dgst") || name.endsWith(".txt") ? 3600e3 : 12 * 3600e3;
  if (st && st.size > 0 && Date.now() - st.mtimeMs < maxAge) return file;
  if (!inflight.has(name)) {
    inflight.set(name, (async () => {
      try {
        await fsp.mkdir(CACHE, { recursive: true });
        const url = typeof src === "string" ? src : await src();
        const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(280000) });
        if (!r.ok) return st ? file : null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) return st ? file : null;
        await fsp.writeFile(`${file}.part`, buf);
        await fsp.rename(`${file}.part`, file);
        return file;
      } catch {
        return st ? file : null;
      } finally {
        inflight.delete(name);
      }
    })());
  }
  return inflight.get(name)!;
}

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (new URL(req.url).searchParams.get("k") !== downloadKey()) return new Response("forbidden", { status: 403 });
  if (!SOURCES[name] && !LOCAL[name]) return new Response("not found", { status: 404 });
  const file = await ensure(name);
  if (!file) return new Response("not available", { status: 404 });
  const data = await fsp.readFile(file);
  return new Response(new Uint8Array(data), { headers: { "content-type": "application/octet-stream", "content-length": String(data.length), "cache-control": "no-store" } });
}
