"use client";
import { useEffect, useId, useRef, useState, type MouseEvent, type TouchEvent } from "react";

export function useTween(target: number[], dur = 650) {
  const [vals, setVals] = useState<number[]>(target);
  const cur = useRef<number[]>(target);
  const key = target.join(",");
  useEffect(() => {
    const from = target.map((_, i) => cur.current[i] ?? 0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const next = target.map((t, i) => from[i] + (t - from[i]) * e);
      cur.current = next;
      setVals(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dur]);
  return vals.length === target.length ? vals : target;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setW(Math.max(220, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(220, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

type Series = { name: string; color: string; data: number[] };
const PAD = { l: 50, r: 12, t: 12, b: 26 };

function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function Tip({ x, w, label, rows }: { x: number; w: number; label: string; rows: { name: string; color: string; text: string }[] }) {
  const flip = x > w / 2;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-[130px] rounded-xl border border-line bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: x, transform: `translateX(${flip ? "calc(-100% - 12px)" : "12px"})`, transition: "left .08s linear" }}
      dir="ltr"
    >
      <div className="mb-1 font-semibold text-muted">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
            {r.name}
          </span>
          <b>{r.text}</b>
        </div>
      ))}
    </div>
  );
}

function Axes({ w, h, yMax, fmt, labels, ticks }: { w: number; h: number; yMax: number; fmt: (n: number) => string; labels: string[]; ticks: number[] }) {
  const innerW = w - PAD.l - PAD.r;
  const innerH = h - PAD.t - PAD.b;
  const n = labels.length;
  return (
    <g fontSize="10.5" fill="currentColor" className="text-muted">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.t + innerH - f * innerH;
        return (
          <g key={f}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray={f === 0 ? "" : "3 4"} />
            <text x={PAD.l - 8} y={y + 3.5} textAnchor="end">
              {fmt(yMax * f)}
            </text>
          </g>
        );
      })}
      {ticks.map((i) => (
        <text key={i} x={PAD.l + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))} y={h - 7} textAnchor="middle">
          {labels[i]}
        </text>
      ))}
    </g>
  );
}

const tickIdx = (n: number, w: number) => {
  const count = Math.max(2, Math.min(n, Math.floor((w - PAD.l - PAD.r) / 84)));
  return Array.from(new Set(Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, count - 1)))));
};

export function LineChart({ labels, series, height = 250, fmt = (n) => String(Math.round(n)), area = true }: { labels: string[]; series: Series[]; height?: number; fmt?: (n: number) => string; area?: boolean }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const n = labels.length;
  const flat = useTween(series.flatMap((s) => s.data));
  const targetMax = Math.max(1, ...series.flatMap((s) => s.data));
  const [yMax] = useTween([niceMax(targetMax * 1.05)]);
  const anim = series.map((_, si) => flat.slice(si * n, (si + 1) * n));
  const innerW = w - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const X = (i: number) => PAD.l + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const Y = (v: number) => PAD.t + innerH - (v / (yMax || 1)) * innerH;
  const move = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const idx = Math.round(((clientX - r.left - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };
  return (
    <div ref={ref} className="relative w-full select-none" dir="ltr">
      <svg
        width={w}
        height={height}
        onMouseMove={(e: MouseEvent<SVGSVGElement>) => move(e.clientX, e.currentTarget)}
        onTouchMove={(e: TouchEvent<SVGSVGElement>) => move(e.touches[0].clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity=".28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        <Axes w={w} h={height} yMax={yMax} fmt={fmt} labels={labels} ticks={tickIdx(n, w)} />
        {anim.map((d, si) => {
          const pts = d.map((v, i) => [X(i), Y(v)] as [number, number]);
          const line = smooth(pts);
          return (
            <g key={si}>
              {area && pts.length > 1 && <path d={`${line} L${X(n - 1)},${PAD.t + innerH} L${X(0)},${PAD.t + innerH} Z`} fill={`url(#${gid}${si})`} />}
              <path d={line} fill="none" stroke={series[si].color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--muted)" strokeDasharray="3 3" opacity=".6" />
            {anim.map((d, si) => (
              <circle key={si} cx={X(hover)} cy={Y(d[hover] ?? 0)} r="4.5" fill="var(--card)" stroke={series[si].color} strokeWidth="2.5" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && <Tip x={X(hover)} w={w} label={labels[hover]} rows={series.map((s) => ({ name: s.name, color: s.color, text: fmt(s.data[hover] ?? 0) }))} />}
    </div>
  );
}

export function BarChart({ labels, series, height = 250, fmt = (n) => String(Math.round(n)), stacked = false }: { labels: string[]; series: Series[]; height?: number; fmt?: (n: number) => string; stacked?: boolean }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const flat = useTween(series.flatMap((s) => s.data));
  const anim = series.map((_, si) => flat.slice(si * n, (si + 1) * n));
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.data[i] || 0), 0) : Math.max(...series.map((s) => s.data[i] || 0))));
  const [yMax] = useTween([niceMax(Math.max(1, ...totals) * 1.05)]);
  const innerW = w - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const slot = innerW / Math.max(1, n);
  const gap = Math.min(10, slot * 0.25);
  const groupW = Math.max(2, slot - gap);
  const barW = stacked ? groupW : groupW / series.length;
  const Y = (v: number) => (v / (yMax || 1)) * innerH;
  const cx = (i: number) => PAD.l + slot * i + slot / 2;
  const ticks = (() => {
    const count = Math.max(2, Math.min(n, Math.floor(innerW / 70)));
    return Array.from(new Set(Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, count - 1)))));
  })();
  return (
    <div ref={ref} className="relative w-full select-none" dir="ltr">
      <svg
        width={w}
        height={height}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - PAD.l) / slot))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <g fontSize="10.5" fill="currentColor" className="text-muted">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = PAD.t + innerH - f * innerH;
            return (
              <g key={f}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray={f === 0 ? "" : "3 4"} />
                <text x={PAD.l - 8} y={y + 3.5} textAnchor="end">
                  {fmt(yMax * f)}
                </text>
              </g>
            );
          })}
          {ticks.map((i) => (
            <text key={i} x={cx(i)} y={height - 7} textAnchor="middle">
              {labels[i]}
            </text>
          ))}
        </g>
        {hover !== null && <rect x={PAD.l + slot * hover} y={PAD.t} width={slot} height={innerH} fill="var(--accent)" opacity=".07" rx="6" />}
        {labels.map((_, i) => {
          let acc = 0;
          return anim.map((d, si) => {
            const h = Y(d[i] || 0);
            const x = stacked ? cx(i) - barW / 2 : cx(i) - groupW / 2 + si * barW;
            const y = PAD.t + innerH - h - (stacked ? Y(acc) : 0);
            if (stacked) acc += d[i] || 0;
            return <rect key={`${i}-${si}`} x={x} y={y} width={Math.max(1, barW - (stacked ? 0 : 1.5))} height={Math.max(0, h)} rx={Math.min(5, barW / 2)} fill={series[si].color} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity .15s" }} />;
          });
        })}
      </svg>
      {hover !== null && <Tip x={cx(hover)} w={w} label={labels[hover]} rows={series.map((s) => ({ name: s.name, color: s.color, text: fmt(s.data[hover] ?? 0) }))} />}
    </div>
  );
}

export function Donut({ data, size = 190, thickness = 24, fmt = (n) => String(Math.round(n)), centerLabel, centerValue }: { data: { name: string; value: number; color: string }[]; size?: number; thickness?: number; fmt?: (n: number) => string; centerLabel?: string; centerValue?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const vals = useTween(data.map((d) => d.value));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const realTotal = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - thickness - 8) / 2;
  const C = 2 * Math.PI * r;
  const offsets = vals.map((_, i) => vals.slice(0, i).reduce((sum, value) => sum + value, 0));
  const hv = hover !== null ? data[hover] : null;
  return (
    <div className="@container w-full" dir="ltr">
    <div className="flex flex-col items-center gap-4 @sm:flex-row @sm:items-center @sm:gap-6">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        onMouseMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          setMouse({ x: e.clientX - b.left, y: e.clientY - b.top });
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card2)" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = Math.max(0, (vals[i] / total) * C - (data.length > 1 ? 2.5 : 0));
             const off = (offsets[i] / total) * C;
            return (
              <circle
                key={d.name}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={hover === i ? thickness + 6 : thickness}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-off}
                strokeLinecap="butt"
                opacity={hover === null || hover === i ? 1 : 0.4}
                style={{ transition: "stroke-width .18s, opacity .18s", cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-[60%] truncate text-[11px] font-medium text-muted">{hv ? hv.name : centerLabel}</span>
          <span className="text-lg font-extrabold">{hv ? fmt(hv.value) : centerValue ?? fmt(realTotal)}</span>
          {hv && <span className="text-[11px] font-semibold" style={{ color: hv.color }}>{((hv.value / realTotal) * 100).toFixed(1)}%</span>}
        </div>
        {hv && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-lg" style={{ left: mouse.x + 12, top: mouse.y + 12 }}>
            <i className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: hv.color }} />
            {hv.name}: <b>{fmt(hv.value)}</b> ({((hv.value / realTotal) * 100).toFixed(1)}%)
          </div>
        )}
      </div>
      <ul className="grid w-full min-w-0 flex-1 gap-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`flex cursor-default items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors ${hover === i ? "bg-card2" : ""}`}>
            <span className="flex min-w-0 items-center gap-2">
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {fmt(d.value)} <span className="font-normal text-muted">· {((d.value / realTotal) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

export function Sparkline({ data, color = "var(--accent)", height = 38 }: { data: number[]; color?: string; height?: number }) {
  const gid = useId().replace(/:/g, "");
  const vals = useTween(data);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const n = vals.length;
  if (n < 2) return <div style={{ height }} />;
  const pts = vals.map((v, i) => [(i / (n - 1)) * 100, height - 3 - ((v - min) / (max - min || 1)) * (height - 8)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

export function Gauge({ value, label, color = "var(--accent)", sub }: { value: number; label: string; color?: string; sub?: string }) {
  const [v] = useTween([Math.max(0, Math.min(100, value))], 500);
  const r = 44;
  const C = Math.PI * r;
  return (
    <div className="flex flex-col items-center" dir="ltr">
      <svg width="130" height="78" viewBox="0 0 110 66">
        <path d="M11 55a44 44 0 0188 0" fill="none" stroke="var(--card2)" strokeWidth="10" strokeLinecap="round" />
        <path d="M11 55a44 44 0 0188 0" fill="none" stroke={v > 90 ? "var(--bad)" : v > 75 ? "var(--warn)" : color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} />
        <text x="55" y="52" textAnchor="middle" fontSize="19" fontWeight="800" fill="currentColor">
          {v.toFixed(0)}%
        </text>
      </svg>
      <div className="-mt-1 text-xs font-semibold">{label}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
