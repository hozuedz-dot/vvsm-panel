"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { Badge, Spinner, StatusBadge } from "@/components/ui";
import { PROTOCOL_COLORS, flag, formatBytes, formatDate, formatMoney, formatNumber, formatRate } from "@/lib/format";

export type ColType = "text" | "number" | "bytes" | "money" | "date" | "datetime" | "badge" | "bool" | "protocol" | "mono" | "percent" | "rate" | "country";
export type ColDef = {
  key: string;
  label?: string;
  type?: ColType;
  sortable?: boolean;
  render?: (row: any) => ReactNode;
  sortValue?: (row: any) => string | number;
  align?: "start" | "end";
};
export type FilterDef = { key: string; label: string; options: (string | { value: string; label: string })[] };

export function CellValue({ col, row }: { col: ColDef; row: any }) {
  const { tr } = useI18n();
  if (col.render) return <>{col.render(row)}</>;
  const v = row[col.key];
  switch (col.type) {
    case "number": return <span dir="ltr" className="inline-block">{formatNumber(v)}</span>;
    case "bytes": return <span dir="ltr" className="inline-block">{formatBytes(v)}</span>;
    case "rate": return <span dir="ltr" className="inline-block">{formatRate(v)}</span>;
    case "money": return <span dir="ltr" className="inline-block">{formatMoney(v)}</span>;
    case "percent": return <span dir="ltr" className="inline-block">{Number(v || 0).toFixed(0)}%</span>;
    case "date": return <span dir="ltr" className="inline-block">{formatDate(v)}</span>;
    case "datetime": return <span dir="ltr" className="inline-block">{formatDate(v, true)}</span>;
    case "badge": return <StatusBadge status={String(v)} />;
    case "bool": return <Badge tone={v ? "green" : "gray"}>{v ? "✓" : "—"}</Badge>;
    case "mono": return <code className="rounded bg-card2 px-1.5 py-0.5 text-[11px]">{String(v ?? "")}</code>;
    case "country": return <>{flag(String(v))} {String(v)}</>;
    case "protocol": {
      const p = String(v);
      return (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: PROTOCOL_COLORS[p] || "#94a3b8" }} />
          {tr(`o.${p}`, p)}
        </span>
      );
    }
    default: return <>{v === null || v === undefined || v === "" ? "—" : tr(`o.${v}`, String(v))}</>;
  }
}

export default function DataTable({
  rows,
  columns,
  searchKeys = [],
  filters = [],
  pageSize = 10,
  actions,
  loading,
  toolbar,
  onRowClick,
}: {
  rows: any[];
  columns: ColDef[];
  searchKeys?: string[];
  filters?: FilterDef[];
  pageSize?: number;
  actions?: (row: any) => ReactNode;
  loading?: boolean;
  toolbar?: ReactNode;
  onRowClick?: (row: any) => void;
}) {
  const { t, tr } = useI18n();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [fv, setFv] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    let r = rows;
    const s = q.trim().toLowerCase();
    if (s && searchKeys.length) r = r.filter((x) => searchKeys.some((k) => String(x[k] ?? "").toLowerCase().includes(s)));
    for (const [k, v] of Object.entries(fv)) if (v) r = r.filter((x) => String(x[k]) === v);
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = (x: any) => (col?.sortValue ? col.sortValue(x) : x[sort.key]);
      r = [...r].sort((a, b) => {
        const A = val(a);
        const B = val(b);
        if (A === B) return 0;
        if (A === null || A === undefined) return 1;
        if (B === null || B === undefined) return -1;
        const ta = typeof A === "string" && isNaN(Date.parse(A)) ? 0 : 1;
        void ta;
        return (typeof A === "number" && typeof B === "number" ? A - B : String(A).localeCompare(String(B), undefined, { numeric: true })) * sort.dir;
      });
    }
    return r;
  }, [rows, q, fv, sort, searchKeys, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        {searchKeys.length > 0 && (
          <input className="input !w-full sm:!w-56" placeholder={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        )}
        {filters.map((f) => (
          <select key={f.key} className="input !w-auto" value={fv[f.key] || ""} onChange={(e) => { setFv({ ...fv, [f.key]: e.target.value }); setPage(0); }}>
            <option value="">{tr(f.label, f.label)} · {t("common.all")}</option>
            {f.options.map((o) => {
              const v = typeof o === "string" ? o : o.value;
              const l = typeof o === "string" ? tr(`o.${o}`, tr(`s.${o}`, o)) : o.label;
              return <option key={v} value={v}>{l}</option>;
            })}
          </select>
        ))}
        <div className="ms-auto flex items-center gap-2">
          {loading && <Spinner />}
          <span className="text-xs text-muted">{t("common.rows", { n: filtered.length })}</span>
          {toolbar}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={sortable ? "cursor-pointer hover:text-ink" : ""} onClick={() => sortable && setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
                    {t(c.label || `c.${c.key}`)}
                    {active && <span className="ms-1 text-accent">{sort!.dir === 1 ? "▲" : "▼"}</span>}
                  </th>
                );
              })}
              {actions && <th />}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={row.id ?? i} className={onRowClick ? "cursor-pointer" : ""} onClick={() => onRowClick?.(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "end" ? "text-end" : ""}>
                    <CellValue col={c} row={row} />
                  </td>
                ))}
                {actions && <td className="text-end" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
              </tr>
            ))}
            {!slice.length && (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="!py-10 text-center text-muted">
                  {loading ? t("common.loading") : t("common.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs sm:px-5">
          <span className="text-muted">{t("common.page", { a: cur + 1, b: pages })}</span>
          <div className="flex gap-1.5">
            <button className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹</button>
            <button className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
