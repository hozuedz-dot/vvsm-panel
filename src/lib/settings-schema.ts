/* eslint-disable @typescript-eslint/no-explicit-any */
// Client-safe description of every settings form. Keys map 1:1 onto lib/settings.ts DEFAULTS.

export type SField = {
  key: string;
  type?: "text" | "number" | "bool" | "select" | "multiselect" | "textarea" | "secret";
  label?: string;
  hint?: string;
  options?: string[];
  rows?: number;
  full?: boolean;
  showIf?: (v: any) => boolean;
};
export type SSection = { title: string; description?: string; fields: SField[] };
export type SPanel = { group: string; sections: SSection[] };

const CURRENCIES = ["usdttrc20", "usdtbsc", "usdterc20", "usdcbsc", "btc", "eth", "ltc", "trx", "ton", "bnbbsc", "doge", "xmr", "sol"];

export const PANELS: Record<string, SPanel> = {
  general: {
    group: "general",
    sections: [{ title: "ss.general", fields: [
      { key: "siteName" }, { key: "domain", hint: "hint.domain" }, { key: "defaultLanguage", type: "select", options: ["fa", "en", "ru", "de"] },
      { key: "supportUrl" }, { key: "supportEmail" }, { key: "publicSite", type: "bool" }, { key: "demoMode", type: "bool", hint: "hint.demoMode" },
    ] }],
  },
  tls: {
    group: "security",
    sections: [
      { title: "ss.tls", fields: [
        { key: "tls.certMode", type: "select", options: ["letsencrypt", "selfsigned", "custom"] },
        { key: "tls.certPath", showIf: (v) => v.tls?.certMode === "custom" }, { key: "tls.keyPath", showIf: (v) => v.tls?.certMode === "custom" },
        { key: "tls.minVersion", type: "select", options: ["1.0", "1.1", "1.2", "1.3"] }, { key: "tls.maxVersion", type: "select", options: ["1.2", "1.3"] },
        { key: "tls.alpn" }, { key: "tls.fingerprint", type: "select", options: ["chrome", "firefox", "safari", "ios", "android", "edge", "random", "randomized"] },
      ] },
      { title: "ss.certValidation", fields: [{ key: "tls.allowInsecure", type: "bool", hint: "hint.allowInsecure" }, { key: "tls.pinSha256", hint: "hint.pin", full: true }] },
      { title: "ss.ech", description: "ss.echDesc", fields: [{ key: "ech.enabled", type: "bool" }, { key: "ech.configList", type: "textarea", showIf: (v) => v.ech?.enabled }, { key: "ech.serverKeys", type: "secret", showIf: (v) => v.ech?.enabled }] },
      { title: "ss.zeroRtt", description: "ss.zeroRttDesc", fields: [{ key: "zeroRtt.wsEarlyData", type: "bool" }, { key: "zeroRtt.quicEarlyData", type: "bool" }, { key: "zeroRtt.tcpFastOpen", type: "bool" }] },
      { title: "ss.sniSpoof", description: "ss.sniSpoofDesc", fields: [{ key: "sniSpoof.enabled", type: "bool" }, { key: "sniSpoof.fakeSni", hint: "hint.sniSpoof", showIf: (v) => v.sniSpoof?.enabled }, { key: "sniSpoof.fakeHost", showIf: (v) => v.sniSpoof?.enabled }] },
    ],
  },
  access: {
    group: "security",
    sections: [
      { title: "ss.passwordProtection", fields: [
        { key: "access.sessionHours", type: "number" }, { key: "access.maxAttempts", type: "number" }, { key: "access.lockMinutes", type: "number" },
        { key: "access.minPasswordLength", type: "number" }, { key: "access.requireComplex", type: "bool" }, { key: "access.twoFactorRequired", type: "bool" },
        { key: "access.ipAllowlist", type: "textarea", hint: "hint.ipAllowlist" },
      ] },
      { title: "ss.domainsPorts", fields: [
        { key: "domainsPorts.panelDomain" }, { key: "domainsPorts.subDomain", hint: "hint.subDomain" }, { key: "domainsPorts.acmeEmail", hint: "hint.acmeEmail" },
        { key: "domainsPorts.allowedPortRanges" }, { key: "domainsPorts.blockedPorts" },
      ] },
    ],
  },
  obfuscation: {
    group: "obfuscation",
    sections: [
      { title: "ss.fragment", description: "ss.fragmentDesc", fields: [
        { key: "fragment.enabled", type: "bool" }, { key: "fragment.packets", type: "select", options: ["tlshello", "1-3", "1-5"], showIf: (v) => v.fragment?.enabled },
        { key: "fragment.length", showIf: (v) => v.fragment?.enabled }, { key: "fragment.interval", showIf: (v) => v.fragment?.enabled },
      ] },
      { title: "ss.noise", fields: [{ key: "noise.enabled", type: "bool" }, { key: "noise.packet", showIf: (v) => v.noise?.enabled }, { key: "noise.delay", showIf: (v) => v.noise?.enabled }] },
      { title: "ss.transportObfs", fields: [
        { key: "mux.enabled", label: "c.mux", type: "bool" }, { key: "padding.enabled", label: "f.padding", type: "bool" },
        { key: "httpHeaderObfs.enabled", label: "f.httpHeaderObfs", type: "bool" }, { key: "httpHeaderObfs.fakeHost", showIf: (v) => v.httpHeaderObfs?.enabled },
        { key: "hysteriaObfsPassword", type: "secret", hint: "hint.hyObfs" },
        { key: "portHopping.enabled", label: "f.portHopping", type: "bool", hint: "hint.portHopping" }, { key: "portHopping.hopRange", showIf: (v) => v.portHopping?.enabled },
      ] },
    ],
  },
  routing: {
    group: "routing",
    sections: [
      { title: "ss.blocking", fields: ["blockAds", "blockTrackers", "blockAdult", "blockMalware", "blockPhishing", "blockMiners", "blockQuic", "blockBittorrent"].map((k) => ({ key: k, type: "bool" as const })) },
      { title: "ss.directAccess", fields: [
        { key: "directInternal", type: "bool", hint: "hint.directInternal" }, { key: "directIran", type: "bool" }, { key: "directChina", type: "bool" }, { key: "directRussia", type: "bool" },
        { key: "bypassSanctions", type: "bool", hint: "hint.sanctions" }, { key: "sanctionsOutbound", type: "select", options: ["direct", "psiphon", "proxy"], showIf: (v) => v.bypassSanctions },
      ] },
      { title: "ss.randomRouting", description: "ss.randomRoutingDesc", fields: [{ key: "random.enabled", label: "f.enabled", type: "bool" }, { key: "random.strategy", label: "f.strategy", type: "select", options: ["random", "roundRobin", "leastPing", "leastLoad"], showIf: (v) => v.random?.enabled }] },
      { title: "ss.routingAdvanced", fields: [
        { key: "domainStrategy", type: "select", options: ["AsIs", "IPIfNonMatch", "IPOnDemand"] }, { key: "defaultOutbound", type: "select", options: ["direct", "proxy", "psiphon", "block"] },
        { key: "geoSource", type: "select", options: ["chocolate4u", "loyalsoldier"] }, { key: "geoAutoUpdate", type: "bool" }, { key: "updateIntervalHours", type: "number" },
      ] },
    ],
  },
  hidden: {
    group: "hidden",
    sections: [{ title: "ss.hiddenRoutes", description: "ss.hiddenRoutesDesc", fields: [{ key: "enabled", type: "bool" }, { key: "decoyUrl", hint: "hint.decoy" }, { key: "hsts", type: "bool" }, { key: "reloadNginx", type: "bool" }] }],
  },
  dns: {
    group: "dns",
    sections: [
      { title: "ss.dnsGeneral", fields: [{ key: "queryStrategy", type: "select", options: ["UseIP", "UseIPv4", "UseIPv6"] }, { key: "disableCache", type: "bool" }] },
      { title: "ss.doh", description: "ss.dohDesc", fields: [{ key: "doh.enabled", label: "f.enabled", type: "bool" }, { key: "doh.servers", label: "f.servers", type: "textarea", showIf: (v) => v.doh?.enabled }] },
      { title: "ss.antiCensorDns", description: "ss.antiCensorDnsDesc", fields: [
        { key: "antiCensor.enabled", label: "f.enabled", type: "bool" }, { key: "antiCensor.provider", label: "f.provider", type: "select", options: ["shecan", "403", "electro", "radar", "custom"], showIf: (v) => v.antiCensor?.enabled },
        { key: "antiCensor.servers", label: "f.servers", showIf: (v) => v.antiCensor?.enabled && v.antiCensor?.provider === "custom" }, { key: "antiCensor.domains", label: "f.domains", type: "textarea", showIf: (v) => v.antiCensor?.enabled },
      ] },
      { title: "ss.localDns", fields: [{ key: "local.enabled", label: "f.enabled", type: "bool" }, { key: "local.hosts", label: "f.hosts", type: "textarea", hint: "hint.hosts", showIf: (v) => v.local?.enabled }] },
      { title: "ss.fakeDns", description: "ss.fakeDnsDesc", fields: [{ key: "fakeDns.enabled", label: "f.enabled", type: "bool" }, { key: "fakeDns.pool", showIf: (v) => v.fakeDns?.enabled }, { key: "fakeDns.poolSize", type: "number", showIf: (v) => v.fakeDns?.enabled }] },
    ],
  },
  psiphon: {
    group: "psiphon",
    sections: [{ title: "ss.psiphon", description: "ss.psiphonDesc", fields: [
      { key: "enabled", type: "bool", hint: "hint.psiphonEntry" }, { key: "propagationChannelId", hint: "hint.psiIds" }, { key: "sponsorId", type: "secret" },
      { key: "remoteServerListUrl", hint: "hint.psiList", full: true }, { key: "remoteServerListSignaturePublicKey", type: "textarea", hint: "hint.psiSignature" },
      { key: "targetServerEntry", type: "textarea" }, { key: "region", hint: "hint.region" }, { key: "localSocksPort", type: "number", hint: "hint.psiSocks" }, { key: "localHttpPort", type: "number" },
    ] }],
  },
  wireguard: {
    group: "wireguard",
    sections: [{ title: "ss.wireguard", description: "ss.wireguardDesc", fields: [
      { key: "interfaceAddress", hint: "hint.wgInterface" }, { key: "clientDns", hint: "hint.wgDns" }, { key: "allowedIps", hint: "hint.wgAllowed" },
      { key: "mtu", type: "number", hint: "hint.wgMtu" }, { key: "persistentKeepalive", type: "number", hint: "hint.wgKeepalive" }, { key: "endpointOverride", hint: "hint.wgEndpoint" },
    ] }, { title: "ss.awg", description: "ss.awgDesc", fields: [
      { key: "mode", label: "f.awgMode", type: "select", options: ["amnezia", "standard"], hint: "hint.awgMode" },
      ...["jc", "jmin", "jmax", "s1", "s2", "h1", "h2", "h3", "h4"].map((k) => ({ key: k, label: `f.awg_${k}`, type: "number" as const, showIf: (v: any) => v.mode === "amnezia" })),
    ] }],
  },
  cleanip: {
    group: "cleanip",
    sections: [{ title: "ss.cleanipUse", description: "ss.cleanipUseDesc", fields: [
      { key: "auto", type: "bool", hint: "hint.useCleanIp" }, { key: "maxIps", type: "number" }, { key: "keepOriginal", type: "bool" },
      { key: "sources", type: "multiselect", options: ["manual", "cloudflare", "fastly"], hint: "hint.cleanIpSources" }, { key: "ranges", type: "textarea", hint: "hint.cleanIpRanges" },
      { key: "ports" }, { key: "sni" }, { key: "maxLatencyMs", type: "number" }, { key: "maxLossPct", type: "number" },
    ] }],
  },
  cover: {
    group: "cover",
    sections: [
      { title: "ss.cover", description: "ss.coverDesc", fields: [
        { key: "enabled", label: "f.coverEnabled", type: "bool" },
        { key: "theme", label: "f.coverTheme", type: "select", options: ["network", "construction", "medical", "education", "accounting"] },
        { key: "lang", label: "f.coverLang", type: "select", options: ["fa", "en"] },
        { key: "hideShop", label: "f.coverHideShop", type: "bool", hint: "hint.coverHideShop" },
        { key: "shopPath", label: "f.coverShopPath", hint: "hint.coverShopPath" },
      ] },
      { title: "ss.coverBusiness", fields: [
        { key: "businessName", label: "f.coverName" }, { key: "tagline", label: "f.coverTagline" }, { key: "city", label: "f.coverCity" },
        { key: "phone", label: "f.coverPhone" }, { key: "email", label: "f.coverEmail" }, { key: "address", label: "f.coverAddress", full: true },
      ] },
    ],
  },
  backup: {
    group: "backup",
    sections: [{ title: "ss.backup", fields: [{ key: "auto", type: "bool" }, { key: "interval", type: "select", options: ["daily", "weekly"] }, { key: "keep", type: "number" }, { key: "dir" }, { key: "telegram", type: "bool" }] }],
  },
  maintenance: {
    group: "maintenance",
    sections: [
      { title: "ss.maintenance", description: "ss.maintenanceDesc", fields: [
        { key: "enabled", label: "f.maintenanceMode", type: "bool" }, { key: "title", label: "f.mTitle" }, { key: "endsAt", label: "f.mEndsAt", hint: "hint.mEndsAt" },
        { key: "message", type: "textarea", full: true },
      ] },
      { title: "ss.maintenanceAccess", fields: [
        { key: "keepSubscriptions", label: "f.mKeepSubs", type: "bool", hint: "hint.mKeepSubs" }, { key: "keepPortal", label: "f.mKeepPortal", type: "bool" },
        { key: "allowNew", label: "f.mAllowNew", type: "bool" }, { key: "showSupport", label: "f.mShowSupport", type: "bool" },
        { key: "allowIps", label: "f.mAllowIps", type: "textarea", hint: "hint.mAllowIps" },
      ] },
    ],
  },
  updates: {
    group: "updates",
    sections: [{ title: "ss.updates", fields: [{ key: "autoCheck", type: "bool" }, { key: "channel", type: "select", options: ["stable", "beta"] }, { key: "autoApply", type: "bool", hint: "hint.autoApply" }] }],
  },
  limits: {
    group: "limits",
    sections: [{ title: "ss.limits", description: "ss.limitsDesc", fields: [
      { key: "onLimit", type: "select", options: ["disable", "throttle"] }, { key: "throttleMbps", type: "number", showIf: (v) => v.onLimit === "throttle" },
      { key: "monthlyResetDay", type: "number" }, { key: "monthlyCapGb", type: "number", hint: "hint.zeroUnlimited" }, { key: "deviceDefault", type: "number" },
      { key: "speedDefaultMbps", type: "number", hint: "hint.zeroUnlimited" }, { key: "expiryDays", type: "number" }, { key: "resetTrafficOnRenew", type: "bool" },
    ] }],
  },
  subscription: {
    group: "subscription",
    sections: [{ title: "ss.subPage", description: "ss.subPageDesc", fields: [
      { key: "template", type: "select", options: ["aurora", "minimal", "neon", "glass", "terminal", "classic"] }, { key: "allowUserTemplate", type: "bool" }, { key: "profileTitle" },
      { key: "updateIntervalHours", type: "number" }, { key: "showUsage", type: "bool" }, { key: "showQr", type: "bool" }, { key: "showApps", type: "bool" }, { key: "allowTokenReset", type: "bool" },
      { key: "supportLink" }, { key: "announce", type: "textarea" }, { key: "footer", type: "textarea" },
    ] }],
  },
  notifications: {
    group: "notifications",
    sections: [
      { title: "ss.telegram", description: "ss.telegramDesc", fields: [{ key: "telegram.enabled", label: "f.enabled", type: "bool" }, { key: "telegram.botToken", type: "secret" }, { key: "telegram.chatId" }, { key: "telegram.proxy", label: "f.proxy" }] },
      { title: "ss.events", fields: [
        ...["newOrder", "renewal", "userExpiring", "userExpired", "limitReached", "nodeOffline", "highCpu", "backup", "adminLogin"].map((k) => ({ key: `events.${k}`, type: "bool" as const })),
        { key: "cpuThreshold", type: "number" }, { key: "diskThreshold", type: "number" },
      ] },
    ],
  },
  payments: {
    group: "payments",
    sections: [
      { title: "ss.paymentsGeneral", description: "ss.paymentsGeneralDesc", fields: [
        { key: "provider", type: "select", options: ["manual", "nowpayments"] }, { key: "testMode", type: "bool", hint: "hint.testMode" },
        { key: "allowNew", type: "bool" }, { key: "allowRenew", type: "bool" }, { key: "invoiceTtlMin", type: "number" }, { key: "underpaidTolerancePct", type: "number" },
        { key: "currencies", type: "multiselect", options: CURRENCIES, hint: "hint.currencies", showIf: (v) => v.provider === "nowpayments" },
      ] },
      { title: "ss.nowpayments", description: "ss.nowpaymentsDesc", fields: [{ key: "nowpayments.apiKey", type: "secret" }, { key: "nowpayments.ipnSecret", type: "secret", hint: "hint.ipnUrl" }, { key: "nowpayments.sandbox", type: "bool" }] },
      { title: "ss.manualWallet", description: "ss.manualWalletDesc", fields: [{ key: "manual.usdtTrc20Address", hint: "hint.walletDirect" }, { key: "manual.tronGridKey", type: "secret" }, { key: "manual.otherWallets", type: "textarea", hint: "hint.otherWallets" }] },
    ],
  },
};
