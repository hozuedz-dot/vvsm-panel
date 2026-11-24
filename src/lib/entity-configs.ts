/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ColDef, FilterDef } from "@/components/DataTable";
import { PROTOCOLS } from "@/lib/format";
import { createElement } from "react";
import Msg from "@/components/Msg";
import { HTTP_TRANSPORTS, REVERSE_CARRIERS, TUNNEL_CARRIERS, flowsFor, isXrayCarrier, isXrayProtocol, securitiesFor, transportsFor, tunnelSecuritiesFor, tunnelTransportsFor } from "@/lib/compat";

type Opt = string | { value: string | number; label: string };
export type FieldDef = {
  key: string; label?: string;
  type?: "text" | "number" | "bool" | "select" | "multiselect" | "textarea" | "json" | "password" | "gb" | "date";
  options?: Opt[]; optionsByForm?: (f: any) => Opt[]; showIf?: (f: any) => boolean;
  required?: boolean; hint?: string; full?: boolean; rows?: number; step?: string;
};
export type ActionDef = {
  key: string; label: string; action: string; payload?: Record<string, any>; idKey?: string;
  client?: "copy-sub" | "open-sub"; prompt?: { key: string; label: string; default?: string };
  confirm?: string; danger?: boolean; showIf?: (row: any) => boolean;
};
export type EntityConfig = {
  entity: string; title: string; columns: ColDef[]; fields: FieldDef[];
  refs?: Record<string, { entity: string; label: string; none?: string }>;
  defaults?: Record<string, any>; search?: string[]; filters?: FilterDef[]; actions?: ActionDef[];
  noCreate?: boolean; noEdit?: boolean; noDelete?: boolean; deleteLabel?: string; exportable?: boolean; pageSize?: number; poll?: number;
};

const tlsLike = (f: any) => f.security === "tls" || f.security === "reality";
const httpT = (f: any) => ["ws", "httpupgrade", "xhttp"].includes(f.transport);
const nodeRef = { entity: "nodes", label: "name", none: "o.mainServer" };

export const CONFIGS: Record<string, EntityConfig> = {
  users: {
    entity: "users", title: "nav.users", exportable: true, poll: 30000,
    search: ["username", "email", "note"],
    filters: [{ key: "status", label: "c.status", options: ["active", "disabled", "limited", "expired"] }],
    refs: { planId: { entity: "plans", label: "name", none: "o.none" } },
    columns: [{ key: "username" }, { key: "status", type: "badge" }, { key: "planId", label: "c.plan" }, { key: "usedBytes", type: "bytes" }, { key: "dataLimitBytes", type: "bytes" }, { key: "expiresAt", type: "date" }, { key: "lastOnlineAt", type: "datetime" }, { key: "source" }],
    fields: [
      { key: "username", required: true }, { key: "email" }, { key: "password", type: "password", hint: "hint.passwordAuto" },
      { key: "planId", type: "select" }, { key: "status", type: "select", options: ["active", "disabled", "limited", "expired"] }, { key: "expiresAt", type: "date" },
      { key: "dataLimitBytes", type: "gb", hint: "hint.zeroUnlimited" }, { key: "monthlyLimitBytes", type: "gb", hint: "hint.zeroUnlimited" },
      { key: "speedLimitMbps", type: "number", hint: "hint.zeroUnlimited" }, { key: "deviceLimit", type: "number" }, { key: "telegramId" }, { key: "note", type: "textarea" },
    ],
    defaults: { status: "active" },
    actions: [
      { key: "copy", label: "users.copySub", action: "", client: "copy-sub" },
      { key: "open", label: "users.openSub", action: "", client: "open-sub" },
      { key: "extend", label: "users.extend", action: "extend-user", prompt: { key: "days", label: "c.days", default: "30" } },
      { key: "reset", label: "users.resetTraffic", action: "reset-traffic", confirm: "confirm.resetTraffic" },
      { key: "toggle", label: "users.toggle", action: "toggle-user" },
      { key: "token", label: "users.regenToken", action: "regen-token", confirm: "confirm.regenToken", danger: true },
    ],
  },
  sessions: {
    entity: "sessions", title: "users.sessions", noCreate: true, noEdit: true, poll: 15000,
    refs: { nodeId: nodeRef }, search: ["username", "clientIp"],
    filters: [{ key: "protocol", label: "c.protocol", options: [...PROTOCOLS] }],
    columns: [{ key: "username" }, { key: "protocol", type: "protocol" }, { key: "nodeId", label: "c.node" }, { key: "clientIp", type: "mono" }, { key: "country", type: "country" }, { key: "device" }, { key: "upBytes", type: "bytes" }, { key: "downBytes", type: "bytes" }, { key: "startedAt", type: "datetime" }],
    fields: [],
  },
  plans: {
    entity: "plans", title: "nav.plans",
    columns: [{ key: "name" }, { key: "priceUsd", type: "money" }, { key: "durationDays", type: "number" }, { key: "dataLimitGb", type: "number" }, { key: "deviceLimit", type: "number" }, { key: "active", type: "bool" }, { key: "featured", type: "bool" }],
    fields: [
      { key: "name", required: true }, { key: "priceUsd", type: "number", step: "0.01" }, { key: "description", type: "textarea" },
      { key: "durationDays", type: "number" }, { key: "dataLimitGb", type: "number", hint: "hint.zeroUnlimited" }, { key: "speedLimitMbps", type: "number", hint: "hint.zeroUnlimited" },
      { key: "deviceLimit", type: "number" }, { key: "sortOrder", type: "number" }, { key: "protocols", type: "multiselect", options: [...PROTOCOLS], hint: "hint.protocolsAll" },
      { key: "active", type: "bool" }, { key: "featured", type: "bool" },
    ],
    defaults: { priceUsd: 5, durationDays: 30, dataLimitGb: 50, deviceLimit: 2, active: true, protocols: [] },
  },
  subscriptions: {
    entity: "subscriptions", title: "subs.active",
    refs: { userId: { entity: "users", label: "username" }, planId: { entity: "plans", label: "name", none: "o.none" } },
    filters: [{ key: "status", label: "c.status", options: ["active", "expired", "cancelled"] }],
    columns: [{ key: "userId", label: "c.user" }, { key: "planId", label: "c.plan" }, { key: "startsAt", type: "date" }, { key: "endsAt", type: "date" }, { key: "status", type: "badge" }, { key: "priceUsd", type: "money" }],
    fields: [{ key: "userId", label: "c.user", type: "select", required: true }, { key: "planId", type: "select" }, { key: "startsAt", type: "date" }, { key: "endsAt", type: "date", required: true }, { key: "status", type: "select", options: ["active", "expired", "cancelled"] }, { key: "priceUsd", type: "number" }],
    defaults: { status: "active" },
  },
  orders: {
    entity: "orders", title: "nav.payments", noCreate: true, exportable: true, poll: 20000,
    refs: { planId: { entity: "plans", label: "name", none: "o.none" } }, search: ["id", "username", "email", "txHash"],
    filters: [{ key: "status", label: "c.status", options: ["pending", "confirming", "paid", "underpaid", "expired", "failed", "cancelled"] }, { key: "kind", label: "c.kind", options: ["new", "renew"] }],
    columns: [{ key: "id", type: "mono", render: (r: any) => String(r.id).slice(0, 8) }, { key: "username" }, { key: "kind" }, { key: "planId", label: "c.plan" }, { key: "amountUsd", type: "money" }, { key: "payCurrency" }, { key: "provider" }, { key: "status", type: "badge" }, { key: "createdAt", type: "datetime" }],
    fields: [{ key: "status", type: "select", options: ["pending", "confirming", "paid", "underpaid", "expired", "failed", "cancelled"] }, { key: "txHash" }],
    actions: [{ key: "confirm", label: "pay.confirmManual", action: "confirm-order", confirm: "confirm.order", showIf: (r) => r.status !== "paid" }],
  },
  nodes: {
    entity: "nodes", title: "nodes.nodes", poll: 10000, search: ["name", "ip", "domain"],
    filters: [{ key: "status", label: "c.status", options: ["online", "offline", "pending", "maintenance"] }, { key: "role", label: "c.role", options: ["entry", "relay", "exit"] }],
    columns: [
      { key: "name", render: (r: any) => `${r.isLocal ? "★ " : ""}${r.name}` }, { key: "countryCode", type: "country" }, { key: "role" }, { key: "ip", type: "mono" },
      { key: "status", type: "badge" }, { key: "xrayActive", type: "bool" }, { key: "agentVersion", label: "c.agent", render: (r: any) => (r.isLocal ? "panel" : r.agentVersion ? `v${r.agentVersion}` : "—") },
      { key: "agentError", label: "c.agentError", render: (r: any) => (r.agentError ? `⚠ ${String(r.agentError).slice(0, 90)}` : r.isLocal || r.lastSeenAt ? "✓" : "—") },
      { key: "cpu", type: "percent" }, { key: "lastSeenAt", type: "datetime" },
    ],
    fields: [
      { key: "name", required: true }, { key: "role", type: "select", options: ["entry", "relay", "exit"] }, { key: "countryCode", hint: "hint.countryCode" },
      { key: "ip", required: true }, { key: "domain", hint: "hint.domain" }, { key: "city" }, { key: "country" }, { key: "capacityMbps", type: "number" },
      { key: "lat", type: "number", step: "0.01" }, { key: "lng", type: "number", step: "0.01" }, { key: "tags" }, { key: "enabled", type: "bool" },
    ],
    defaults: { role: "exit", countryCode: "DE", enabled: true, capacityMbps: 1000 },
    actions: [{ key: "script", label: "nodes.installScript", action: "node-script", showIf: (r) => !r.isLocal }],
  },
  tunnels: {
    entity: "tunnels", title: "nav.tunnels", poll: 15000, search: ["name"],
    refs: { entryNodeId: nodeRef, exitNodeId: nodeRef },
    filters: [{ key: "mode", label: "c.mode", options: ["direct", "reverse"] }, { key: "status", label: "c.status", options: ["active", "degraded", "offline", "pending", "disabled", "error"] }],
    columns: [
      { key: "name" }, { key: "mode" }, { key: "carrier", type: "protocol" }, { key: "transport", render: (r: any) => `${r.transport}/${r.security}` },
      { key: "entryNodeId", label: "c.entry" }, { key: "entryOk", label: "c.entryOk", type: "bool" }, { key: "exitNodeId", label: "c.exit" }, { key: "exitOk", label: "c.exitOk", type: "bool" },
      { key: "listenPort", type: "number" }, { key: "status", type: "badge" }, { key: "statusDetail", label: "c.statusDetail", render: (r: any) => createElement(Msg, { text: String(r.statusDetail || ""), max: 160 }) },
    ],
    fields: [
      { key: "name", required: true },
      { key: "mode", type: "select", options: ["direct", "reverse"], hint: "hint.tunnelMode" },
      { key: "carrier", type: "select", optionsByForm: (f) => (f.mode === "reverse" ? REVERSE_CARRIERS : TUNNEL_CARRIERS), hint: "hint.tunnelCarrier" },
      { key: "entryNodeId", label: "c.entry", type: "select", hint: "hint.entryNode" },
      { key: "exitNodeId", label: "c.exit", type: "select", hint: "hint.exitNode", showIf: (f) => f.carrier !== "psiphon" },
      { key: "listenPort", type: "number", required: true, hint: "hint.tunnelPort", showIf: (f) => f.carrier !== "psiphon" },
      { key: "transport", type: "select", optionsByForm: (f) => tunnelTransportsFor(f.carrier) },
      { key: "security", type: "select", optionsByForm: (f) => tunnelSecuritiesFor(f.carrier, f.transport) },
      { key: "sni", showIf: (f) => isXrayCarrier(f.carrier) && f.security !== "none" || f.carrier === "hysteria2" },
      { key: "realityDest", showIf: (f) => isXrayCarrier(f.carrier) && f.security === "reality" },
      { key: "fingerprint", type: "select", options: ["chrome", "firefox", "safari", "ios", "android", "edge", "random"], showIf: (f) => isXrayCarrier(f.carrier) && f.security !== "none" },
      { key: "host", showIf: (f) => isXrayCarrier(f.carrier) && httpT(f) }, { key: "path", showIf: (f) => isXrayCarrier(f.carrier) && httpT(f) },
      { key: "serviceName", showIf: (f) => isXrayCarrier(f.carrier) && f.transport === "grpc" },
      { key: "mux", type: "bool", showIf: (f) => isXrayCarrier(f.carrier) && f.mode === "direct" },
      { key: "keepAliveSec", type: "number", showIf: (f) => f.carrier === "wireguard" },
      { key: "enabled", type: "bool" },
    ],
    defaults: { mode: "direct", carrier: "vless", transport: "tcp", security: "reality", listenPort: 4443, sni: "www.microsoft.com", realityDest: "www.microsoft.com:443", fingerprint: "chrome", path: "/", keepAliveSec: 25, enabled: true, entryNodeId: "", exitNodeId: "" },
    actions: [
      { key: "ie", label: "tunnels.installEntry", action: "tunnel-install", payload: { side: "entry" } },
      { key: "ix", label: "tunnels.installExit", action: "tunnel-install", payload: { side: "exit" }, showIf: (r) => r.carrier !== "psiphon" },
      { key: "cfg", label: "common.viewConfig", action: "tunnel-config" },
    ],
  },
  inbounds: {
    entity: "inbounds", title: "proto.inbounds", search: ["name", "remark"],
    refs: { nodeId: nodeRef, tunnelId: { entity: "tunnels", label: "name", none: "o.none" } },
    filters: [{ key: "protocol", label: "c.protocol", options: [...PROTOCOLS] }],
    columns: [{ key: "name" }, { key: "protocol", type: "protocol" }, { key: "transport" }, { key: "security" }, { key: "port", type: "number" }, { key: "nodeId", label: "c.node" }, { key: "tunnelId", label: "c.tunnel" }, { key: "hidden", type: "bool" }, { key: "enabled", type: "bool" }],
    fields: [
      { key: "name", required: true }, { key: "remark" },
      { key: "protocol", type: "select", options: [...PROTOCOLS] },
      { key: "tunnelId", label: "c.tunnel", type: "select", hint: "hint.inboundTunnel", showIf: (f) => isXrayProtocol(f.protocol) && f.protocol !== "psiphon" },
      { key: "nodeId", label: "c.node", type: "select", showIf: (f) => !f.tunnelId },
      { key: "port", type: "number", required: true },
      { key: "transport", type: "select", optionsByForm: (f) => transportsFor(f.protocol) },
      { key: "hidden", type: "bool", hint: "hint.hidden", showIf: (f) => isXrayProtocol(f.protocol) && HTTP_TRANSPORTS.includes(f.transport) },
      { key: "listen", showIf: (f) => !f.hidden },
      { key: "security", type: "select", optionsByForm: (f) => securitiesFor(f.protocol, f.transport, !!f.hidden) },
      { key: "flow", type: "select", optionsByForm: (f) => flowsFor(f.protocol, f.transport, f.security), showIf: (f) => flowsFor(f.protocol, f.transport, f.security).length > 1 },
      { key: "sni", showIf: (f) => tlsLike(f) && !f.hidden || f.protocol === "hysteria2" },
      { key: "realityDest", showIf: (f) => f.security === "reality" },
      { key: "privateKey", hint: "hint.inboundPrivateKey", showIf: (f) => f.security === "reality" || f.protocol === "wireguard" },
      { key: "publicKey", hint: "hint.inboundPublicKey", showIf: (f) => f.security === "reality" || f.protocol === "wireguard" },
      { key: "shortId", hint: "hint.inboundShortId", showIf: (f) => f.security === "reality" },
      { key: "host", showIf: (f) => isXrayProtocol(f.protocol) && httpT(f) }, { key: "path", showIf: (f) => isXrayProtocol(f.protocol) && httpT(f) },
      { key: "serviceName", showIf: (f) => f.transport === "grpc" },
      { key: "fingerprint", type: "select", options: ["chrome", "firefox", "safari", "ios", "android", "edge", "random", "randomized"], showIf: (f) => isXrayProtocol(f.protocol) && tlsLike(f) },
      { key: "alpn", showIf: (f) => isXrayProtocol(f.protocol) && f.security === "tls" },
      { key: "certPath", showIf: (f) => f.security === "tls" && !f.hidden && f.protocol !== "openvpn" }, { key: "keyPath", showIf: (f) => f.security === "tls" && !f.hidden && f.protocol !== "openvpn" },
      { key: "sniSpoof", hint: "hint.sniSpoof", showIf: (f) => isXrayProtocol(f.protocol) && f.security === "tls" },
      { key: "useCleanIp", type: "bool", hint: "hint.useCleanIp", showIf: (f) => isXrayProtocol(f.protocol) && HTTP_TRANSPORTS.includes(f.transport) && (f.security === "tls" || f.hidden || (f.protocol === "vmess" && f.security === "none")) },
      { key: "obfs", hint: "hint.hyObfs", showIf: (f) => f.protocol === "hysteria2" },
      { key: "upMbps", type: "number", showIf: (f) => f.protocol === "hysteria2" }, { key: "downMbps", type: "number", showIf: (f) => f.protocol === "hysteria2" },
      { key: "advancedOptions", type: "json", hint: "hint.advancedOptions", showIf: (f) => isXrayProtocol(f.protocol) },
      { key: "enabled", type: "bool" },
    ],
    defaults: { protocol: "vless", transport: "tcp", security: "reality", port: 8443, flow: "xtls-rprx-vision", sni: "www.microsoft.com", realityDest: "www.microsoft.com:443", fingerprint: "chrome", alpn: "h2,http/1.1", listen: "0.0.0.0", path: "/", enabled: true, advancedOptions: "{}", nodeId: "", tunnelId: "" },
    actions: [
      { key: "keys", label: "proto.regenKeys", action: "regen-keys", confirm: "confirm.regenKeys", showIf: (r) => r.security === "reality" || r.protocol === "wireguard" },
      { key: "path", label: "proto.regenPath", action: "regen-path", showIf: (r) => HTTP_TRANSPORTS.includes(r.transport) },
    ],
  },
  routing_rules: {
    entity: "routing_rules", title: "routing.custom", search: ["name", "match"],
    columns: [{ key: "priority", type: "number" }, { key: "name" }, { key: "ruleType" }, { key: "match", render: (r: any) => String(r.match).split("\n").slice(0, 2).join(", ") }, { key: "outbound", type: "badge" }, { key: "enabled", type: "bool" }],
    fields: [
      { key: "name", required: true }, { key: "ruleType", type: "select", options: ["domain", "geosite", "ip", "geoip", "port", "protocol", "inbound"], hint: "hint.ruleType" },
      { key: "match", type: "textarea", hint: "hint.ruleMatch", required: true }, { key: "outbound", type: "select", options: ["direct", "block", "proxy", "psiphon", "random"] },
      { key: "priority", type: "number" }, { key: "enabled", type: "bool" },
    ],
    defaults: { ruleType: "domain", outbound: "direct", priority: 100, enabled: true },
  },
  clean_ips: {
    entity: "clean_ips", title: "tools.cleanList", search: ["ip", "note"],
    filters: [{ key: "status", label: "c.status", options: ["clean", "blocked"] }],
    columns: [{ key: "ip", type: "mono" }, { key: "port", type: "number" }, { key: "latencyMs", type: "number" }, { key: "lossPct", type: "percent" }, { key: "provider" }, { key: "status", type: "badge" }, { key: "note" }, { key: "checkedAt", type: "datetime" }],
    fields: [{ key: "ip", required: true }, { key: "port", type: "number" }, { key: "provider" }, { key: "status", type: "select", options: ["clean", "blocked"] }, { key: "assigned", hint: "hint.assigned" }, { key: "note" }],
    defaults: { port: 443, provider: "cloudflare", status: "clean" },
    actions: [{ key: "recheck", label: "tools.recheck", action: "recheck-clean-ip" }],
  },
  posts: {
    entity: "posts", title: "nav.content", search: ["title", "slug"],
    filters: [{ key: "lang", label: "c.lang", options: ["en", "fa", "ru", "de"] }],
    columns: [{ key: "title" }, { key: "slug", type: "mono" }, { key: "lang" }, { key: "published", type: "bool" }, { key: "createdAt", type: "date" }],
    fields: [{ key: "title", required: true }, { key: "slug" }, { key: "lang", type: "select", options: ["en", "fa", "ru", "de"] }, { key: "published", type: "bool" }, { key: "excerpt", type: "textarea" }, { key: "body", type: "textarea", rows: 14, hint: "hint.markdown" }],
    defaults: { lang: "fa", published: true },
  },
  logs: {
    entity: "logs", title: "notif.logs", noCreate: true, noEdit: true, poll: 10000, pageSize: 20, search: ["message", "category"],
    filters: [{ key: "level", label: "c.level", options: ["info", "warn", "error"] }],
    columns: [{ key: "ts", type: "datetime" }, { key: "level", type: "badge" }, { key: "category" }, { key: "message" }],
    fields: [],
  },
};
