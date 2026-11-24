"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import DataTable, { type ColDef } from "@/components/DataTable";
import { Btn, Card, CodeModal, CopyBtn, Field, Modal, Toggle, api, toast, useFetch } from "@/components/ui";
import type { ActionDef, EntityConfig, FieldDef } from "@/lib/entity-configs";

const GB = 1024 * 1024 * 1024;

function toCsv(rows: any[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== "object" || rows[0][k] === null || rows[0][k] instanceof Date);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export default function EntityManager({ config }: { config: EntityConfig }) {
  const { t, tr } = useI18n();
  const { data, loading, reload } = useFetch<any[]>(`/api/admin/${config.entity}`, { interval: config.poll });
  const [refData, setRefData] = useState<Record<string, any[]>>({});
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [editId, setEditId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const [text, setText] = useState<{ title: string; body: string } | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: any } | null>(null);
  const [pending, setPending] = useState<{ act: ActionDef; row: any; value: string } | null>(null);

  const refEntities = useMemo(() => Array.from(new Set(Object.values(config.refs || {}).map((r) => r.entity))), [config.refs]);
  useEffect(() => {
    refEntities.forEach(async (e) => {
      const r = await fetch(`/api/admin/${e}`);
      if (r.ok) {
        const j = await r.json();
        setRefData((p) => ({ ...p, [e]: j }));
      }
    });
  }, [refEntities]);

  const refLabel = useCallback(
    (key: string, id: any) => {
      const r = config.refs?.[key];
      if (!r) return String(id ?? "—");
      if (id === null || id === undefined || id === "") return r.none ? t(r.none) : "—";
      const row = refData[r.entity]?.find((x: any) => x.id === id);
      return row ? String(row[r.label]) : `#${id}`;
    },
    [config.refs, refData, t]
  );

  const columns: ColDef[] = useMemo(
    () =>
      config.columns.map((c) =>
        config.refs?.[c.key] && !c.render ? { ...c, render: (row: any) => refLabel(c.key, row[c.key]), sortValue: (row: any) => refLabel(c.key, row[c.key]) } : c
      ),
    [config.columns, config.refs, refLabel]
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...(config.defaults || {}) });
  };
  const openEdit = (row: any) => {
    setEditId(row.id);
    const f: Record<string, any> = {};
    for (const fd of config.fields) {
      let v = row[fd.key];
      if (fd.type === "date" && v) v = String(v).slice(0, 10);
      if (fd.type === "json") v = JSON.stringify(v && typeof v === "object" ? v : {}, null, 2);
      if (v === null || v === undefined) v = fd.type === "bool" ? false : fd.type === "multiselect" ? [] : "";
      f[fd.key] = v;
    }
    setForm(f);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const payload: Record<string, any> = {};
    for (const fd of config.fields) {
      if (fd.showIf && !fd.showIf(form)) continue;
      if (fd.type === "password" && !form[fd.key]) continue;
      if (fd.type === "json") {
        try {
          const parsed = JSON.parse(String(form[fd.key] || "{}"));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
          payload[fd.key] = parsed;
        } catch {
          setSaving(false);
          toast(t("err.invalid_json"), "err");
          return;
        }
      } else payload[fd.key] = form[fd.key];
    }
    const r = await api<any>(`/api/admin/${config.entity}${editId !== null ? `/${editId}` : ""}`, editId !== null ? "PATCH" : "POST", payload);
    setSaving(false);
    if (!r.ok) return toast(tr(`err.${r.data.error}`, r.data.error || t("common.error")), "err");
    toast(t("common.saved"));
    setForm(null);
    if (r.data.generatedPassword) setCreated({ username: r.data.username, password: r.data.generatedPassword });
    void reload();
  };

  const remove = async () => {
    if (!del) return;
    const r = await api(`/api/admin/${config.entity}/${del.id}`, "DELETE");
    setDel(null);
    if (!r.ok) return toast(tr(`err.${(r.data as any).error}`, t("common.error")), "err");
    toast(t("common.deleted"));
    void reload();
  };

  const runAction = async (act: ActionDef, row: any, extra?: Record<string, any>) => {
    const r = await api<any>(`/api/admin/actions/${act.action}`, "POST", { ...(act.payload || {}), [act.idKey || "id"]: row.id, ...extra });
    if (!r.ok) return toast(tr(`err.${r.data.error}`, r.data.error || t("common.error")), "err");
    if (r.data.text) setText({ title: t(act.label), body: r.data.text });
    else toast(t("common.done"));
    void reload();
  };

  const onAction = async (act: ActionDef, row: any) => {
    setMenu(null);
    if (act.client) {
      const token = row.subToken;
      if (!token) return;
      const resolved = await fetch("/api/admin/subscription-origin", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null) as { origin?: string } | null;
      const origin = resolved?.origin || window.location.origin;
      const url = `${origin}/sub/${token}`;
      if (act.client === "open-sub") window.open(`${origin}/s/${token}`, "_blank", "noopener,noreferrer");
      else {
        try {
          await navigator.clipboard.writeText(url);
        } catch {}
        toast(t("common.copied"));
      }
      return;
    }
    if (act.prompt || act.confirm) return setPending({ act, row, value: act.prompt?.default || "" });
    void runAction(act, row);
  };

  const setF = (k: string, v: any) => setForm((f) => ({ ...(f || {}), [k]: v }));

  const renderField = (fd: FieldDef) => {
    const v = form?.[fd.key];
    const ref = config.refs?.[fd.key];
    if (fd.type === "bool") return <div className="pt-1"><Toggle checked={!!v} onChange={(x) => setF(fd.key, x)} /></div>;
    if (fd.type === "textarea" || fd.type === "json") return <textarea className={`input ${fd.type === "json" ? "font-mono text-xs" : ""}`} rows={fd.rows || (fd.type === "json" ? 6 : 3)} value={v ?? (fd.type === "json" ? "{}" : "")} onChange={(e) => setF(fd.key, e.target.value)} dir={fd.type === "json" ? "ltr" : undefined} />;
    if (fd.type === "multiselect")
      return (
        <div className="flex flex-wrap gap-1.5">
          {(fd.options || []).map((o) => {
            const val = typeof o === "string" ? o : String(o.value);
            const on = (v || []).includes(val);
            return (
              <button type="button" key={val} onClick={() => setF(fd.key, on ? (v || []).filter((x: string) => x !== val) : [...(v || []), val])} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${on ? "border-transparent bg-accent text-white" : "border-line bg-card2 text-muted"}`}>
                {tr(`o.${val}`, val)}
              </button>
            );
          })}
        </div>
      );
    if (fd.type === "select") {
      const opts: { value: string | number; label: string }[] = ref
        ? [{ value: "", label: ref.none ? t(ref.none) : "—" }, ...(refData[ref.entity] || []).map((x: any) => ({ value: x.id, label: String(x[ref.label]) }))]
        : (fd.optionsByForm?.(form) || fd.options || []).map((o) => (typeof o === "string" ? { value: o, label: o === "" ? "—" : tr(`o.${o}`, o) } : o));
      return (
        <select className="input" value={v ?? ""} onChange={(e) => setF(fd.key, ref ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}>
          {opts.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (fd.type === "gb")
      return <input className="input" type="number" min={0} step="0.5" value={v === "" || v === undefined ? "" : Number((Number(v) / GB).toFixed(2))} onChange={(e) => setF(fd.key, e.target.value === "" ? 0 : Math.round(Number(e.target.value) * GB))} />;
    if (fd.type === "date") return <input className="input" type="date" value={v ? String(v).slice(0, 10) : ""} onChange={(e) => setF(fd.key, e.target.value)} />;
    return <input className="input" type={fd.type === "number" ? "number" : fd.type === "password" ? "password" : "text"} step={fd.step} autoComplete="off" value={v ?? ""} onChange={(e) => setF(fd.key, fd.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />;
  };

  const rows = data || [];
  const visibleActions = (row: any) => (config.actions || []).filter((a) => !a.showIf || a.showIf(row));

  return (
    <Card pad={false} title={t(config.title)} action={!config.noCreate && <Btn variant="primary" size="sm" onClick={openCreate}>＋ {t("common.add")}</Btn>}>
      <DataTable
        rows={rows}
        columns={columns}
        searchKeys={config.search}
        filters={config.filters}
        pageSize={config.pageSize || 10}
        loading={loading}
        toolbar={config.exportable && rows.length ? (
          <Btn size="sm" onClick={() => {
            const blob = new Blob([toCsv(rows)], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${config.entity}.csv`;
            a.click();
          }}>⇩ CSV</Btn>
        ) : undefined}
        actions={config.noEdit && config.noDelete && !config.actions ? undefined : (row) => (
          <div className="flex items-center justify-end gap-1">
            {!config.noEdit && <Btn size="sm" onClick={() => openEdit(row)} title={t("common.edit")}>✎</Btn>}
            {visibleActions(row).length > 0 && (
              <Btn size="sm" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: b.right, y: b.bottom + 4, row }); }}>⋯</Btn>
            )}
            {!config.noDelete && <Btn size="sm" variant="danger" onClick={() => setDel(row)} title={t(config.deleteLabel || "common.delete")}>{config.deleteLabel ? "⏻" : "🗑"}</Btn>}
          </div>
        )}
      />

      {menu && (
        <div className="fixed inset-0 z-[80]" onClick={() => setMenu(null)}>
          <div className="card fade-in absolute min-w-[190px] overflow-hidden py-1" style={{ top: Math.min(menu.y, window.innerHeight - 260), left: Math.max(8, Math.min(menu.x - 190, window.innerWidth - 200)) }}>
            {visibleActions(menu.row).map((a) => (
              <button key={a.key} className={`block w-full px-4 py-2 text-start text-sm hover:bg-card2 ${a.danger ? "text-bad" : ""}`} onClick={() => void onAction(a, menu.row)}>
                {t(a.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={editId !== null ? t("common.edit") : t("common.add")}
        wide
        footer={<><Btn onClick={() => setForm(null)}>{t("common.cancel")}</Btn><Btn variant="primary" loading={saving} onClick={save}>{t("common.save")}</Btn></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {form && config.fields.filter((fd) => !fd.showIf || fd.showIf(form)).map((fd) => (
            <Field key={fd.key} label={<>{t(fd.label || `c.${fd.key}`)}{fd.required && " *"}</>} hint={fd.hint ? t(fd.hint) : undefined} className={fd.full || fd.type === "textarea" || fd.type === "json" || fd.type === "multiselect" ? "sm:col-span-2" : ""}>
              {renderField(fd)}
            </Field>
          ))}
        </div>
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title={t(config.deleteLabel || "common.delete")} footer={<><Btn onClick={() => setDel(null)}>{t("common.cancel")}</Btn><Btn variant="danger" onClick={remove}>{t(config.deleteLabel || "common.delete")}</Btn></>}>
        <p className="text-sm">{t("confirm.delete")}</p>
      </Modal>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? t(pending.act.label) : ""}
        footer={<><Btn onClick={() => setPending(null)}>{t("common.cancel")}</Btn><Btn variant="primary" onClick={() => { const p = pending!; setPending(null); void runAction(p.act, p.row, p.act.prompt ? { [p.act.prompt.key]: p.value } : undefined); }}>{t("common.confirm")}</Btn></>}
      >
        {pending?.act.confirm && <p className="mb-3 text-sm">{t(pending.act.confirm)}</p>}
        {pending?.act.prompt && (
          <Field label={t(pending.act.prompt.label)}>
            <input className="input" value={pending.value} onChange={(e) => setPending({ ...pending, value: e.target.value })} />
          </Field>
        )}
      </Modal>

      {text && <CodeModal open onClose={() => setText(null)} title={text.title} text={text.body} />}

      <Modal open={!!created} onClose={() => setCreated(null)} title={t("users.created")} footer={<Btn variant="primary" onClick={() => setCreated(null)}>{t("common.close")}</Btn>}>
        {created && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">{t("users.createdHint")}</p>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-card2 p-3"><span>{t("c.username")}</span><code>{created.username}</code><CopyBtn text={created.username} /></div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-card2 p-3"><span>{t("c.password")}</span><code>{created.password}</code><CopyBtn text={created.password} /></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
