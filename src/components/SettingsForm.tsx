"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Btn, Card, Field, Spinner, Toggle, api, toast } from "@/components/ui";
import { PANELS, type SField } from "@/lib/settings-schema";

const getPath = (o: any, p: string) => p.split(".").reduce((a, k) => (a === undefined || a === null ? a : a[k]), o);
const setPath = (o: any, p: string, v: any) => {
  const ks = p.split(".");
  const out = { ...o };
  let cur = out;
  ks.forEach((k, i) => {
    if (i === ks.length - 1) cur[k] = v;
    else {
      cur[k] = { ...(cur[k] || {}) };
      cur = cur[k];
    }
  });
  return out;
};

export default function SettingsForm({ panel, onSaved }: { panel: string; onSaved?: (v: any) => void }) {
  const { t, tr } = useI18n();
  const cfg = PANELS[panel];
  const [vals, setVals] = useState<any>(null);
  const [orig, setOrig] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setVals(null);
    fetch(`/api/admin/settings/${cfg.group}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) window.location.href = "/admin/login";
        return r.json();
      })
      .then((j) => {
        if (alive) {
          setVals(j);
          setOrig(JSON.stringify(j));
        }
      });
    return () => {
      alive = false;
    };
  }, [cfg.group]);

  if (!vals)
    return (
      <div className="flex justify-center p-10 text-muted">
        <Spinner />
      </div>
    );

  const dirty = JSON.stringify(vals) !== orig;
  const save = async () => {
    setSaving(true);
    const r = await api(`/api/admin/settings/${cfg.group}`, "PUT", vals);
    setSaving(false);
    if (!r.ok) return toast(t("common.error"), "err");
    setOrig(JSON.stringify(vals));
    toast(t("common.saved"));
    onSaved?.(r.data);
  };

  const input = (f: SField) => {
    const v = getPath(vals, f.key);
    const set = (x: any) => setVals((p: any) => setPath(p, f.key, x));
    switch (f.type) {
      case "bool":
        return <div className="pt-1"><Toggle checked={!!v} onChange={set} /></div>;
      case "textarea":
        return <textarea className="input" rows={f.rows || 3} value={v ?? ""} onChange={(e) => set(e.target.value)} />;
      case "number":
        return <input className="input" type="number" value={v ?? 0} onChange={(e) => set(e.target.value === "" ? 0 : Number(e.target.value))} />;
      case "select":
        return (
          <select className="input" value={v ?? ""} onChange={(e) => set(e.target.value)}>
            {(f.options || []).map((o) => <option key={o} value={o}>{tr(`o.${o}`, o)}</option>)}
          </select>
        );
      case "multiselect":
        return (
          <div className="flex flex-wrap gap-1.5">
            {(f.options || []).map((o) => {
              const on = (v || []).includes(o);
              return (
                <button type="button" key={o} onClick={() => set(on ? (v || []).filter((x: string) => x !== o) : [...(v || []), o])} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${on ? "border-transparent bg-accent text-white" : "border-line bg-card2 text-muted"}`}>
                  {o}
                </button>
              );
            })}
          </div>
        );
      case "secret":
        return (
          <div className="flex gap-1.5">
            <input className="input" type={reveal[f.key] ? "text" : "password"} autoComplete="new-password" value={v ?? ""} onChange={(e) => set(e.target.value)} />
            <button type="button" className="btn !px-2.5" onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}>{reveal[f.key] ? "🙈" : "👁"}</button>
          </div>
        );
      default:
        return <input className="input" value={v ?? ""} onChange={(e) => set(e.target.value)} />;
    }
  };

  return (
    <div className="space-y-4">
      {cfg.sections.map((s) => (
        <Card key={s.title} title={t(s.title)}>
          {s.description && <p className="-mt-1 mb-4 text-xs text-muted">{t(s.description)}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.fields
              .filter((f) => !f.showIf || f.showIf(vals))
              .map((f) => (
                <Field
                  key={f.key}
                  label={t(f.label || `f.${f.key.split(".").pop()}`)}
                  hint={f.hint ? t(f.hint, { url: typeof window !== "undefined" ? `${window.location.origin}/api/pay/nowpayments/ipn` : "" }) : undefined}
                  className={f.full || f.type === "textarea" || f.type === "multiselect" ? "sm:col-span-2 lg:col-span-3" : ""}
                >
                  {input(f)}
                </Field>
              ))}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-3 z-10 flex justify-end">
        <div className="card flex items-center gap-3 px-3 py-2">
          {dirty && <span className="text-xs text-warn">● {t("common.unsaved")}</span>}
          <Btn variant="primary" loading={saving} disabled={!dirty} onClick={save}>{t("common.save")}</Btn>
        </div>
      </div>
    </div>
  );
}
