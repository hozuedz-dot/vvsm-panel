/* eslint-disable @typescript-eslint/no-explicit-any */
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { randomPassword, token, uuid, x25519 } from "@/lib/keys";
import { getSettings } from "@/lib/settings";

export const GB = 1024 * 1024 * 1024;
export type User = typeof users.$inferSelect;

/** A user may connect only if active, not expired and under quota. */
export function isUsable(u: Pick<User, "status" | "expiresAt" | "dataLimitBytes" | "usedBytes">): boolean {
  if (u.status !== "active") return false;
  if (u.expiresAt && new Date(u.expiresAt).getTime() < Date.now()) return false;
  if (u.dataLimitBytes > 0 && u.usedBytes >= u.dataLimitBytes) return false;
  return true;
}

function ipToInt(ip: string) {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

/** Allocate the next free WireGuard client address inside the configured interface subnet. */
export async function allocateWgIp(): Promise<string> {
  const wg = await getSettings("wireguard");
  const [addr, prefixRaw] = wg.interfaceAddress.split("/");
  const prefix = Math.min(30, Math.max(8, Number(prefixRaw) || 16));
  const server = ipToInt(addr);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net = server & mask;
  const size = 2 ** (32 - prefix);
  const used = new Set((await db.select({ ip: users.wgIp }).from(users).where(isNotNull(users.wgIp))).map((r) => r.ip));
  for (let i = 2; i < size - 1; i++) {
    const cand = intToIp((net + i) >>> 0);
    if ((net + i) >>> 0 === server || used.has(cand)) continue;
    return cand;
  }
  throw new Error("wireguard_pool_exhausted");
}

export async function createUser(data: Record<string, any> & { rawPassword?: string }) {
  const lim = await getSettings("limits");
  const password = data.rawPassword || randomPassword(12);
  const w = x25519();
  const username = String(data.username || `user${token(6).toLowerCase()}`).trim().toLowerCase();
  const values: typeof users.$inferInsert = {
    username,
    email: String(data.email || ""),
    passwordHash: hashPassword(password),
    subToken: token(24),
    uuid: uuid(),
    vpnPassword: randomPassword(16),
    wgPrivateKey: w.privateKey,
    wgPublicKey: w.publicKey,
    wgIp: await allocateWgIp(),
    status: data.status || "active",
    planId: data.planId || null,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    dataLimitBytes: Number(data.dataLimitBytes) || 0,
    monthlyLimitBytes: Number(data.monthlyLimitBytes) || (lim.monthlyCapGb > 0 ? lim.monthlyCapGb * GB : 0),
    speedLimitMbps: Number(data.speedLimitMbps) || lim.speedDefaultMbps || 0,
    deviceLimit: Number(data.deviceLimit) || lim.deviceDefault || 0,
    telegramId: String(data.telegramId || ""),
    note: String(data.note || ""),
    source: data.source || "admin",
  };
  const [user] = await db.insert(users).values(values).returning();
  return { user, password };
}
