// Client-safe formatting helpers and shared constants.

export const LANGS = [
  { code: "en", label: "English" },
  { code: "fa", label: "فارسی" },
  { code: "ru", label: "Русский" },
  { code: "de", label: "Deutsch" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];

export const PROTOCOLS = ["vless", "vmess", "trojan", "hysteria2", "wireguard", "openvpn", "psiphon"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const PROTOCOL_COLORS: Record<string, string> = {
  vless: "#6366f1",
  vmess: "#06b6d4",
  trojan: "#f59e0b",
  hysteria2: "#ec4899",
  wireguard: "#10b981",
  openvpn: "#f97316",
  psiphon: "#8b5cf6",
};

export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(" ");
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function formatBytes(v: unknown, digits = 1): string {
  let n = num(v);
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}

/** Bytes per second → human bit-rate. */
export function formatRate(v: unknown): string {
  let n = num(v) * 8;
  const u = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatNumber(v: unknown): string {
  return new Intl.NumberFormat("en-US").format(Math.round(num(v) * 100) / 100);
}

export function formatCompact(v: unknown): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(num(v));
}

export function formatMoney(v: unknown): string {
  const n = num(v);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

export function formatDate(v: unknown, withTime = false): string {
  if (!v) return "—";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}

export function daysLeft(v: unknown): number | null {
  if (!v) return null;
  const d = new Date(v as string).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / 86400000);
}

export function flag(cc: string): string {
  const c = String(cc || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
