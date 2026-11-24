"use client";
import { useEffect, useState } from "react";

export default function Countdown({ until, fa }: { until: string; fa: boolean }) {
  const end = Date.parse(until);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(end) || now === null) return null;
  const left = Math.max(0, end - now);
  if (left === 0) return <p className="mt-6 text-sm font-semibold text-ok">{fa ? "به‌زودی… صفحه را تازه کنید" : "Almost done — refresh the page"}</p>;
  const parts = [Math.floor(left / 3600000), Math.floor((left % 3600000) / 60000), Math.floor((left % 60000) / 1000)];
  const labels = fa ? ["ساعت", "دقیقه", "ثانیه"] : ["hours", "min", "sec"];
  return (
    <div className="mt-6 flex justify-center gap-3" dir="ltr">
      {parts.map((v, i) => (
        <div key={i} className="min-w-16 rounded-2xl bg-card2 px-3 py-2">
          <div className="text-2xl font-extrabold tabular-nums">{String(v).padStart(2, "0")}</div>
          <div className="text-[10px] text-muted">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}
