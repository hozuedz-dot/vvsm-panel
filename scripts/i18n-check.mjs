// Lists every i18n key used by the UI and reports keys missing from src/i18n/dict.ts
import fs from "fs";
import path from "path";
const root = path.resolve(import.meta.dirname, "..");
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f.name) && !p.endsWith("dict.ts")) files.push(p);
  }
})(path.join(root, "src"));
const used = new Set();
const NS = "nav|common|c|f|ss|hint|act|confirm|dash|kpi|chart|range|mon|users|subs|fin|nodes|proto|routing|dns|tools|sec|notif|set|land|buy|pay|portal|sub|blog|apps|account|login|content|plan|err|s|o";
const re = new RegExp("[\"'`]((?:" + NS + ")\\.[A-Za-z0-9_.-]+)[\"'`]", "g");
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) used.add(m[1]);
}
// optional (tr) namespaces are not required
const optional = /^(s|o|err|plan\.name)\./;
// dynamic keys
for (const k of ["protocols","crypto","instant","stealth","nodes","dns","cleanip","apps"]) { used.add(`land.f.${k}`); used.add(`land.f.${k}d`); }
for (const n of [1,2,3]) { used.add(`land.how${n}`); used.add(`land.how${n}d`); }
for (const n of [1,2,3,4]) { used.add(`land.q${n}`); used.add(`land.a${n}`); }
for (const r of ["24h","7d","30d","90d"]) used.add(`range.${r}`);
for (const o of ["android","ios","windows","macos","linux"]) used.add(`apps.os.${o}`);
// entity configs + settings schema
const ec = await import(path.join(root, "src/lib/entity-configs.ts"));
const ss = await import(path.join(root, "src/lib/settings-schema.ts"));
for (const c of Object.values(ec.CONFIGS)) {
  for (const col of c.columns) used.add(col.label || `c.${col.key}`);
  for (const fd of c.fields) used.add(fd.label || `c.${fd.key}`);
  if (c.refs) for (const r of Object.values(c.refs)) if (r.none) used.add(r.none);
}
for (const p of Object.values(ss.PANELS)) for (const s of p.sections) {
  used.add(s.title); if (s.description) used.add(s.description);
  for (const f of s.fields) { used.add(f.label || `f.${f.key.split(".").pop()}`); }
}
let dict = {};
try { dict = { ...(await import(path.join(root, "src/i18n/dict-a.ts"))).A, ...(await import(path.join(root, "src/i18n/dict-b.ts"))).B, ...(await import(path.join(root, "src/i18n/dict-c.ts"))).C }; } catch (e) { console.log(String(e)); }
const need = [...used].filter((k) => !optional.test(k)).sort();
const missing = need.filter((k) => !dict[k]);
if (process.argv.includes("--list")) console.log(need.join("\n"));
console.log(`used=${need.length} dict=${Object.keys(dict).length} missing=${missing.length}`);
if (missing.length && !process.argv.includes("--list")) console.log(missing.join("\n"));
// check completeness of translations
let bad = 0;
for (const [k, v] of Object.entries(dict)) if (!Array.isArray(v) || v.length !== 4 || v.some((x) => !x)) { console.log("BAD ENTRY", k); bad++; }
process.exit(missing.length || bad ? 1 : 0);
