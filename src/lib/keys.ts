import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** URL-safe random token (alphanumeric, no ambiguous chars). */
export function token(len = 24): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALNUM[bytes[i] % ALNUM.length];
  return out;
}

export const uuid = (): string => crypto.randomUUID();

export function randomPassword(len = 16): string {
  return token(len);
}

/** REALITY short id: 8 hex chars. */
export const shortId = (): string => crypto.randomBytes(4).toString("hex");

/**
 * X25519 key pair.
 * - privateKey/publicKey: standard base64 (WireGuard format)
 * - privateKeyUrl/publicKeyUrl: raw base64url without padding (Xray REALITY format)
 */
export function x25519() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  const pub = publicKey.export({ format: "jwk" }) as { x: string };
  const privRaw = Buffer.from(priv.d, "base64url");
  const pubRaw = Buffer.from(pub.x, "base64url");
  return {
    privateKey: privRaw.toString("base64"),
    publicKey: pubRaw.toString("base64"),
    privateKeyUrl: privRaw.toString("base64url"),
    publicKeyUrl: pubRaw.toString("base64url"),
  };
}

/** Derive the X25519 public key from a private key (base64 or base64url). */
export function x25519Public(privateKey: string): { std: string; url: string } | null {
  try {
    const raw = Buffer.from(privateKey.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (raw.length !== 32) return null;
    const key = crypto.createPrivateKey({ key: { kty: "OKP", crv: "X25519", d: raw.toString("base64url"), x: "" }, format: "jwk" } as never);
    const pub = crypto.createPublicKey(key).export({ format: "jwk" }) as { x: string };
    const p = Buffer.from(pub.x, "base64url");
    return { std: p.toString("base64"), url: p.toString("base64url") };
  } catch {
    return null;
  }
}

/** OpenVPN static key (used for point-to-point tunnels). */
export function openVpnStaticKey(): string {
  const hex = crypto.randomBytes(256).toString("hex");
  const lines: string[] = [];
  for (let i = 0; i < 16; i++) lines.push(hex.slice(i * 32, i * 32 + 32));
  return `#\n# 2048 bit OpenVPN static key\n#\n-----BEGIN OpenVPN Static key V1-----\n${lines.join("\n")}\n-----END OpenVPN Static key V1-----\n`;
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Random AmneziaWG obfuscation parameters (both peers must use identical S1/S2/H1-H4). */
export function awgParams(seed?: string) {
  const buf = seed ? crypto.createHash("sha512").update(`awg:${seed}`).digest() : crypto.randomBytes(64);
  const u32 = (i: number) => buf.readUInt32BE(i);
  const s1 = 15 + (buf[0] % 100), s2 = 15 + (buf[1] % 100);
  const hs = new Set<number>();
  for (let i = 4; hs.size < 4 && i < 60; i += 4) hs.add(5 + (u32(i) % 2147483000));
  const [h1, h2, h3, h4] = [...hs];
  return { jc: 3 + (buf[2] % 6), jmin: 40, jmax: 70 + (buf[3] % 50), s1: s1 + 56 === s2 ? s1 + 1 : s1, s2, h1, h2, h3, h4 };
}

/** Per-tunnel PKI for OpenVPN point-to-point TLS (dedicated CA, works with OpenVPN 2.4 … 2.7) + tls-crypt key. */
export function openvpnTunnelPki(id: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vvsm-pki-"));
  const o = (args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  try {
    o(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "ca.key"]);
    o(["req", "-new", "-x509", "-key", "ca.key", "-sha256", "-days", "3650", "-subj", `/CN=vvsm-tunnel-${id}-ca`, "-out", "ca.crt"]);
    fs.writeFileSync(path.join(dir, "ext.cnf"), "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyAgreement\nextendedKeyUsage=serverAuth,clientAuth\n");
    const out: Record<string, string> = { ca: fs.readFileSync(path.join(dir, "ca.crt"), "utf8") };
    for (const side of ["entry", "exit"]) {
      o(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${side}.key`]);
      o(["req", "-new", "-key", `${side}.key`, "-subj", `/CN=vvsm-${id ? `t${id}-` : ""}${side}-${crypto.randomBytes(3).toString("hex")}`, "-out", `${side}.csr`]);
      o(["x509", "-req", "-in", `${side}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${side}.crt`, "-days", "3650", "-sha256", "-extfile", "ext.cnf"]);
      out[`${side}Cert`] = fs.readFileSync(path.join(dir, `${side}.crt`), "utf8");
      out[`${side}Key`] = fs.readFileSync(path.join(dir, `${side}.key`), "utf8");
    }
    out.tlsCrypt = openVpnStaticKey();
    return JSON.stringify(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export const isOvpnPki = (secret: string) => { try { const j = JSON.parse(secret); return !!(j.ca && j.entryCert && j.exitCert && j.tlsCrypt); } catch { return false; } };
