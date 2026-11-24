# VVSM — VPN SaaS panel (vvsm.online)

Next.js 16 · PostgreSQL (Drizzle) · real protocol cores: **Xray-core** (VLESS, VMess, Trojan, REALITY, XHTTP), **Hysteria 2**, **WireGuard**, **OpenVPN**, **Psiphon tunnel-core**.

## نصب با یک دستور از گیت‌هاب (Debian / Ubuntu)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hozuedz-dot/vvsm-vpn/main/install.sh) --domain vvsm.online --email you@example.com
```

به‌روزرسانی: `vvsm update` (آخرین نسخه را از گیت‌هاب می‌گیرد).

> ⚠️ پروژه را با `git push` روی گیت‌هاب بگذارید؛ آپلود از طریق وب گیت‌هاب حداکثر ۱۰۰ فایل را می‌پذیرد و پوشهٔ `src/lib` جا می‌ماند.

### سازگاری با Xray 26
- تونل‌های معکوس با «VLESS Reverse Proxy» جدید ساخته می‌شوند (reverse قدیمی bridge/portal در Xray 26 حذف شده است).
- به‌جای `allowInsecure` (حذف‌شده) از پین گواهی `pinnedPeerCertSha256` / پارامتر `pcs=` استفاده می‌شود؛ ایجنت نود هش گواهی خود را گزارش می‌دهد.
- VLESS/Trojan بدون TLS/REALITY مجاز نیست (Xray 26 رد می‌کند)؛ تونل‌های قدیمی خودکار به REALITY ارتقا می‌یابند.
- برای هر تونل، پورت آزاد روی سرور شنونده خودکار انتخاب می‌شود.

## نصب دستی (آپلود فایل‌ها)

```bash
# 1) فایل‌های پروژه را روی سرور آپلود کنید (scp / rsync / sftp)
scp -r ./vvsm root@SERVER_IP:/root/vvsm

# 2) رکورد A دامنه (vvsm.online) را به IP سرور اشاره دهید، سپس:
ssh root@SERVER_IP
cd /root/vvsm
sudo bash install.sh --domain vvsm.online --email you@example.com
```

Options: `--admin-user`, `--admin-pass`, `--port 3000`, `--demo` (demo data), `--no-ssl`, `--skip-cores`.

The installer: Node.js 22, PostgreSQL, Nginx + Let's Encrypt, panel build, systemd services, Xray-core (+ Chocolate4U GeoIP/GeoSite incl. `geosite:ir`, `category-ads-all`, `malware`, `phishing`, `cryptominers`, `sanctioned`), Hysteria 2, WireGuard, OpenVPN (own ECDSA PKI, auth against the panel DB), Psiphon binary, BBR + IP forwarding + NAT, `vvsm` CLI.
At the end it prints the admin URL and the generated admin password.

`vvsm status | logs | update | update-geo | update-cores | reset-admin NEWPASS | backup | uninstall`

## What the panel does

| Area | Details |
| --- | --- |
| Dashboard | KPI cards with trends, line/bar/donut charts with tooltips + smooth transitions, sortable/filterable tables, range + protocol + customer-type filters, 5 s live refresh, dark mode, 4 languages (fa/en/ru/de, RTL aware) |
| Monitoring | Real CPU / RAM / disk / network (read from `/proc`), core service status via systemd |
| SaaS | Plans, subscriptions, users (quota, monthly cap, speed limit, device limit), orders, revenue, MRR, renewal rate, CSV export |
| Crypto payments | **NOWPayments** (200+ coins, signed IPN webhook + polling) or **own USDT-TRC20 wallet** (unique-amount matching verified on TronGrid). Paid → account auto-created (new) or extended (renewal). Test mode for dry runs |
| Protocols | Inbounds for VLESS/VMess/Trojan (tcp, ws, grpc, httpupgrade, xhttp; TLS/REALITY), Hysteria2 (Salamander, port hopping), WireGuard, OpenVPN, Psiphon chain |
| Nodes & tunnels | Remote nodes via one-line installer + agent; **direct** and **reverse** (Xray bridge/portal) tunnels, inbound chaining, topology view |
| Routing | Presets: ads, trackers, adult, malware, phishing, miners, QUIC, BitTorrent, direct internal, direct Iran/China/Russia, sanctions bypass, GeoIP/GeoSite custom rules, random balancer |
| Security | TLS min/max, ECH, 0-RTT / early data, cert validation + pinning, SNI spoofing, domains/ports, admin 2FA (TOTP), lockout, IP allow-list, backups, maintenance mode, updates, factory reset, hidden Nginx routes, fragment/noise/mux obfuscation |
| Tools | Clean-IP scanner (real TCP+TLS probes, Cloudflare colo detection) → injected into subscriptions |
| DNS | DoH, anti-censorship DNS (Shecan, 403, Electro, Radar), local DNS + hosts, Fake DNS |
| Notifications | Telegram: orders, renewals, expiry, limits, node offline, high CPU, backups, admin login |
| Subscription page | `/s/<token>` with 6 templates, QR codes, one-tap import for Hiddify / v2rayNG / Streisand / sing-box / Clash / Shadowrocket; feeds: base64, Clash YAML, sing-box JSON, Xray JSON, WireGuard `.conf`, OpenVPN `.ovpn` |
| Public website | Landing, pricing, buy flow, invoice page, blog (publishable from admin), apps page |
| Client apps | Installable PWA (`/portal`), Electron desktop wrapper (`apps/desktop`), Capacitor mobile wrapper (`apps/mobile`) |

## Login system & preview mode

The login system is always present (scrypt passwords, TOTP 2FA, lockout, IP allow-list, signed session cookies).
The hosted preview runner sets `E2B_SANDBOX=true`, which opens `/admin` and `/portal` without signing in even when it restores `.env` to database credentials only. An explicit `PREVIEW_NO_LOGIN=false` disables this bypass. `install.sh` and `update.sh` now write `PREVIEW_NO_LOGIN=false` on the installed server, so production requires login.

**Security:** Do not commit `data/generated/`: the public source previously included generated Xray and WireGuard files containing private-key-shaped values. They are removed from this copy and `.gitignore` excludes future generated files. If those keys were used on a real server, treat them as exposed and rotate them; removing files from a commit does not erase old Git history.

## Core troubleshooting and management

Core install/update/start/stop/restart, Xray JSON validation, GeoIP/GeoSite update and short systemd diagnostics are now available from **Admin → Protocols → Cores** on the installed Linux host. WireGuard has its own client/server settings tab; Psiphon has a guided upstream-chain tab. Core mutations are disabled in the hosted preview. See [CORE-SETUP.fa.md](CORE-SETUP.fa.md) for the Persian server checklist and the prerequisites for real Psiphon access.

## Honest notes

* **Psiphon** has no public "server" product. The panel runs `psiphon-tunnel-core` as an upstream SOCKS outbound; inbounds with protocol *Psiphon* egress through it. You must supply your own Propagation Channel ID / Sponsor ID (Admin → Protocols → Psiphon).
* **Per-user speed limits** are enforced for WireGuard (tc/htb download shaping). Xray/OpenVPN/Hysteria2 enforce quota, expiry and device-independent limits; Hysteria2 has per-inbound bandwidth.
* After editing anything the panel regenerates configs, **validates Xray with `xray run -test`** before replacing the live file, and restarts the affected cores (Admin → *Apply*).
* Demo data (flagged) can be removed in Admin → Settings → System. Production installs have it off by default.
* Payments: set your keys, then **disable Test mode**. For NOWPayments add the IPN URL shown in Settings → System.

## Development

```bash
npm install
npx drizzle-kit push
npm run dev            # http://localhost:3000   admin / Vvsm@Admin2025 (change it!)
```
Without the cores installed the panel still runs; generated configs are written to `data/generated/`.

i18n: `src/i18n/dict-a.ts`, `dict-b.ts` (`[en, fa, ru, de]`). `node scripts/i18n-check.mjs` verifies every key used by the UI is translated.
